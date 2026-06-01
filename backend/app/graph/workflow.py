from langgraph.graph import StateGraph, START, END
from app.graph.state import GraphState
from app.graph.nodes import retrieve_vector_node, retrieve_graph_node, generate_answer_node

def compile_rag_workflow():
    """
    Compiles and constructs the LangGraph State Machine for RegWatch v2.
    
    # TODO: Workflow Topology Design
    # Current Topology: START -> Vector Search -> Graph Search -> LLM Gen -> END
    # Future Optimization: Change 'retrieve_vector' and 'retrieve_graph' to execute in PARALLEL.
    """
    
    # 1. Initialize Graph with state schema
    workflow = StateGraph(GraphState)
    
    # 2. Register all active nodes
    workflow.add_node("retrieve_vector", retrieve_vector_node)
    workflow.add_node("retrieve_graph", retrieve_graph_node)
    workflow.add_node("generate_answer", generate_answer_node)
    
    # 3. Define Execution Edges using modern START/END tokens
    # TODO: Verify edge directions match the logical dataflow pipeline.
    workflow.add_edge(START, "retrieve_vector")
    workflow.add_edge("retrieve_vector", "retrieve_graph")
    workflow.add_edge("retrieve_graph", "generate_answer")
    workflow.add_edge("generate_answer", END)
    
    # 4. Compile into a runnable component
    return workflow.compile()


# TODO: Global Singleton Instance
rag_workflow = compile_rag_workflow()