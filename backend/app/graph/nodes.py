import asyncio

from app.core.config import settings
from app.core.gemini_client import aembed_text, agenerate_text
from app.core.gemini_client import agenerate_text
from app.core.neo4j_client import get_neo4j_driver
from app.core.qdrant_client import qdrant_client
from app.graph.state import GraphState
from app.utils.logger import logger
from app.utils.citation_extractor import citation_extractor
from app.services.retrieval_service import retrieval_service
from app.utils.reference_extractor import extract_article_numbers

_SYSTEM_INSTRUCTION = (
    "You are a legal compliance assistant specialized in Vietnamese law and regulations. "
    "Answer questions accurately and concisely using only the provided context. "
    "Always cite the specific article numbers (Điều) when referencing legal provisions. "
    "If the context does not contain enough information to answer, say so clearly."
)

_TOP_K = 5


# ── Shared retrieval functions (reused by streaming path) ────────────────────


async def fetch_vector_context(
    question: str,
    citations: list = None,
) -> tuple[str, list[dict]]:
    """
    Task 1, 5: Vector search with citation extraction and metadata filtering.
    Extracts document_number, article_number to filter Qdrant results.
    """
    if citations is None:
        citations, grouped = citation_extractor.extract_from_question(question)
    else:
        grouped = {}

    # Build metadata filter from citations
    filter_metadata = {}
    if grouped.get("documents"):
        filter_metadata["document_number"] = [d.document_number for d in grouped["documents"]]
    if grouped.get("articles"):
        filter_metadata["article_number"] = [a.article_number for a in grouped["articles"]]

    return await retrieval_service.fetch_vector_context(question, filter_metadata)


async def fetch_graph_context(
    question: str,
    citations: list = None,
) -> tuple[str, list[dict]]:
    """
    Task 2, 3, 4: Document-scoped graph queries with support for:
    - Article, Clause, and Point levels
    - Citation extraction and expansion
    """
    if citations is None:
        citations, _ = citation_extractor.extract_from_question(question)

    if not citations or not any(c.article_number for c in citations):
        return "", []

    # Fetch document-scoped context (Task 2, 3)
    ctx, graph_results = await retrieval_service.fetch_graph_context(question, citations)

    # Expand with references (Task 4)
    if graph_results:
        expanded = await retrieval_service.expand_with_references(graph_results)
        # Limit expanded results
        expanded = expanded[:10]

        # Reformat expanded results
        lines = [ctx] if ctx else []
        for result in expanded[len(graph_results):]:
            if result.get("header"):
                block = f"[{result['header']}]"
                if result.get("clause_text"):
                    block += f"\nKhoản {result.get('clause_number', '?')}: {result['clause_text']}"
                lines.append(block)

        if lines:
            ctx = "\n\n[EXPANDED REFERENCES]\n\n".join(lines)

    return ctx, graph_results


# ── LangGraph nodes — return DELTA dicts, not full state ─────────────────────

async def retrieve_graph_node(state: GraphState) -> dict:
    """Task 2, 3, 4: Document-scoped graph with clause/point support and reference expansion."""
    logger.info("[LangGraph] retrieve_graph_node")
    try:
        citations = state.get("citations")
        if not citations:
            citations, _ = citation_extractor.extract_from_question(state["question"])
        ctx, graph_results = await fetch_graph_context(state["question"], citations)
        return {
            "graph_context": ctx,
            "graph_results": graph_results,
        }
    except Exception as exc:
        logger.error(f"[LangGraph] retrieve_graph_node failed: {exc}", exc_info=True)
        return {"graph_context": "", "error_message": str(exc)}


async def generate_answer_node(state: GraphState) -> dict:
    """Task 6, 7: Hybrid ranking and deduplication before LLM."""
    logger.info("[LangGraph] generate_answer_node")
    try:
        vector_hits = state.get("vector_hits", [])
        graph_results = state.get("graph_results", [])

        # Task 6: Hybrid ranking
        ranked = await retrieval_service.rank_results(vector_hits, graph_results)

        # Task 7: Deduplication
        deduped = await retrieval_service.deduplicate_context(ranked, max_tokens=4000)

        logger.info(
            f"[LangGraph] Ranked {len(ranked)} results, deduped to {len(deduped)}"
        )

        # Format context from ranked results
        context_lines = []
        for result in deduped:
            score_str = f"score:{result.total_score:.3f}"
            header = f"[{result.chunk_type} | {score_str}]"
            context_lines.append(f"{header}\n{result.text}")

        context_block = "\n\n---\n\n".join(context_lines) if context_lines else "No context available."
        system = _SYSTEM_INSTRUCTION + "\n\nContext (ranked by relevance):\n" + context_block

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