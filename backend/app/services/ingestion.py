from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.schemas.document import LegalDocument, parse_legal_document
from app.services.chunker import chunk_legal_document
from app.services.embedding_service import embed_texts
from app.services.graph_builder import graph_builder
from app.services.neo4j_ingestor import neo4j_ingestor
from app.services.qdrant_service import upsert_chunks
from app.utils.logger import logger


def ingest_json_file(json_path: str | Path) -> None:
    path = Path(json_path)
    logger.info(f"[Pipeline] Loading {path.name}")
    raw: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    ingest_from_dict(raw)


def ingest_from_dict(raw: dict[str, Any]) -> None:
    """LEGACY: Ingest using old schema (parse_legal_document)."""
    doc = parse_legal_document(raw)
    doc_id = doc.document_info.document_id
    logger.info(f"[Pipeline] Parsed {doc.document_info.loai_van_ban} {doc.document_info.so_hieu} ({doc_id})")

    chunks = chunk_legal_document(doc)
    logger.info(f"[Pipeline] {len(chunks)} chunks created.")

    texts = [c.text for c in chunks]
    vectors = embed_texts(texts)
    logger.info(f"[Pipeline] Embeddings generated ({len(vectors[0])}d).")

    upsert_chunks(chunks, vectors)
    logger.info(f"[Pipeline] Qdrant upsert complete.")

    logger.info(f"[Pipeline] Done — {doc_id}")


def ingest_legal_document(doc: LegalDocument) -> None:
    """NEW: Ingest LegalDocument with full graph building.

    Pipeline:
    LegalDocument -> Chunks -> Embeddings -> Qdrant
                  -> Graph -> Neo4j Knowledge Graph
    """
    doc_id = doc.metadata.document_id
    logger.info(
        f"[Pipeline] Processing {doc.metadata.document_type.value} {doc.metadata.document_number} ({doc_id})"
    )

    # Step 1: Chunk the document
    chunks = chunk_legal_document(doc)
    logger.info(f"[Pipeline] Created {len(chunks)} chunks")

    # Step 2: Embed and store in Qdrant
    texts = [c.text for c in chunks]
    vectors = embed_texts(texts)
    logger.info(f"[Pipeline] Generated {len(vectors)} embeddings ({len(vectors[0])}d)")

    upsert_chunks(chunks, vectors)
    logger.info(f"[Pipeline] Upserted to Qdrant")

    # Step 3: Build and store knowledge graph
    graph_data = graph_builder.build(doc)
    logger.info(f"[Pipeline] Built graph: {graph_data}")

    neo4j_ingestor.ingest(graph_data)
    logger.info(f"[Pipeline] Ingested to Neo4j")

    logger.info(f"[Pipeline] Complete — {doc_id}")


def ingest_directory(dir_path: str | Path) -> None:
    p = Path(dir_path)
    files = sorted(p.glob("*.json"))
    logger.info(f"[Pipeline] Found {len(files)} JSON file(s) in {p}")
    for f in files:
        try:
            ingest_json_file(f)
        except Exception:
            logger.exception(f"[Pipeline] Failed on {f.name}")


# ── Integration with the existing MySQL-backed API ─────────────


def pipeline_process_structured_law(document_id: int, raw: dict[str, Any]) -> None:
    from app.core.mysql_client import SessionLocal
    from app.repositories.document import update_document_status

    db = SessionLocal()
    try:
        update_document_status(db, document_id, "processing")
        ingest_from_dict(raw)
        update_document_status(db, document_id, "completed")
    except Exception as exc:
        logger.error(f"[Pipeline] Failed for mysql_id={document_id}: {exc}", exc_info=True)
        try:
            update_document_status(db, document_id, "failed")
        except Exception as inner:
            logger.error(f"[Pipeline] Could not update status: {inner}")
    finally:
        db.close()
