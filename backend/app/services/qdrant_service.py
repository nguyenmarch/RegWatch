import uuid

from qdrant_client.models import Distance, PointStruct, VectorParams

from app.core.config import settings
from app.core.gemini_client import embed_texts
from app.core.qdrant_client import qdrant_client
from app.utils.logger import logger


def _ensure_collection_exists() -> None:
    existing = {c.name for c in qdrant_client.get_collections().collections}
    if settings.QDRANT_COLLECTION_NAME not in existing:
        qdrant_client.create_collection(
            collection_name=settings.QDRANT_COLLECTION_NAME,
            vectors_config=VectorParams(
                size=settings.EMBEDDING_DIMENSION,
                distance=Distance.COSINE,
            ),
        )
        logger.info(f"Qdrant collection '{settings.QDRANT_COLLECTION_NAME}' created.")


def _build_point_id(document_id: int, chunk_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"doc:{document_id}:chunk:{chunk_id}"))


def upsert_document_chunks(chunks: list[dict], document_id: int) -> None:
    _ensure_collection_exists()

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
            collection_name=settings.QDRANT_COLLECTION_NAME,
            points=points,
        )
        logger.info(
            f"Upserted {len(points)} chunk(s) for document_id={document_id} into Qdrant."
        )
