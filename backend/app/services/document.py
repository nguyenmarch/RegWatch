import asyncio
import logging
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import DocumentStatus
from app.core.minio_client import get_minio_client
from app.models.document import Document
from app.services.chunker import split_legal_document
from app.services.neo4j_service import build_document_graph
from app.services.parser import parse_document
from app.services.qdrant_service import upsert_document_chunks
from app.utils.text_processor import clean_legal_text

logger = logging.getLogger(__name__)


class DocumentService:
    async def create_pending_document(self, db: AsyncSession, filename: str) -> Document:
        doc = Document(
            title=Path(filename).stem,
            file_path=None,
            status=DocumentStatus.PENDING,
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        return doc

    async def attach_stored_file(self, db: AsyncSession, doc_id: int, object_key: str) -> None:
        await db.execute(
            update(Document).where(Document.id == doc_id).values(file_path=object_key)
        )
        await db.commit()

    async def get_document(self, db: AsyncSession, doc_id: int) -> Document | None:
        result = await db.execute(select(Document).where(Document.id == doc_id))
        return result.scalar_one_or_none()

    async def pipeline_process_and_embed_law(
        self, doc_id: int, filename: str, file_content: bytes
    ) -> None:
        from app.core.db import async_session_factory

        async with async_session_factory() as db:
            try:
                await self._update_status(db, doc_id, DocumentStatus.PROCESSING)
                logger.info("[Pipeline] Started - doc_id=%s, file=%s", doc_id, filename)

                raw_text = parse_document(filename, file_content)
                clean_text = clean_legal_text(raw_text)
                chunks = split_legal_document(clean_text)
                logger.info("[Pipeline] %s chunk(s) extracted - doc_id=%s", len(chunks), doc_id)

                title = Path(filename).stem
                await asyncio.to_thread(upsert_document_chunks, chunks, doc_id)
                logger.info("[Pipeline] Qdrant upsert done - doc_id=%s", doc_id)

                await asyncio.to_thread(build_document_graph, doc_id, title, chunks)
                logger.info("[Pipeline] Neo4j graph built - doc_id=%s", doc_id)

                await self._update_status(db, doc_id, DocumentStatus.COMPLETED)
                logger.info("[Pipeline] Completed successfully - doc_id=%s", doc_id)

            except Exception as exc:
                logger.error("[Pipeline] Failed - doc_id=%s: %s", doc_id, exc, exc_info=True)
                await self._update_status(db, doc_id, DocumentStatus.FAILED)

    async def _update_status(
        self, db: AsyncSession, doc_id: int, status: DocumentStatus
    ) -> None:
        await db.execute(
            update(Document).where(Document.id == doc_id).values(status=status.value)
        )
        await db.commit()

    async def get_all_documents(self, db: AsyncSession) -> list[Document]:
        result = await db.execute(select(Document).order_by(Document.created_at.desc()))
        return list(result.scalars().all())

    async def delete_document_pipeline(self, db: AsyncSession, doc_id: int) -> bool:
        try:
            doc = await self.get_document(db, doc_id)
            if doc is None:
                return False

            await asyncio.to_thread(self._delete_from_qdrant, doc_id)
            await asyncio.to_thread(self._delete_from_neo4j, doc_id)
            if doc.file_path:
                await asyncio.to_thread(self._delete_from_minio, doc.file_path)

            await db.execute(delete(Document).where(Document.id == doc_id))
            await db.commit()
            return True
        except Exception as exc:
            logger.error("[Delete] Failed for doc_id=%s: %s", doc_id, exc, exc_info=True)
            await db.rollback()
            return False

    def store_original_file(self, doc_id: int, filename: str, file_content: bytes) -> str:
        client = get_minio_client()
        ext = Path(filename).suffix.lower()
        object_key = f"documents/{doc_id}/{uuid4().hex}{ext}"
        client.put_object(
            bucket_name=settings.MINIO_BUCKET,
            object_name=object_key,
            data=BytesIO(file_content),
            length=len(file_content),
            content_type=self._content_type_for(filename),
            metadata={"original-filename": filename},
        )
        logger.info("[Storage] Original file stored - doc_id=%s, key=%s", doc_id, object_key)
        return object_key

    def open_original_file(self, object_key: str):
        client = get_minio_client()
        return client.get_object(settings.MINIO_BUCKET, object_key)

    def stat_original_file(self, object_key: str):
        client = get_minio_client()
        return client.stat_object(settings.MINIO_BUCKET, object_key)

    def _delete_from_qdrant(self, doc_id: int) -> None:
        from qdrant_client.models import FieldCondition, Filter, FilterSelector, MatchValue

        from app.core.qdrant_client import qdrant_client

        qdrant_client.delete(
            collection_name=settings.QDRANT_COLLECTION_NAME,
            points_selector=FilterSelector(
                filter=Filter(
                    must=[FieldCondition(key="document_id", match=MatchValue(value=doc_id))]
                )
            ),
        )
        logger.info("[Delete] Qdrant chunks removed - doc_id=%s", doc_id)

    def _delete_from_neo4j(self, doc_id: int) -> None:
        from app.core.neo4j_client import get_neo4j_driver

        driver = get_neo4j_driver()
        with driver.session() as session:
            session.run(
                "MATCH (d:Document {document_id: $doc_id}) "
                "OPTIONAL MATCH (d)-[:HAS_CLAUSE]->(c:Clause) "
                "DETACH DELETE d, c",
                doc_id=doc_id,
            )
        logger.info("[Delete] Neo4j nodes removed - doc_id=%s", doc_id)

    def _delete_from_minio(self, object_key: str) -> None:
        client = get_minio_client()
        try:
            client.remove_object(settings.MINIO_BUCKET, object_key)
            logger.info("[Delete] MinIO object removed - key=%s", object_key)
        except Exception as exc:
            logger.warning("[Delete] MinIO object skip - key=%s, error=%s", object_key, exc)

    @staticmethod
    def _content_type_for(filename: str) -> str:
        suffix = Path(filename).suffix.lower()
        if suffix == ".pdf":
            return "application/pdf"
        if suffix == ".docx":
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        if suffix == ".doc":
            return "application/msword"
        return "application/octet-stream"


document_service = DocumentService()
