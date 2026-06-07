from typing import Any, Optional, TypedDict


class GraphState(TypedDict):
    question: str
    chat_history: list[dict]       # [{role: "user"|"model", parts: [{text: "..."}]}]
    citations: list[Any]           # Extracted LegalCitation objects
    vector_context: str            # formatted text from Qdrant hits
    vector_hits: list[dict]        # raw hits: [{chunk_id, document_id, text, score, chunk_type}]
    graph_context: str             # formatted text from Neo4j expansion
    graph_results: list[dict]      # raw graph results with article/clause/point details
    final_answer: str
    error_message: Optional[str]