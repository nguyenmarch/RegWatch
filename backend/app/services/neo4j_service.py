from app.core.neo4j_client import get_neo4j_driver
from app.utils.logger import logger

_ALLOWED_REFERENCE_TYPES = frozenset({"REFERENCES", "AMENDS", "SUPERSEDES", "IMPLEMENTS"})


def build_document_graph(document_id: int, title: str, chunks: list[dict]) -> None:
    driver = get_neo4j_driver()
    with driver.session() as session:
        session.execute_write(_create_document_node_tx, document_id, title)
        for chunk in chunks:
            session.execute_write(_create_clause_node_tx, document_id, chunk)
    logger.info(
        f"Knowledge graph built for document_id={document_id} "
        f"with {len(chunks)} clause node(s)."
    )


def _create_document_node_tx(tx, document_id: int, title: str) -> None:
    tx.run(
        """
        MERGE (d:Document {document_id: $document_id})
        SET d.title = $title
        """,
        document_id=document_id,
        title=title,
    )


def _create_clause_node_tx(tx, document_id: int, chunk: dict) -> None:
    tx.run(
        """
        MATCH (d:Document {document_id: $document_id})
        MERGE (c:Clause {chunk_id: $chunk_id, document_id: $document_id})
        SET c.text_content = $text_content
        MERGE (d)-[:HAS_CLAUSE]->(c)
        """,
        document_id=document_id,
        chunk_id=chunk["chunk_id"],
        text_content=chunk["text_content"],
    )


def create_cross_document_reference(
    source_doc_id: int,
    source_chunk_id: str,
    target_doc_id: int,
    target_chunk_id: str,
    reference_type: str = "REFERENCES",
) -> None:
    if reference_type not in _ALLOWED_REFERENCE_TYPES:
        raise ValueError(
            f"Invalid reference_type '{reference_type}'. "
            f"Allowed values: {sorted(_ALLOWED_REFERENCE_TYPES)}"
        )

    # Cypher does not support parameterized relationship types; whitelist guards injection.
    query = (
        f"MATCH (src:Clause {{chunk_id: $source_chunk_id, document_id: $source_doc_id}}) "
        f"MATCH (tgt:Clause {{chunk_id: $target_chunk_id, document_id: $target_doc_id}}) "
        f"MERGE (src)-[:{reference_type}]->(tgt)"
    )

    def _tx(tx) -> None:
        tx.run(
            query,
            source_doc_id=source_doc_id,
            source_chunk_id=source_chunk_id,
            target_doc_id=target_doc_id,
            target_chunk_id=target_chunk_id,
        )

    driver = get_neo4j_driver()
    with driver.session() as session:
        session.execute_write(_tx)

    logger.info(
        f"Edge created: doc:{source_doc_id}/{source_chunk_id} "
        f"--[{reference_type}]--> doc:{target_doc_id}/{target_chunk_id}"
    )
