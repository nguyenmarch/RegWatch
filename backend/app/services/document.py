import asyncio
import json
import logging
from datetime import datetime, time, timezone
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
from app.services.neo4j_service import build_document_graph, generate_cypher_strings, execute_cypher_statements
from app.services.parser import parse_document
from app.services.qdrant_service import upsert_document_chunks
from app.utils.text_processor import clean_legal_text

import asyncio
import json
import logging

from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import DocumentStatus, KbType
from app.core.minio_client import get_minio_client
from app.models.document import Document
from app.services.chunker import chunk_legal_document, fallback_text_chunker
from app.services.graph_builder import graph_builder
from app.services.law_parser import LegalDocumentParser
from app.services.neo4j_ingestor import neo4j_ingestor
from app.services.neo4j_service import build_chunk_graph
from app.services.parser import parse_document
from app.services.qdrant_service import delete_document_chunks, upsert_document_chunks
from app.utils.text_processor import clean_legal_text


logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class DocumentService:

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


    async def pipeline_process_and_embed_law(
        self,
        doc_id: int,
        filename: str,
        file_content: bytes,
        kb_type: KbType = KbType.LAW,
    ) -> None:
        from app.core.db import async_session_factory

        t0 = time.monotonic()
        print(f"[Pipeline] START doc_id={doc_id} file='{filename}' size={len(file_content)} bytes", flush=True)

        try:
            # ── Mark PROCESSING ────────────────────────────────────────────────
            async with async_session_factory() as db:
                await self._update_status(db, doc_id, DocumentStatus.PROCESSING)

            # ── Step 1: Parse to LegalDocument ─────────────────────────────────
            t = time.monotonic()
            raw_text = await asyncio.to_thread(parse_document, filename, file_content)

            def _parse_legal_doc():
                parser = LegalDocumentParser()
                return parser.parse(filename, raw_text)

            legal_doc = await asyncio.to_thread(_parse_legal_doc)
            print(f"[Pipeline] doc_id={doc_id} step=parse legal_doc elapsed={time.monotonic()-t:.2f}s", flush=True)
            logger.info("[Pipeline] Step 1/4 parse — doc_id=%s, type=%s, elapsed=%.2fs",
                        doc_id, legal_doc.metadata.document_type.value, time.monotonic() - t)

            # ── Step 2: Chunk ──────────────────────────────────────────────────
            t = time.monotonic()
            chunks = await asyncio.to_thread(chunk_legal_document, legal_doc)
            if not chunks:
                raise ValueError("Chunker produced zero chunks — document may be empty or unparseable.")
            print(f"[Pipeline] doc_id={doc_id} step=chunk count={len(chunks)} elapsed={time.monotonic()-t:.2f}s", flush=True)
            logger.info("[Pipeline] Step 2/4 chunk — doc_id=%s, chunks=%d, elapsed=%.2fs",
                        doc_id, len(chunks), time.monotonic() - t)

            # ── Step 3a: Embed + Qdrant ────────────────────────────────────────
            t = time.monotonic()
            await asyncio.to_thread(upsert_document_chunks, chunks, doc_id, kb_type.collection_name)
            print(f"[Pipeline] doc_id={doc_id} step=qdrant elapsed={time.monotonic()-t:.2f}s", flush=True)
            logger.info("[Pipeline] Step 3a/4 qdrant — doc_id=%s, elapsed=%.2fs",
                        doc_id, time.monotonic() - t)

            # ── Step 3b: Neo4j Knowledge Graph (if applicable) ─────────────────
            if kb_type.use_neo4j:
                t = time.monotonic()

                def _build_and_ingest():
                    # Ensure Neo4j constraints exist
                    neo4j_ingestor.ensure_constraints()

                    # Build hierarchical graph from LegalDocument
                    graph_data = graph_builder.build(legal_doc)
                    logger.info("[Pipeline] Built graph: %s", graph_data)

                    # Ingest to Neo4j
                    neo4j_ingestor.ingest(graph_data)

                    # Get statistics
                    stats = neo4j_ingestor.get_stats(legal_doc.metadata.document_id)
                    logger.info("[Pipeline] Neo4j stats: %s", stats)
                    return stats

                stats = await asyncio.to_thread(_build_and_ingest)
                print(f"[Pipeline] doc_id={doc_id} step=neo4j nodes={stats.get('Document', 0)} elapsed={time.monotonic()-t:.2f}s", flush=True)
                logger.info("[Pipeline] Step 3b/4 neo4j — doc_id=%s, stats=%s, elapsed=%.2fs",
                            doc_id, stats, time.monotonic() - t)

            # ── Mark COMPLETED ─────────────────────────────────────────────────
            total = time.monotonic() - t0
            async with async_session_factory() as db:
                await self._update_status(db, doc_id, DocumentStatus.COMPLETED)
            print(f"[Pipeline] COMPLETED doc_id={doc_id} total={total:.2f}s", flush=True)
            logger.info("[Pipeline] Completed — doc_id=%s, total=%.2fs", doc_id, total)

        except Exception as exc:
            total = time.monotonic() - t0
            import traceback
            print(f"[Pipeline] FAILED doc_id={doc_id} after {total:.2f}s: {exc}", flush=True)
            traceback.print_exc()
            logger.error("[Pipeline] Failed — doc_id=%s, elapsed=%.2fs: %s", doc_id, total, exc, exc_info=True)
            try:
                async with async_session_factory() as db:
                    await self._update_status(db, doc_id, DocumentStatus.FAILED)
            except Exception as db_exc:
                logger.error("[Pipeline] Could not write FAILED status — doc_id=%s: %s", doc_id, db_exc)

    async def pipeline_stage_for_preview(
        self, doc_id: int, filename: str, file_content: bytes, kb_type: KbType
    ) -> None:
        """Parse, chunk, embed to Qdrant, then generate Cypher WITHOUT executing on Neo4j.

        Sets status=PENDING_GRAPH and stores the generated Cypher in staged_cypher.
        The user must call commit_staged_cypher() to finalise.
        """
        from app.core.db import async_session_factory

        async with async_session_factory() as db:
            try:
                await self._update_status(db, doc_id, DocumentStatus.PROCESSING)
                await self._append_log(db, doc_id, "info", "Pipeline started — parsing document.")
                logger.info("[Stage] Started — doc_id=%s, file=%s", doc_id, filename)

                raw_text = await asyncio.to_thread(parse_document, filename, file_content)
                clean_text = clean_legal_text(raw_text)
                chunks = split_legal_document(clean_text)
                msg = f"Parsed {len(chunks)} chunk(s) from document."
                await self._append_log(db, doc_id, "info", msg)
                logger.info("[Stage] %s — doc_id=%s", msg, doc_id)

                title = Path(filename).stem
                await asyncio.to_thread(
                    upsert_document_chunks, chunks, doc_id, kb_type.collection_name
                )
                await self._append_log(
                    db, doc_id, "info", f"Vectors upserted to Qdrant ({kb_type.collection_name})."
                )

                cypher = await asyncio.to_thread(generate_cypher_strings, doc_id, title, chunks)
                await db.execute(
                    update(Document).where(Document.id == doc_id).values(staged_cypher=cypher)
                )
                await db.commit()

                await self._update_status(db, doc_id, DocumentStatus.PENDING_GRAPH)
                await self._append_log(
                    db, doc_id, "info",
                    f"Cypher generated ({len(cypher.splitlines())} statements). Awaiting graph review."
                )
                logger.info("[Stage] pending_graph — doc_id=%s", doc_id)

            except Exception as exc:
                err = str(exc)
                await self._append_log(db, doc_id, "error", f"Staging failed: {err}")
                logger.error("[Stage] Failed — doc_id=%s: %s", doc_id, exc, exc_info=True)
                await self._update_status(db, doc_id, DocumentStatus.FAILED)

    async def commit_staged_cypher(
        self, db: AsyncSession, doc_id: int, cypher_text: str
    ) -> bool:
        """Execute user-reviewed Cypher on Neo4j and mark the document COMPLETED."""
        try:
            await asyncio.to_thread(execute_cypher_statements, cypher_text)
            await db.execute(
                update(Document).where(Document.id == doc_id).values(staged_cypher=None)
            )
            await db.commit()
            await self._update_status(db, doc_id, DocumentStatus.COMPLETED)
            await self._append_log(db, doc_id, "success", "Graph committed to Neo4j. Pipeline completed.")
            logger.info("[Commit] Completed — doc_id=%s", doc_id)
            await self._auto_generate_analyses(doc_id)
            return True
        except Exception as exc:
            await self._append_log(db, doc_id, "error", f"Cypher commit failed: {exc}")
            logger.error("[Commit] Failed — doc_id=%s: %s", doc_id, exc, exc_info=True)
            return False

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
    async def delete_document_pipeline(self, db: AsyncSession, doc_id: int) -> bool:
        doc = await self.get_document(db, doc_id)
        if doc is None:
            return False

        logger.info("[Delete] Starting — doc_id=%s", doc_id)
        try:
            kb = KbType(doc.kb_type) if doc.kb_type else KbType.LAW

            await asyncio.to_thread(delete_document_chunks, str(doc_id), kb.collection_name)
            logger.info("[Delete] Qdrant done — doc_id=%s", doc_id)

            if kb.use_neo4j:
                await asyncio.to_thread(self._delete_from_neo4j, doc_id)

            if doc.file_path:
                await asyncio.to_thread(self._delete_from_minio, doc.file_path)

            await db.execute(delete(Document).where(Document.id == doc_id))
            await db.commit()
            logger.info("[Delete] Completed — doc_id=%s", doc_id)
            return True

        except Exception as exc:
            logger.error("[Delete] Failed — doc_id=%s: %s", doc_id, exc, exc_info=True)
            await db.rollback()
            return False

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _update_status(
        self, db: AsyncSession, doc_id: int, status: DocumentStatus
    ) -> None:
        await db.execute(
            update(Document).where(Document.id == doc_id).values(status=status.value)
        )
        await db.commit()

    def _delete_from_neo4j(self, doc_id: int) -> None:
        from app.core.neo4j_client import get_neo4j_driver
        with get_neo4j_driver().session() as session:

            client = get_gemini_client(

                
            ) 





            session.run(
                """
                MATCH (d:Document {document_id: $doc_id})
                OPTIONAL MATCH (d)-[:HAS_CHAPTER]->(ch)
                OPTIONAL MATCH (ch)-[:HAS_SECTION]->(sec)
                OPTIONAL MATCH (ch)-[:HAS_ARTICLE]->(a)
                OPTIONAL MATCH (sec)-[:HAS_ARTICLE]->(sa)
                OPTIONAL MATCH (a)-[:HAS_CLAUSE]->(cl)
                OPTIONAL MATCH (sa)-[:HAS_CLAUSE]->(scl)
                OPTIONAL MATCH (cl)-[:HAS_POINT]->(pt)
                OPTIONAL MATCH (scl)-[:HAS_POINT]->(spt)
                OPTIONAL MATCH (d)-[:HAS_CHUNK]->(c:Chunk)
                DETACH DELETE d, ch, sec, a, sa, cl, scl, pt, spt, c
                """,
                doc_id=str(doc_id),
            )
        logger.info("[Delete] Neo4j done — doc_id=%s", doc_id)

    def _delete_from_minio(self, object_key: str) -> None:
        try:
            get_minio_client().remove_object(settings.MINIO_BUCKET, object_key)
            logger.info("[Delete] MinIO done — key=%s", object_key)
        except Exception as exc:
            logger.warning("[Delete] MinIO skipped — key=%s: %s", object_key, exc)


# ── Module-level helpers ──────────────────────────────────────────────────────


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