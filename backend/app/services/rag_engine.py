from app.graph.workflow import rag_workflow


async def query(question: str, chat_history: list[dict]) -> dict:
    """Run the hybrid RAG pipeline and return the final state."""
    initial_state = {
        "question": question,
        "chat_history": chat_history,
        "vector_context": "",
        "vector_hits": [],
        "graph_context": "",
        "final_answer": "",
        "error_message": None,
    }
    return await rag_workflow.ainvoke(initial_state)
