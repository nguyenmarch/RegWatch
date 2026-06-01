import hashlib
import random
import uuid

from qdrant_client.models import Distance, PointStruct, VectorParams

from app.core.config import settings
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


def _generate_mock_embedding(text: str) -> list[float]:
    # Deterministic mock: MD5 gives stable output across processes.
    digest = hashlib.md5(text.encode("utf-8")).hexdigest()
    seed = int(digest, 16) % (2**31)
    rng = random.Random(seed)
    return [rng.uniform(-1.0, 1.0) for _ in range(settings.EMBEDDING_DIMENSION)]


def _build_point_id(document_id: int, chunk_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"doc:{document_id}:chunk:{chunk_id}"))


def upsert_document_chunks(chunks: list[dict], document_id: int) -> None:
    _ensure_collection_exists()

    points: list[PointStruct] = [
        PointStruct(
            id=_build_point_id(document_id, chunk["chunk_id"]),
            vector=_generate_mock_embedding(chunk["text_content"]),
            payload={
                "document_id": document_id,
                "chunk_id": chunk["chunk_id"],
                "text": chunk["text_content"],
            },
        )
        for chunk in chunks
    ]

    if points:
        qdrant_client.upsert(
            collection_name=settings.QDRANT_COLLECTION_NAME,
            points=points,
        )
        logger.info(
            f"Upserted {len(points)} chunk(s) for document_id={document_id} into Qdrant."
        )
