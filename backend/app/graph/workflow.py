from langgraph.graph import END, START, StateGraph

from app.graph.nodes import generate_answer_node, retrieve_graph_node, retrieve_vector_node
from app.graph.state import GraphState


def compile_rag_workflow():
    workflow = StateGraph(GraphState)

    workflow.add_node("retrieve_vector", retrieve_vector_node)
    workflow.add_node("retrieve_graph", retrieve_graph_node)
    workflow.add_node("generate_answer", generate_answer_node)

    # Fan-out: both retrievals run in parallel from START
    workflow.add_edge(START, "retrieve_vector")
    workflow.add_edge(START, "retrieve_graph")

    # Fan-in: generate_answer waits for both retrievals to finish
    workflow.add_edge("retrieve_vector", "generate_answer")
    workflow.add_edge("retrieve_graph", "generate_answer")

    workflow.add_edge("generate_answer", END)

    return workflow.compile()


rag_workflow = compile_rag_workflow()
