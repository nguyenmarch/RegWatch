import asyncio

from app.core.config import settings
from app.core.gemini_client import aembed_text, agenerate_text
from app.core.neo4j_client import get_neo4j_driver
from app.core.qdrant_client import qdrant_client
from app.graph.state import GraphState
from app.utils.logger import logger
from app.utils.reference_extractor import extract_article_numbers

_SYSTEM_INSTRUCTION = (
    "You are a legal compliance assistant specialized in Vietnamese law and regulations. "
    "Answer questions accurately and concisely using only the provided context. "
    "Always cite the specific article numbers (Điều) when referencing legal provisions. "
    "If the context does not contain enough information to answer, say so clearly."
)

_TOP_K = 5


# ── Shared retrieval functions (reused by streaming path) ────────────────────

async def fetch_vector_context(question: str) -> tuple[str, list[dict]]:
    """Embed question, search Qdrant, return (formatted_context, raw_hits)."""
    vector = await aembed_text(question)

    hits = await asyncio.to_thread(
        qdrant_client.search,
        settings.QDRANT_COLLECTION_NAME,
        vector,
        limit=_TOP_K,
    )

    raw_hits = [
        {
            "chunk_id": h.payload.get("chunk_id", ""),
            "document_id": h.payload.get("document_id"),
            "text": h.payload.get("text", ""),
            "score": round(h.score, 4),
        }
        for h in hits
    ]

    if not raw_hits:
        return "", []

    lines = [
        f"[doc:{h['document_id']} / {h['chunk_id']} | score:{h['score']}]\n{h['text']}"
        for h in raw_hits
    ]
    return "\n\n---\n\n".join(lines), raw_hits


async def fetch_graph_context(question: str) -> str:
    """Extract article refs from question, run Neo4j expansion, return formatted context."""
    article_numbers = list(set(extract_article_numbers(question)))
    if not article_numbers:
        return ""

    def _run_query(nums: list[int]) -> list[dict]:
        # def _query(tx, nums: list[int]) -> list[dict]:
        #     result = tx.run(
        #         """
        #         MATCH (a:Article) WHERE a.article_number IN $nums
        #         MATCH (a)-[:HAS_CLAUSE]->(c:Clause)
        #         OPTIONAL MATCH (c)-[:NEXT_CLAUSE]->(next:Clause)
        #         OPTIONAL MATCH (c)-[:REFERENCES]->(ref:Article)-[:HAS_CLAUSE]->(refc:Clause)
        #         RETURN
        #             a.article_number AS art_num,
        #             a.header         AS art_header,
        #             c.text_content   AS clause_text,
        #             collect(DISTINCT next.text_content) AS next_texts,
        #             collect(DISTINCT refc.text_content) AS ref_texts
        #         ORDER BY a.article_number
        #         """,
        #         nums=nums,
        #     )
        #     return [r.data() for r in result]


        # Updated query to also fetch legal relationships of the containing document
        def _query(tx, nums: list[int]) -> list[dict]:
            result = tx.run(
                """
                MATCH (a:Article) WHERE a.article_number IN $nums
                MATCH (a)-[:HAS_CLAUSE]->(c:Clause)
                
                // Mở rộng thêm: Lấy các mối quan hệ của văn bản chứa điều luật đó
                OPTIONAL MATCH (doc:Document)-[:CONTAINS]->(a)
                OPTIONAL MATCH (doc)-[rel:CAN_CU_PHAP_LY|THAY_THE|SUA_DOI|HUONG_DAN]->(target:Document)
                
                OPTIONAL MATCH (c)-[:NEXT_CLAUSE]->(next:Clause)
                OPTIONAL MATCH (c)-[:REFERENCES]->(ref:Article)-[:HAS_CLAUSE]->(refc:Clause)
                
                RETURN
                    a.article_number AS art_num,
                    a.header         AS art_header,
                    c.text_content   AS clause_text,
                    collect(DISTINCT next.text_content) AS next_texts,
                    collect(DISTINCT refc.text_content) AS ref_texts,
                    collect(DISTINCT type(rel) + ' -> ' + target.name) AS legal_links
                ORDER BY a.article_number
                """,
                nums=nums,
            )
            return [r.data() for r in result]

        driver = get_neo4j_driver()
        with driver.session() as session:
            return session.execute_read(_query, nums)

    rows = await asyncio.to_thread(_run_query, article_numbers)
    if not rows:
        return ""

    lines = []
    for row in rows:
        header = row.get("art_header") or f"Điều {row['art_num']}"
        block = f"[{header}]\n{row['clause_text']}"
        if row.get("next_texts"):
            nexts = "\n".join(t for t in row["next_texts"] if t)
            if nexts:
                block += f"\n[NEXT_CLAUSE]\n{nexts}"
        if row.get("ref_texts"):
            refs = "\n".join(t for t in row["ref_texts"] if t)
            if refs:
                block += f"\n[REFERENCED CLAUSES]\n{refs}"
        lines.append(block)

    return "\n\n===\n\n".join(lines)


# ── LangGraph nodes — return DELTA dicts, not full state ─────────────────────

async def retrieve_vector_node(state: GraphState) -> dict:
    logger.info("[LangGraph] retrieve_vector_node")
    try:
        ctx, hits = await fetch_vector_context(state["question"])
        return {"vector_context": ctx, "vector_hits": hits}
    except Exception as exc:
        logger.error(f"[LangGraph] retrieve_vector_node failed: {exc}", exc_info=True)
        return {"vector_context": "", "vector_hits": [], "error_message": str(exc)}


async def retrieve_graph_node(state: GraphState) -> dict:
    logger.info("[LangGraph] retrieve_graph_node")
    try:
        ctx = await fetch_graph_context(state["question"])
        return {"graph_context": ctx}
    except Exception as exc:
        logger.error(f"[LangGraph] retrieve_graph_node failed: {exc}", exc_info=True)
        return {"graph_context": "", "error_message": str(exc)}


async def generate_answer_node(state: GraphState) -> dict:
    logger.info("[LangGraph] generate_answer_node")
    try:
        context_parts = []
        if state.get("vector_context"):
            context_parts.append("=== Semantic Search Results ===\n" + state["vector_context"])
        if state.get("graph_context"):
            context_parts.append("=== Knowledge Graph Context ===\n" + state["graph_context"])

        context_block = "\n\n".join(context_parts) if context_parts else "No context available."
        system = _SYSTEM_INSTRUCTION + "\n\nContext:\n" + context_block

        answer = await agenerate_text(
            question=state["question"],
            system_instruction=system,
            history=state.get("chat_history", []),
        )
        return {"final_answer": answer}
    except Exception as exc:
        logger.error(f"[LangGraph] generate_answer_node failed: {exc}", exc_info=True)
        return {
            "final_answer": "Sorry, I was unable to generate an answer. Please try again.",
            "error_message": str(exc),
        }
