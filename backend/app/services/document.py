import asyncio
import json
import logging
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import DocumentStatus, KbType
from app.core.minio_client import get_minio_client
from app.models.document import Document
from app.services.chunker import split_legal_document
from app.services.neo4j_service import build_document_graph
from app.services.parser import parse_document
from app.services.qdrant_service import upsert_document_chunks
from app.utils.text_processor import clean_legal_text

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class DocumentService:

    # ── Lifecycle ────────────────────────────────────────────

    async def create_pending_document(
        self, db: AsyncSession, filename: str, kb_type: KbType = KbType.LAW
    ) -> Document:
        doc = Document(
            title=Path(filename).stem,
            file_path=None,
            status=DocumentStatus.PENDING,
            kb_type=kb_type.value,
            processing_log=json.dumps([
                {"level": "info", "message": f"Document '{filename}' received.", "ts": _now_iso()}
            ]),
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

    # ── Pipeline ─────────────────────────────────────────────

    async def pipeline_process_and_embed_law(
        self, doc_id: int, filename: str, file_content: bytes, kb_type: KbType = KbType.LAW
    ) -> None:
        from app.core.db import async_session_factory

        async with async_session_factory() as db:
            try:
                await self._update_status(db, doc_id, DocumentStatus.PROCESSING)
                await self._append_log(db, doc_id, "info", "Pipeline started — parsing document.")
                logger.info(
                    "[Pipeline] Started — doc_id=%s, file=%s, kb=%s", doc_id, filename, kb_type.value
                )

                raw_text = parse_document(filename, file_content)
                clean_text = clean_legal_text(raw_text)
                chunks = split_legal_document(clean_text)
                msg = f"Parsed {len(chunks)} chunk(s) from document."
                await self._append_log(db, doc_id, "info", msg)
                logger.info("[Pipeline] %s — doc_id=%s", msg, doc_id)

                title = Path(filename).stem
                await asyncio.to_thread(
                    upsert_document_chunks, chunks, doc_id, kb_type.collection_name
                )
                await self._append_log(
                    db, doc_id, "info", f"Vectors upserted to Qdrant ({kb_type.collection_name})."
                )
                logger.info("[Pipeline] Qdrant upsert done — doc_id=%s", doc_id)

                if kb_type.use_neo4j:
                    await asyncio.to_thread(build_document_graph, doc_id, title, chunks)
                    await self._append_log(db, doc_id, "info", "Knowledge graph built in Neo4j.")
                    logger.info("[Pipeline] Neo4j graph built — doc_id=%s", doc_id)

                await self._update_status(db, doc_id, DocumentStatus.COMPLETED)
                await self._append_log(db, doc_id, "success", "Pipeline completed successfully.")
                logger.info("[Pipeline] Completed — doc_id=%s", doc_id)

                if kb_type.use_neo4j:
                    await self._append_log(db, doc_id, "info", "Auto-generating compliance analyses.")
                    await self._auto_generate_analyses(doc_id)

            except Exception as exc:
                err = str(exc)
                await self._append_log(db, doc_id, "error", f"Pipeline failed: {err}")
                logger.error("[Pipeline] Failed — doc_id=%s: %s", doc_id, exc, exc_info=True)
                await self._update_status(db, doc_id, DocumentStatus.FAILED)

    # ── Queries ──────────────────────────────────────────────

    async def get_all_documents(
        self, db: AsyncSession, kb_type: KbType | None = None
    ) -> list[Document]:
        stmt = select(Document).order_by(Document.created_at.desc())
        if kb_type is not None:
            stmt = stmt.where(Document.kb_type == kb_type.value)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_log(self, db: AsyncSession, doc_id: int) -> list[dict] | None:
        doc = await self.get_document(db, doc_id)
        if doc is None:
            return None
        try:
            return json.loads(doc.processing_log or "[]")
        except Exception:
            return []

    # ── Delete ───────────────────────────────────────────────

    async def delete_document_pipeline(self, db: AsyncSession, doc_id: int) -> bool:
        try:
            doc = await self.get_document(db, doc_id)
            if doc is None:
                return False

            kb_type = KbType(doc.kb_type)
            await asyncio.to_thread(self._delete_from_qdrant, doc_id, kb_type.collection_name)
            if kb_type.use_neo4j:
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

    # ── Storage ──────────────────────────────────────────────

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
        logger.info("[Storage] Stored — doc_id=%s, key=%s", doc_id, object_key)
        return object_key

    def open_original_file(self, object_key: str):
        return get_minio_client().get_object(settings.MINIO_BUCKET, object_key)

    def stat_original_file(self, object_key: str):
        return get_minio_client().stat_object(settings.MINIO_BUCKET, object_key)

    # ── Helpers ──────────────────────────────────────────────

    async def _auto_generate_analyses(self, doc_id: int) -> None:
        """Auto-generate analysis (Output 1) right after ingestion completes.

        Runs in its own session; errors here do NOT affect ingest status
        (the document is already 'completed' and committed before this call).
        """
        from app.services.analysis_service import analysis_service

        try:
            await analysis_service.generate_for_document(doc_id)
        except Exception as exc:
            logger.error(
                "[Pipeline] Auto analysis generation failed — doc_id=%s: %s",
                doc_id, exc, exc_info=True,
            )

    async def _update_status(self, db: AsyncSession, doc_id: int, status: DocumentStatus) -> None:
        await db.execute(
            update(Document).where(Document.id == doc_id).values(status=status.value)
        )
        await db.commit()

    async def _append_log(self, db: AsyncSession, doc_id: int, level: str, message: str) -> None:
        doc = await self.get_document(db, doc_id)
        if doc is None:
            return
        try:
            entries = json.loads(doc.processing_log or "[]")
        except Exception:
            entries = []
        entries.append({"level": level, "message": message, "ts": _now_iso()})
        await db.execute(
            update(Document).where(Document.id == doc_id).values(
                processing_log=json.dumps(entries)
            )
        )
        await db.commit()

    def _delete_from_qdrant(self, doc_id: int, collection_name: str) -> None:
        from qdrant_client.models import FieldCondition, Filter, FilterSelector, MatchValue
        from app.core.qdrant_client import qdrant_client
        qdrant_client.delete(
            collection_name=collection_name,
            points_selector=FilterSelector(
                filter=Filter(must=[FieldCondition(key="document_id", match=MatchValue(value=doc_id))])
            ),
        )
        logger.info("[Delete] Qdrant chunks removed — doc_id=%s, collection=%s", doc_id, collection_name)

    def _delete_from_neo4j(self, doc_id: int) -> None:
        from app.core.neo4j_client import get_neo4j_driver
        with get_neo4j_driver().session() as session:
            session.run(
                """

                MATCH (d:Document {document_id: $doc_id})

                OPTIONAL MATCH (d)-[:HAS_ARTICLE]->(a:Article)

                OPTIONAL MATCH (a)-[:HAS_CLAUSE]->(c:Clause)

                OPTIONAL MATCH (d)-[:HAS_CLAUSE]->(dc:Clause)

                DETACH DELETE d, a, c, dc

                """,
                doc_id=doc_id,
            )
        logger.info("[Delete] Neo4j nodes removed — doc_id=%s", doc_id)

    def _delete_from_minio(self, object_key: str) -> None:
        try:
            get_minio_client().remove_object(settings.MINIO_BUCKET, object_key)
            logger.info("[Delete] MinIO object removed — key=%s", object_key)
        except Exception as exc:
            logger.warning("[Delete] MinIO skip — key=%s, error=%s", object_key, exc)

    @staticmethod
    def _content_type_for(filename: str) -> str:
        suffix = Path(filename).suffix.lower()
        if suffix == ".pdf":   return "application/pdf"
        if suffix == ".docx":  return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        if suffix == ".doc":   return "application/msword"
        return "application/octet-stream"


document_service = DocumentService()
