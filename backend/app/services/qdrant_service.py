import uuid
from qdrant_client.models import Distance, PointStruct, VectorParams
from app.core.config import settings
from app.core.qdrant_client import qdrant_client
from app.schemas.document import LegalChunk

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



def _build_point_id(document_id: int, chunk_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"doc:{document_id}:chunk:{chunk_id}"))

def upsert_chunks(
    chunks: list[LegalChunk],
    vectors: list[list[float]],
    collection_name: str | None = None,
) -> None:
    col = _ensure_collection(collection_name)

    points: list[PointStruct] = []
    for chunk, vector in zip(chunks, vectors):
        payload = {
            "document_id": chunk.document_id,
            "chunk_id": chunk.chunk_id,
            "chunk_type": chunk.chunk_type,
            "text": chunk.text,
            **chunk.metadata,
        }
        points.append(
            PointStruct(
                id=_point_id(chunk.document_id, chunk.chunk_id),
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
    chunks: list[LegalChunk],
    doc_id: str,
    collection_name: str,
) -> None:
    from app.services.embedding_service import embed_texts

    logger.info("[Qdrant] Embedding %d chunks — doc_id=%s, collection='%s'",
                len(chunks), doc_id, collection_name)
    texts = [c.text for c in chunks]
    vectors = embed_texts(texts)
    logger.info("[Qdrant] Embeddings ready — %d vectors, dim=%d",
                len(vectors), len(vectors[0]) if vectors else 0)
    upsert_chunks(chunks, vectors, collection_name)
    logger.info("[Qdrant] All %d chunks stored — doc_id=%s", len(chunks), doc_id)



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


def fetch_doc_chunks(
    document_id: int,
    limit: int = 300,
    collection_name: str = settings.QDRANT_COLLECTION_NAME,
) -> list[dict]:
    """Fetch a document's stored chunks (with existing vectors — does NOT call embedding)."""
    points, _ = qdrant_client.scroll(
        collection_name=collection_name,
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


def upsert_approved_to_internal(doc_name: str, html_content: str, task_id: int) -> None:
    """
    Called when a RemediationDoc is APPROVED.
    We convert the HTML to plain text, chunk it, and upsert it to the internal_collection
    to replace the old document chunks.
    """
    from bs4 import BeautifulSoup
    from app.services.chunker import split_legal_document
    from app.core.db import SessionLocal
    from app.models.document import Document
    from app.core.enums import KbType
    
    # 1. Parse HTML to plain text
    soup = BeautifulSoup(html_content, "html.parser")
    # Thay thế <br> và các block tags bằng \n để giữ cấu trúc văn bản
    for br in soup.find_all("br"):
        br.replace_with("\n")
    for block in soup.find_all(['p', 'h1', 'h2', 'h3', 'li']):
        block.append("\n")
        
    plain_text = soup.get_text()
    
    # 2. Chunk text
    from app.utils.text_processor import clean_legal_text
    clean_text = clean_legal_text(plain_text)
    chunks = split_legal_document(clean_text)
    
    # 3. Find original Document ID
    db = SessionLocal()
    try:
        # Search for document by title
        doc = db.query(Document).filter(
            Document.title == doc_name,
            Document.kb_type == KbType.INTERNAL.value
        ).first()
        
        if doc:
            doc_id = doc.id
            # Xóa chunks cũ
            delete_document_chunks(doc_id, KbType.INTERNAL.collection_name)
        else:
            # Nếu không tìm thấy, tạo mới document hoặc dùng task_id
            new_doc = Document(
                title=doc_name,
                status="completed",
                kb_type=KbType.INTERNAL.value,
                processing_log='[{"level": "info", "message": "Updated via Remediation process"}]'
            )
            db.add(new_doc)
            db.commit()
            db.refresh(new_doc)
            doc_id = new_doc.id
            
        # 4. Upsert chunks
        upsert_document_chunks(chunks, doc_id, KbType.INTERNAL.collection_name)
        logger.info(f"Successfully upserted approved document '{doc_name}' to Qdrant (ID: {doc_id})")
        
    except Exception as e:
        logger.error(f"Error upserting approved document: {e}")
        raise
    finally:
        db.close()

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