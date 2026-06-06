from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import List
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.enums import DocumentStatus, KbType
from app.schemas.document import DocumentResponse
from app.services.document import document_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/documents", tags=["Documents"])

_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc"}
_MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    kb_type: KbType = Form(KbType.LAW),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename required.")

    ext = Path(file.filename).suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Unsupported format: {ext}")

    file_content = await file.read()
    if not file_content:
        raise HTTPException(status_code=400, detail="File is empty.")
    if len(file_content) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB).")

    # Create DB record immediately so caller gets an id to poll
    doc_record = await document_service.create_pending_document(db, file.filename, kb_type)

    # Upload original to MinIO (sync SDK — run off the event loop)
    try:
        object_key = await asyncio.to_thread(
            document_service.store_original_file,
            doc_record.id, file.filename, file_content,
        )
        await document_service.attach_stored_file(db, doc_record.id, object_key)
        doc_record.file_path = object_key
    except Exception as exc:
        logger.error("[Upload] MinIO failed — doc_id=%s: %s", doc_record.id, exc, exc_info=True)
        await document_service._update_status(db, doc_record.id, DocumentStatus.FAILED)
        raise HTTPException(status_code=500, detail="Failed to store file. Please try again.") from exc

    # Hand off to background pipeline; response returns immediately (202)
    background_tasks.add_task(
        document_service.pipeline_process_and_embed_law,
        doc_id=doc_record.id,
        filename=file.filename,
        file_content=file_content,
        kb_type=kb_type,
    )

    logger.info("[Upload] Queued pipeline — doc_id=%s", doc_record.id)
    return doc_record


@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    kb_type: KbType | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> List[DocumentResponse]:
    return await document_service.get_all_documents(db=db, kb_type=kb_type)


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: int, db: AsyncSession = Depends(get_db)) -> DocumentResponse:
    doc = await document_service.get_document(db=db, doc_id=doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found.")
    return doc


@router.get("/{doc_id}/log")
async def get_document_log(doc_id: int, db: AsyncSession = Depends(get_db)) -> list[dict]:
    entries = await document_service.get_log(db=db, doc_id=doc_id)
    if entries is None:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found.")
    return entries


@router.get("/{doc_id}/download")
async def download_document(doc_id: int, db: AsyncSession = Depends(get_db)) -> StreamingResponse:
    doc = await document_service.get_document(db=db, doc_id=doc_id)
    if not doc or not doc.file_path:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found.")
    try:
        file_obj = document_service.open_original_file(doc.file_path)
        stat = document_service.stat_original_file(doc.file_path)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Stored file not found.") from exc

    suffix = Path(doc.file_path).suffix
    encoded_name = quote(f"{doc.title}{suffix or '.bin'}")
    return StreamingResponse(
        _stream_minio(file_obj),
        media_type=getattr(stat, "content_type", "application/octet-stream"),
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}"},
    )


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_document(doc_id: int, db: AsyncSession = Depends(get_db)) -> None:
    success = await document_service.delete_document_pipeline(db=db, doc_id=doc_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found.")


def _stream_minio(response):
    try:
        yield from response.stream(32 * 1024)
    finally:
        response.close()
        response.release_conn()
