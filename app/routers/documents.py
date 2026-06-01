from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.mysql_client import get_db
from app.repositories.document import create_document
from app.schemas.document import DocumentCreate
from app.services.ingestion import pipeline_process_and_embed_law

router = APIRouter(prefix="/documents", tags=["Documents"])


class IngestRequest(BaseModel):
    title: str
    raw_text: str
    file_path: Optional[str] = None


class IngestResponse(BaseModel):
    document_id: int
    status: str
    message: str


@router.post("/ingest", response_model=IngestResponse, status_code=202)
async def ingest_document(
    payload: IngestRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> IngestResponse:
    doc_schema = DocumentCreate(title=payload.title, file_path=payload.file_path)
    document = create_document(db, doc_schema)

    background_tasks.add_task(
        pipeline_process_and_embed_law,
        document_id=document.id,
        title=document.title,
        raw_text=payload.raw_text,
    )

    return IngestResponse(
        document_id=document.id,
        status="processing",
        message=f"Document '{document.title}' accepted. Processing started in background.",
    )
