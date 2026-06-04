from pathlib import Path
from typing import List
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.enums import DocumentStatus
from app.schemas.document import DocumentResponse
from app.services.document import document_service

router = APIRouter(prefix="/v1/documents", tags=["Documents"])

_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc"}


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    ext = Path(file.filename).suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{ext}'. Accepted: {', '.join(_ALLOWED_EXTENSIONS)}",
        )

    file_content = await file.read()
    doc_record = await document_service.create_pending_document(db=db, filename=file.filename)

    try:
        object_key = document_service.store_original_file(
            doc_id=doc_record.id,
            filename=file.filename,
            file_content=file_content,
        )
        await document_service.attach_stored_file(db, doc_record.id, object_key)
        doc_record.file_path = object_key
    except Exception as exc:
        await document_service._update_status(db, doc_record.id, DocumentStatus.FAILED)
        raise HTTPException(status_code=500, detail=f"Failed to store document: {exc}") from exc

    background_tasks.add_task(
        document_service.pipeline_process_and_embed_law,
        doc_id=doc_record.id,
        filename=file.filename,
        file_content=file_content,
    )

    return doc_record


def _stream_minio_response(response):
    try:
        for chunk in response.stream(32 * 1024):
            yield chunk
    finally:
        response.close()
        response.release_conn()


def _download_filename(title: str, object_key: str | None) -> str:
    suffix = Path(object_key or "").suffix
    return f"{title}{suffix or '.bin'}"


@router.get("/{doc_id}/download")
async def download_document(doc_id: int, db: AsyncSession = Depends(get_db)) -> StreamingResponse:
    doc = await document_service.get_document(db=db, doc_id=doc_id)
    if doc is None or not doc.file_path:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found.")

    try:
        file_obj = document_service.open_original_file(doc.file_path)
        stat = document_service.stat_original_file(doc.file_path)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Stored file for document {doc_id} not found.") from exc

    filename = _download_filename(doc.title, doc.file_path)
    encoded = quote(filename)
    return StreamingResponse(
        _stream_minio_response(file_obj),
        media_type=stat.content_type or "application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


@router.get("", response_model=List[DocumentResponse])
async def list_documents(db: AsyncSession = Depends(get_db)) -> List[DocumentResponse]:
    return await document_service.get_all_documents(db=db)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(doc_id: int, db: AsyncSession = Depends(get_db)) -> None:
    success = await document_service.delete_document_pipeline(db=db, doc_id=doc_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document {doc_id} not found.",
        )
