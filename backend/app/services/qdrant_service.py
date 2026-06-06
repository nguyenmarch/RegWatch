from __future__ import annotations

import logging
import uuid

from qdrant_client.models import Distance, PointStruct, VectorParams

from app.core.config import settings
from app.core.qdrant_client import qdrant_client
from app.services.chunker import SemanticChunk

logger = logging.getLogger(__name__)


def _ensure_collection(name: str | None = None) -> str:
    col = name or settings.QDRANT_COLLECTION_NAME
    existing = {c.name for c in qdrant_client.get_collections().collections}
    if col not in existing:
        qdrant_client.create_collection(
            collection_name=col,
            vectors_config=VectorParams(
                size=settings.EMBEDDING_DIMENSION,
                distance=Distance.COSINE,
            ),
        )
        logger.info("[Qdrant] Collection '%s' created.", col)
    return col


def _point_id(document_id: str, chunk_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"doc:{document_id}:chunk:{chunk_id}"))


def upsert_chunks(
    chunks: list[SemanticChunk],
    vectors: list[list[float]],
    collection_name: str | None = None,
) -> None:
    col = _ensure_collection(collection_name)

    points: list[PointStruct] = []
    for chunk, vector in zip(chunks, vectors):
        payload = {
            "document_id": chunk.metadata["document_id"],
            "chunk_id": chunk.chunk_id,
            "text": chunk.text_content,
            **{k: v for k, v in chunk.metadata.items() if k != "document_id"},
        }
        points.append(
            PointStruct(
                id=_point_id(chunk.metadata["document_id"], chunk.chunk_id),
                vector=vector,
                payload=payload,
            )
        )

    if not points:
        return

    batch_size = settings.QDRANT_UPSERT_BATCH_SIZE
    total_batches = (len(points) + batch_size - 1) // batch_size
    for batch_num, start in enumerate(range(0, len(points), batch_size), 1):
        batch = points[start:start + batch_size]
        qdrant_client.upsert(collection_name=col, points=batch)
        logger.info("[Qdrant] Batch %d/%d — %d points upserted into '%s'",
                    batch_num, total_batches, len(batch), col)


def upsert_document_chunks(
    chunks: list[SemanticChunk],
    doc_id: int,
    collection_name: str,
) -> None:
    from app.services.embedding_service import embed_texts

    logger.info("[Qdrant] Embedding %d chunks — doc_id=%s, collection='%s'",
                len(chunks), doc_id, collection_name)
    texts = [c.text_content for c in chunks]
    vectors = embed_texts(texts)
    logger.info("[Qdrant] Embeddings ready — %d vectors, dim=%d",
                len(vectors), len(vectors[0]) if vectors else 0)
    upsert_chunks(chunks, vectors, collection_name)
    logger.info("[Qdrant] All %d chunks stored — doc_id=%s", len(chunks), doc_id)


def delete_document_chunks(
    document_id: str, collection_name: str | None = None
) -> None:
    from qdrant_client.models import FieldCondition, Filter, FilterSelector, MatchValue

    col = collection_name or settings.QDRANT_COLLECTION_NAME
    existing = {c.name for c in qdrant_client.get_collections().collections}
    if col not in existing:
        return
    qdrant_client.delete(
        collection_name=col,
        points_selector=FilterSelector(
            filter=Filter(
                must=[
                    FieldCondition(
                        key="document_id", match=MatchValue(value=document_id)
                    )
                ]
            )
        ),
    )
    logger.info("[Qdrant] Deleted chunks for document_id=%s from '%s'.", document_id, col)
