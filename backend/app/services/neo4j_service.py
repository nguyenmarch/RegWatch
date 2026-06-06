from app.core.neo4j_client import get_neo4j_driver
from app.utils.logger import logger
from app.utils.reference_extractor import extract_article_numbers

_ALLOWED_REFERENCE_TYPES = frozenset({"REFERENCES", "AMENDS", "SUPERSEDES", "IMPLEMENTS"})


def _esc(s) -> str:
    return str(s).replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", "")


def generate_cypher_strings(document_id: int, title: str, chunks: list[dict]) -> str:
    """Generate all Cypher statements needed to build the document graph.

    Returns a multi-line string where each non-comment line is one executable
    Cypher statement.  Does NOT execute anything on Neo4j.
    """
    lines: list[str] = []

    # Document node
    lines.append("// Document node")
    lines.append(
        f"MERGE (d:Document {{document_id: {document_id}}}) "
        f"SET d.title = '{_esc(title)}'"
    )

    # Article nodes
    articles: dict[int, str] = {}
    for chunk in chunks:
        art_num = chunk.get("article_number")
        if art_num is not None:
            articles.setdefault(art_num, chunk.get("header", f"Điều {art_num}"))

    if articles:
        lines.append("")
        lines.append("// Article nodes — linked to their Document")
        for art_num in sorted(articles):
            header = articles[art_num]
            article_id = f"doc:{document_id}:art:{art_num}"
            lines.append(
                f"MATCH (d:Document {{document_id: {document_id}}}) "
                f"MERGE (a:Article {{article_id: '{_esc(article_id)}'}}) "
                f"SET a.document_id = {document_id}, a.article_number = {art_num}, "
                f"a.header = '{_esc(header)}' "
                f"MERGE (d)-[:HAS_ARTICLE]->(a)"
            )

    # Clause nodes
    lines.append("")
    lines.append("// Clause nodes — linked to Article (or Document when article unknown)")
    for chunk in chunks:
        chunk_id = chunk["chunk_id"]
        art_num = chunk.get("article_number")
        text = _esc(chunk["text_content"][:200])
        if art_num is not None:
            lines.append(
                f"MATCH (a:Article {{document_id: {document_id}, article_number: {art_num}}}) "
                f"MERGE (c:Clause {{chunk_id: '{_esc(chunk_id)}', document_id: {document_id}}}) "
                f"SET c.text_content = '{text}', c.article_number = {art_num} "
                f"MERGE (a)-[:HAS_CLAUSE]->(c)"
            )
        else:
            lines.append(
                f"MATCH (d:Document {{document_id: {document_id}}}) "
                f"MERGE (c:Clause {{chunk_id: '{_esc(chunk_id)}', document_id: {document_id}}}) "
                f"SET c.text_content = '{text}' "
                f"MERGE (d)-[:HAS_CLAUSE]->(c)"
            )

    # NEXT_CLAUSE edges
    chunk_by_article: dict[int, list[dict]] = {}
    for chunk in chunks:
        art = chunk.get("article_number")
        if art is not None:
            chunk_by_article.setdefault(art, []).append(chunk)

    next_lines: list[str] = []
    for art_num in sorted(chunk_by_article):
        art_chunks = sorted(chunk_by_article[art_num], key=lambda c: c["chunk_id"])
        for i in range(len(art_chunks) - 1):
            cid1 = _esc(art_chunks[i]["chunk_id"])
            cid2 = _esc(art_chunks[i + 1]["chunk_id"])
            next_lines.append(
                f"MATCH (c1:Clause {{chunk_id: '{cid1}', document_id: {document_id}}}), "
                f"(c2:Clause {{chunk_id: '{cid2}', document_id: {document_id}}}) "
                f"MERGE (c1)-[:NEXT_CLAUSE]->(c2)"
            )

    if next_lines:
        lines.append("")
        lines.append("// Sequential links (NEXT_CLAUSE)")
        lines.extend(next_lines)

    # REFERENCES edges
    ref_lines: list[str] = []
    for chunk in chunks:
        cited_nums = list(set(extract_article_numbers(chunk["text_content"])))
        cited_nums = [n for n in cited_nums if n in articles]
        for art_num in cited_nums:
            cid = _esc(chunk["chunk_id"])
            ref_lines.append(
                f"MATCH (c:Clause {{chunk_id: '{cid}', document_id: {document_id}}}), "
                f"(a:Article {{document_id: {document_id}, article_number: {art_num}}}) "
                f"MERGE (c)-[:REFERENCES]->(a)"
            )

    if ref_lines:
        lines.append("")
        lines.append("// Cross-reference links (REFERENCES)")
        lines.extend(ref_lines)

    return "\n".join(lines)


def execute_cypher_statements(cypher_text: str) -> None:
    """Execute each non-comment, non-empty line of cypher_text as a separate statement."""
    statements = [
        line.strip()
        for line in cypher_text.splitlines()
        if line.strip() and not line.strip().startswith("//")
    ]
    driver = get_neo4j_driver()
    with driver.session() as session:
        for stmt in statements:
            session.run(stmt)
    logger.info("execute_cypher_statements: executed %d statements.", len(statements))


def build_document_graph(document_id: int, title: str, chunks: list[dict]) -> None:
    driver = get_neo4j_driver()
    with driver.session() as session:
        session.execute_write(_create_document_node_tx, document_id, title)

        # Group chunks by article_number so we can create Article nodes
        articles: dict[int, str] = {}  # article_number -> header
        for chunk in chunks:
            art_num = chunk.get("article_number")
            if art_num is not None:
                articles.setdefault(art_num, chunk.get("header", f"Điều {art_num}"))

        for art_num, header in articles.items():
            session.execute_write(
                _create_article_node_tx, document_id, art_num, header
            )

        for chunk in chunks:
            session.execute_write(_create_clause_node_tx, document_id, chunk)

        # NEXT_CLAUSE edges — consecutive chunks sharing the same article
        session.execute_write(_create_next_clause_edges_tx, document_id)

        # REFERENCES edges — inline citations extracted by regex
        for chunk in chunks:
            cited_nums = extract_article_numbers(chunk["text_content"])
            cited_nums = list(set(cited_nums))  # dedup
            if cited_nums:
                session.execute_write(
                    _create_reference_edges_tx,
                    document_id,
                    chunk["chunk_id"],
                    cited_nums,
                )

    logger.info(
        f"Knowledge graph built for document_id={document_id} "
        f"with {len(chunks)} clause(s) and {len(articles)} article(s)."
    )


def _create_document_node_tx(tx, document_id: int, title: str) -> None:
    tx.run(
        "MERGE (d:Document {document_id: $document_id}) SET d.title = $title",
        document_id=document_id,
        title=title,
    )


def _create_article_node_tx(tx, document_id: int, article_number: int, header: str) -> None:
    article_id = f"doc:{document_id}:art:{article_number}"
    tx.run(
        """
        MATCH (d:Document {document_id: $document_id})
        MERGE (a:Article {article_id: $article_id})
        SET a.document_id = $document_id,
            a.article_number = $article_number,
            a.header = $header
        MERGE (d)-[:HAS_ARTICLE]->(a)
        """,
        document_id=document_id,
        article_id=article_id,
        article_number=article_number,
        header=header,
    )


def _create_clause_node_tx(tx, document_id: int, chunk: dict) -> None:
    art_num = chunk.get("article_number")
    if art_num is not None:
        # Attach clause to its Article node
        tx.run(
            """
            MATCH (a:Article {document_id: $document_id, article_number: $article_number})
            MERGE (c:Clause {chunk_id: $chunk_id, document_id: $document_id})
            SET c.text_content = $text_content,
                c.article_number = $article_number
            MERGE (a)-[:HAS_CLAUSE]->(c)
            """,
            document_id=document_id,
            article_number=art_num,
            chunk_id=chunk["chunk_id"],
            text_content=chunk["text_content"],
        )
    else:
        # No article number — attach directly to Document as a fallback
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


def _create_next_clause_edges_tx(tx, document_id: int) -> None:
    """Link consecutive Clause nodes within the same Article with NEXT_CLAUSE edges."""
    tx.run(
        """
        MATCH (a:Article {document_id: $document_id})-[:HAS_CLAUSE]->(c:Clause)
        WITH a, c ORDER BY c.chunk_id
        WITH a, collect(c) AS clauses
        UNWIND range(0, size(clauses) - 2) AS i
        WITH clauses[i] AS curr, clauses[i + 1] AS nxt
        MERGE (curr)-[:NEXT_CLAUSE]->(nxt)
        """,
        document_id=document_id,
    )


def _create_reference_edges_tx(
    tx, document_id: int, source_chunk_id: str, cited_article_numbers: list[int]
) -> None:
    """Create REFERENCES edges from a Clause to cited Article nodes (same document first)."""
    tx.run(
        """
        MATCH (src:Clause {chunk_id: $chunk_id, document_id: $document_id})
        UNWIND $article_numbers AS art_num
        MATCH (tgt:Article {document_id: $document_id, article_number: art_num})
        WHERE NOT (src)-[:REFERENCES]->(tgt)
        MERGE (src)-[:REFERENCES]->(tgt)
        """,
        document_id=document_id,
        chunk_id=source_chunk_id,
        article_numbers=cited_article_numbers,
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
