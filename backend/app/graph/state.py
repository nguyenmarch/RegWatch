from typing import Optional, TypedDict


class GraphState(TypedDict):
    question: str
    chat_history: list[dict]       # [{role: "user"|"model", parts: [{text: "..."}]}]
    vector_context: str            # formatted text from Qdrant hits
    vector_hits: list[dict]        # raw hits: [{chunk_id, document_id, text, score}]
    graph_context: str             # formatted text from Neo4j expansion
    final_answer: str
    error_message: Optional[str]
