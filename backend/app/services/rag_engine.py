# TODO: Implement the Hybrid Graph-RAG query engine
#
# FUNCTION: query(user_question: str, top_k: int = 5) -> str
#
#   Step 1 - Embed the user question
#     - Call Gemini text-embedding-004 (or mock embedding) to get a query vector
#
#   Step 2 - Semantic search (Qdrant)
#     - qdrant_client.search(collection_name, query_vector, limit=top_k)
#     - Returns: list of ScoredPoint with payload {document_id, chunk_id, text}
#
#   Step 3 - Graph expansion (Neo4j)
#     - For each retrieved chunk_id, run Cypher to fetch 1-hop neighbours:
#         MATCH (c:Clause {chunk_id: $chunk_id})-[r]-(neighbour:Clause)
#         RETURN neighbour.text_content, type(r) AS rel_type
#     - Append neighbour texts to the context window
#
#   Step 4 - Build prompt context
#     - Concatenate all retrieved + expanded texts
#     - Format as: "[Source: doc_id / chunk_id]\n<text>\n"
#
#   Step 5 - Generate answer (Gemini)
#     - Call generate_text(prompt=user_question, system_instruction=context)
#     - Return the response string
#
# FUNCTION: format_sources(scored_points) -> list[dict]
#   - Extract document_id, chunk_id, score from each ScoredPoint
#   - Return as structured list for API response citation
