from app.core.mysql_client import SessionLocal
from app.repositories.document import update_document_status
from app.services.chunker import split_legal_document
from app.services.neo4j_service import build_document_graph
from app.services.qdrant_service import upsert_document_chunks
from app.utils.logger import logger


def pipeline_process_and_embed_law(
    document_id: int, title: str, raw_text: str
) -> None:
    db = SessionLocal()
    try:
        update_document_status(db, document_id, "processing")
        logger.info(f"[Pipeline] Started — document_id={document_id}.")

        chunks = split_legal_document(raw_text)
        logger.info(
            f"[Pipeline] Chunking complete — "
            f"{len(chunks)} chunk(s) extracted for document_id={document_id}."
        )

        upsert_document_chunks(chunks, document_id)
        logger.info(f"[Pipeline] Qdrant upsert complete — document_id={document_id}.")

        build_document_graph(document_id, title, chunks)
        logger.info(f"[Pipeline] Neo4j graph built — document_id={document_id}.")

        update_document_status(db, document_id, "completed")
        logger.info(f"[Pipeline] Finished successfully — document_id={document_id}.")

    except Exception as exc:
        logger.error(
            f"[Pipeline] Failed for document_id={document_id}: {exc}", exc_info=True
        )
        try:
            update_document_status(db, document_id, "failed")
        except Exception as inner_exc:
            logger.error(
                f"[Pipeline] Could not set status='failed' "
                f"for document_id={document_id}: {inner_exc}"
            )
    finally:
        db.close()
