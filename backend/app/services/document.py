import asyncio
import logging
from pathlib import Path

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import DocumentStatus
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
            file_path=filename,
            status=DocumentStatus.PENDING,
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        return doc

    async def pipeline_process_and_embed_law(
        self, doc_id: int, filename: str, file_content: bytes
    ) -> None:
        from app.core.db import async_session_factory

        async with async_session_factory() as db:
            try:
                await self._update_status(db, doc_id, DocumentStatus.PROCESSING)
                logger.info(f"[Pipeline] Started — doc_id={doc_id}, file={filename}")

                raw_text = parse_document(filename, file_content)
                clean_text = clean_legal_text(raw_text)
                chunks = split_legal_document(clean_text)
                logger.info(f"[Pipeline] {len(chunks)} chunk(s) extracted — doc_id={doc_id}")

                title = Path(filename).stem
                await asyncio.to_thread(upsert_document_chunks, chunks, doc_id)
                logger.info(f"[Pipeline] Qdrant upsert done — doc_id={doc_id}")

                await asyncio.to_thread(build_document_graph, doc_id, title, chunks)
                logger.info(f"[Pipeline] Neo4j graph built — doc_id={doc_id}")

                await self._update_status(db, doc_id, DocumentStatus.COMPLETED)
                logger.info(f"[Pipeline] Completed successfully — doc_id={doc_id}")

            except Exception as exc:
                logger.error(f"[Pipeline] Failed — doc_id={doc_id}: {exc}", exc_info=True)
                await self._update_status(db, doc_id, DocumentStatus.FAILED)

    async def _update_status(
        self, db: AsyncSession, doc_id: int, status: DocumentStatus
    ) -> None:
        await db.execute(
            update(Document).where(Document.id == doc_id).values(status=status.value)
        )
        await db.commit()

    async def get_all_documents(self, db: AsyncSession) -> list[Document]:
        result = await db.execute(
            select(Document).order_by(Document.created_at.desc())
        )
        return list(result.scalars().all())

    async def delete_document_pipeline(self, db: AsyncSession, doc_id: int) -> bool:
        try:
            result = await db.execute(delete(Document).where(Document.id == doc_id))
            if result.rowcount == 0:
                return False

            await asyncio.to_thread(self._delete_from_qdrant, doc_id)
            await asyncio.to_thread(self._delete_from_neo4j, doc_id)

            await db.commit()
            return True
        except Exception as exc:
            logger.error(f"[Delete] Failed for doc_id={doc_id}: {exc}", exc_info=True)
            await db.rollback()
            return False

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
        logger.info(f"[Delete] Qdrant chunks removed — doc_id={doc_id}")

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
        logger.info(f"[Delete] Neo4j nodes removed — doc_id={doc_id}")


document_service = DocumentService()
