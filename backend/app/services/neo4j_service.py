from __future__ import annotations

import logging
from typing import Any

from app.core.neo4j_client import get_neo4j_driver
from app.schemas.document import LegalDocument

logger = logging.getLogger(__name__)


# ── Schema constraints (call once at startup) ─────────────────


def ensure_neo4j_constraints() -> None:
    driver = get_neo4j_driver()
    constraints = [
        "CREATE CONSTRAINT IF NOT EXISTS FOR (d:Document) REQUIRE d.document_id IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Chapter)  REQUIRE c.chapter_id  IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (s:Section)  REQUIRE s.section_id  IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (a:Article)  REQUIRE a.article_id  IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (k:Clause)   REQUIRE k.clause_id   IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Point)    REQUIRE p.point_id    IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Chunk)    REQUIRE c.chunk_id    IS UNIQUE",
    ]
    with driver.session() as session:
        for stmt in constraints:
            session.run(stmt)
    logger.info("[Neo4j] Uniqueness constraints ensured.")


# ── Public entry point ─────────────────────────────────────────


def build_document_graph(doc: LegalDocument) -> None:
    """
    DEPRECATED: Use build_chunk_graph instead.
    This function is kept for backward compatibility but does not process the new LegalDocument schema.
    The new schema uses build_chunk_graph which processes LegalChunk objects directly.
    """
    logger.warning("[Neo4j] build_document_graph called but deprecated. Use build_chunk_graph instead.")


# ── Chunk-based graph (PDF/DOCX pipeline) ─────────────────────


def build_chunk_graph(doc_id: int, title: str, chunks: list) -> None:
    """Build Document → Chunk nodes from LegalChunk objects."""
    from app.core.config import settings

    doc_id_str = str(doc_id)
    driver = get_neo4j_driver()
    chunk_dicts = [c.model_dump() for c in chunks]
    batch_size = settings.NEO4J_CHUNK_BATCH_SIZE
    total_batches = (len(chunk_dicts) + batch_size - 1) // batch_size

    with driver.session() as session:
        session.execute_write(
            lambda tx: tx.run(
                "MERGE (d:Document {document_id: $doc_id}) SET d.title = $title",
                doc_id=doc_id_str,
                title=title,
            )
        )

        for batch_num, start in enumerate(range(0, len(chunk_dicts), batch_size), 1):
            batch = chunk_dicts[start:start + batch_size]
            session.execute_write(
                lambda tx, b=batch: tx.run(
                    """
                    MATCH (d:Document {document_id: $doc_id})
                    UNWIND $chunks AS ch
                    MERGE (c:Chunk {chunk_id: ch.chunk_id})
                    SET c += ch.metadata, c.text = ch.text, c.chunk_type = ch.chunk_type
                    MERGE (d)-[:HAS_CHUNK]->(c)
                    """,
                    doc_id=doc_id_str,
                    chunks=b,
                )
            )
            logger.info("[Neo4j] Chunk batch %d/%d — %d nodes written — doc_id=%s",
                        batch_num, total_batches, len(batch), doc_id)

        if len(chunk_dicts) > 1:
            pairs = [
                {"from_id": chunk_dicts[i]["chunk_id"], "to_id": chunk_dicts[i + 1]["chunk_id"]}
                for i in range(len(chunk_dicts) - 1)
            ]
            for start in range(0, len(pairs), batch_size):
                batch_pairs = pairs[start:start + batch_size]
                session.execute_write(
                    lambda tx, p=batch_pairs: tx.run(
                        """
                        UNWIND $pairs AS p
                        MATCH (a:Chunk {chunk_id: p.from_id}), (b:Chunk {chunk_id: p.to_id})
                        MERGE (a)-[:NEXT_CHUNK]->(b)
                        """,
                        pairs=p,
                    )
                )

    logger.info("[Neo4j] Chunk graph complete — doc_id=%s, %d chunks.", doc_id, len(chunks))


