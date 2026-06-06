import uuid

from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

from app.core.config import settings
from app.core.gemini_client import embed_texts
from app.core.qdrant_client import qdrant_client
from app.utils.logger import logger


def _ensure_collection_exists(collection_name: str) -> None:
    existing = {c.name for c in qdrant_client.get_collections().collections}
    if collection_name not in existing:
        qdrant_client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(
                size=settings.EMBEDDING_DIMENSION,
                distance=Distance.COSINE,
            ),
        )
        logger.info(f"Qdrant collection '{collection_name}' created.")


def _build_point_id(document_id: int, chunk_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"doc:{document_id}:chunk:{chunk_id}"))


def upsert_document_chunks(
    chunks: list[dict],
    document_id: int,
    collection_name: str = settings.QDRANT_COLLECTION_NAME,
) -> None:
    _ensure_collection_exists(collection_name)

    texts = [chunk["text_content"] for chunk in chunks]
    vectors = embed_texts(texts)

    points: list[PointStruct] = []
    for chunk, vector in zip(chunks, vectors):
        payload = {
            "document_id": document_id,
            "chunk_id": chunk["chunk_id"],
            "text": chunk["text_content"],
        }
        if "header" in chunk:
            payload["header"] = chunk["header"]
        if "article_number" in chunk:
            payload["article_number"] = chunk["article_number"]

        points.append(
            PointStruct(
                id=_build_point_id(document_id, chunk["chunk_id"]),
                vector=vector,
                payload=payload,
            )
        )

    if points:
        qdrant_client.upsert(
            collection_name=collection_name,
            points=points,
        )
        logger.info(
            f"Upserted {len(points)} chunk(s) for document_id={document_id} "
            f"into Qdrant collection '{collection_name}'."
        )


def delete_document_chunks(
    document_id: int,
    collection_name: str = settings.QDRANT_COLLECTION_NAME,
) -> None:
    """Xóa toàn bộ chunk của document_id khỏi collection Qdrant."""
    _ensure_collection_exists(collection_name)
    qdrant_client.delete(
        collection_name=collection_name,
        points_selector=Filter(
            must=[FieldCondition(key="document_id", match=MatchValue(value=document_id))]
        ),
    )
    logger.info(f"Deleted chunks for document_id={document_id} from '{collection_name}'.")


def fetch_doc_chunks(document_id: int, limit: int = 300) -> list[dict]:
    """Fetch a document's stored chunks (with existing vectors — does NOT call embedding)."""
    points, _ = qdrant_client.scroll(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        scroll_filter=Filter(
            must=[FieldCondition(key="document_id", match=MatchValue(value=document_id))]
        ),
        limit=limit,
        with_payload=True,
        with_vectors=True,
    )
    return [
        {
            "chunk_id": p.payload.get("chunk_id", ""),
            "text": p.payload.get("text", ""),
            "header": p.payload.get("header"),
            "article_number": p.payload.get("article_number"),
            "vector": p.vector,
        }
        for p in points
    ]


def search_chunks(
    query: str,
    collection_name: str,
    top_k: int = 5,
) -> list[dict]:
    """Semantic search trong một collection bằng query text (tự embed query)."""
    _ensure_collection_exists(collection_name)
    vectors = embed_texts([query])
    if not vectors:
        return []
    hits = qdrant_client.search(
        collection_name=collection_name,
        query_vector=vectors[0],
        limit=top_k,
        with_payload=True,
    )
    return [
        {
            "document_id": h.payload.get("document_id"),
            "chunk_id": h.payload.get("chunk_id", ""),
            "header": h.payload.get("header"),
            "text": h.payload.get("text", ""),
            "score": round(h.score, 4),
        }
        for h in hits
    ]


def search_conflicts(
    vector: list[float],
    exclude_document_id: int,
    limit: int = 3,
    score_threshold: float = 0.7,
) -> list[dict]:
    """Find similar clauses in OTHER documents (conflict/overlap candidates).

    Uses stored vectors so no embedding call is made. Excludes the document
    under review so it is only compared against the rest of the knowledge base.
    """
    hits = qdrant_client.search(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        query_vector=vector,
        query_filter=Filter(
            must_not=[
                FieldCondition(
                    key="document_id", match=MatchValue(value=exclude_document_id)
                )
            ]
        ),
        limit=limit,
        score_threshold=score_threshold,
        with_payload=True,
    )
    return [
        {
            "document_id": h.payload.get("document_id"),
            "chunk_id": h.payload.get("chunk_id", ""),
            "header": h.payload.get("header"),
            "text": h.payload.get("text", ""),
            "score": round(h.score, 4),
        }
        for h in hits
    ]