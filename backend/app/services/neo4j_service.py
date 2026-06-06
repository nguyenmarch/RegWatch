from __future__ import annotations

import logging
from typing import Any

from app.core.neo4j_client import get_neo4j_driver
from app.schemas.document import (
    Chuong,
    Dieu,
    DocumentInfo,
    LegalDocument,
    Relationship,
    RelationshipType,
)

logger = logging.getLogger(__name__)


# ── Schema constraints (call once at startup) ─────────────────


def ensure_neo4j_constraints() -> None:
    driver = get_neo4j_driver()
    constraints = [
        "CREATE CONSTRAINT IF NOT EXISTS FOR (d:Document) REQUIRE d.document_id IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Chapter)  REQUIRE c.chapter_id  IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (s:Section)  REQUIRE s.section_id  IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (a:Article)  REQUIRE a.article_id  IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (k:Clause)   REQUIRE k.clause_id   IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Point)    REQUIRE p.point_id    IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Chunk)    REQUIRE c.chunk_id    IS UNIQUE",
    ]
    with driver.session() as session:
        for stmt in constraints:
            session.run(stmt)
    logger.info("[Neo4j] Uniqueness constraints ensured.")


# ── Public entry point ─────────────────────────────────────────


def build_document_graph(doc: LegalDocument) -> None:
    doc_info = doc.document_info
    doc_id = doc_info.document_id

    chapters: list[dict[str, Any]] = []
    sections: list[dict[str, Any]] = []
    chapter_articles: list[dict[str, Any]] = []
    section_articles: list[dict[str, Any]] = []
    direct_articles: list[dict[str, Any]] = []
    clauses: list[dict[str, Any]] = []
    points: list[dict[str, Any]] = []

    for item in doc.content:
        if isinstance(item, Chuong):
            ch_id = f"{doc_id}_C{item.chuong_so}"
            chapters.append(
                {
                    "chapter_id": ch_id,
                    "chuong_so": item.chuong_so,
                    "chuong_ten": item.chuong_ten,
                }
            )

            for dieu in item.dieu_luat:
                _collect_article(dieu, doc_id, ch_id, chapter_articles, clauses, points)

            for muc in item.muc:
                sec_id = f"{ch_id}_M{muc.muc_so}"
                sections.append(
                    {
                        "section_id": sec_id,
                        "parent_id": ch_id,
                        "muc_so": muc.muc_so,
                        "muc_ten": muc.muc_ten,
                    }
                )
                for dieu in muc.dieu_luat:
                    _collect_article(dieu, doc_id, sec_id, section_articles, clauses, points)

        elif isinstance(item, Dieu):
            _collect_article(item, doc_id, doc_id, direct_articles, clauses, points)

    driver = get_neo4j_driver()
    
    with driver.session() as session:
        session.execute_write(_tx_create_document, doc_info)

        if chapters:
            session.execute_write(_tx_create_chapters, doc_id, chapters)
        if sections:
            session.execute_write(_tx_create_sections, doc_id, sections)
        if chapter_articles:
            session.execute_write(
                _tx_create_articles, doc_id, chapter_articles, "Chapter", "chapter_id"
            )
        if section_articles:
            session.execute_write(
                _tx_create_articles, doc_id, section_articles, "Section", "section_id"
            )
        if direct_articles:
            session.execute_write(
                _tx_create_articles, doc_id, direct_articles, "Document", "document_id"
            )
        if clauses:
            session.execute_write(_tx_create_clauses, doc_id, clauses)
        if points:
            session.execute_write(_tx_create_points, doc_id, points)

        if doc.relationships_neo4j:
            _create_inter_doc_relationships(session, doc_id, doc.relationships_neo4j)

    total = (
        len(chapters)
        + len(sections)
        + len(chapter_articles)
        + len(section_articles)
        + len(direct_articles)
        + len(clauses)
        + len(points)
    )
    logger.info("[Neo4j] Graph built for %s: %d structural nodes, %d inter-document edges.",
                doc_id, total, len(doc.relationships_neo4j))


# ── Data collection helpers ────────────────────────────────────


def _collect_article(
    dieu: Dieu,
    doc_id: str,
    parent_id: str,
    articles: list[dict[str, Any]],
    clauses: list[dict[str, Any]],
    points: list[dict[str, Any]],
) -> None:
    art_id = f"{doc_id}_D{dieu.dieu_so}"
    articles.append(
        {
            "article_id": art_id,
            "parent_id": parent_id,
            "dieu_so": dieu.dieu_so,
            "dieu_ten": dieu.dieu_ten or "",
            "noi_dung_truoc_khoan": dieu.noi_dung_truoc_khoan or "",
        }
    )

    for khoan in dieu.khoan:
        cl_id = f"{art_id}_K{khoan.khoan_so or 'x'}"
        clauses.append(
            {
                "clause_id": cl_id,
                "article_id": art_id,
                "khoan_so": khoan.khoan_so or "",
                "noi_dung": khoan.noi_dung,
            }
        )

        for diem in khoan.diem:
            pt_id = f"{cl_id}_d{diem.diem_so}"
            points.append(
                {
                    "point_id": pt_id,
                    "clause_id": cl_id,
                    "diem_so": diem.diem_so,
                    "noi_dung": diem.noi_dung,
                }
            )


# ── Batch Cypher transaction functions ─────────────────────────


def _tx_create_document(tx, doc_info: DocumentInfo) -> None:
    tx.run(
        """
        MERGE (d:Document {document_id: $document_id})
        SET d.loai_van_ban     = $loai_van_ban,
            d.so_hieu          = $so_hieu,
            d.co_quan_ban_hanh = $co_quan_ban_hanh,
            d.ngay_ban_hanh    = $ngay_ban_hanh,
            d.ngay_hieu_luc    = $ngay_hieu_luc,
            d.nguoi_ky         = $nguoi_ky,
            d.trich_yeu        = $trich_yeu
        """,
        document_id=doc_info.document_id,
        loai_van_ban=doc_info.loai_van_ban,
        so_hieu=doc_info.so_hieu,
        co_quan_ban_hanh=doc_info.co_quan_ban_hanh or "",
        ngay_ban_hanh=doc_info.ngay_ban_hanh or "",
        ngay_hieu_luc=doc_info.ngay_hieu_luc or "",
        nguoi_ky=doc_info.nguoi_ky or "",
        trich_yeu=doc_info.trich_yeu or "",
    )


def _tx_create_chapters(tx, doc_id: str, chapters: list[dict[str, Any]]) -> None:
    tx.run(
        """
        MATCH (d:Document {document_id: $doc_id})
        UNWIND $chapters AS ch
        MERGE (c:Chapter {chapter_id: ch.chapter_id})
        SET c.document_id = $doc_id,
            c.chuong_so   = ch.chuong_so,
            c.chuong_ten  = ch.chuong_ten
        MERGE (d)-[:HAS_CHAPTER]->(c)
        """,
        doc_id=doc_id,
        chapters=chapters,
    )


def _tx_create_sections(tx, doc_id: str, sections: list[dict[str, Any]]) -> None:
    tx.run(
        """
        UNWIND $sections AS sec
        MATCH (c:Chapter {chapter_id: sec.parent_id})
        MERGE (s:Section {section_id: sec.section_id})
        SET s.document_id = $doc_id,
            s.muc_so      = sec.muc_so,
            s.muc_ten     = sec.muc_ten
        MERGE (c)-[:HAS_SECTION]->(s)
        """,
        doc_id=doc_id,
        sections=sections,
    )


def _tx_create_articles(
    tx,
    doc_id: str,
    articles: list[dict[str, Any]],
    parent_label: str,
    parent_key: str,
) -> None:
    query = f"""
        UNWIND $articles AS art
        MATCH (p:{parent_label} {{{parent_key}: art.parent_id}})
        MERGE (a:Article {{article_id: art.article_id}})
        SET a.document_id          = $doc_id,
            a.dieu_so              = art.dieu_so,
            a.dieu_ten             = art.dieu_ten,
            a.noi_dung_truoc_khoan = art.noi_dung_truoc_khoan
        MERGE (p)-[:HAS_ARTICLE]->(a)
    """
    tx.run(query, doc_id=doc_id, articles=articles)


def _tx_create_clauses(tx, doc_id: str, clauses: list[dict[str, Any]]) -> None:
    tx.run(
        """
        UNWIND $clauses AS cl
        MATCH (a:Article {article_id: cl.article_id})
        MERGE (k:Clause {clause_id: cl.clause_id})
        SET k.document_id = $doc_id,
            k.khoan_so    = cl.khoan_so,
            k.noi_dung    = cl.noi_dung
        MERGE (a)-[:HAS_CLAUSE]->(k)
        """,
        doc_id=doc_id,
        clauses=clauses,
    )


def _tx_create_points(tx, doc_id: str, points: list[dict[str, Any]]) -> None:
    tx.run(
        """
        UNWIND $points AS pt
        MATCH (k:Clause {clause_id: pt.clause_id})
        MERGE (p:Point {point_id: pt.point_id})
        SET p.document_id = $doc_id,
            p.diem_so     = pt.diem_so,
            p.noi_dung    = pt.noi_dung
        MERGE (k)-[:HAS_POINT]->(p)
        """,
        doc_id=doc_id,
        points=points,
    )


# ── Inter-document relationships ───────────────────────────────


_ALLOWED_REL_TYPES = frozenset(t.value for t in RelationshipType)


def _create_inter_doc_relationships(
    session, doc_id: str, relationships: list[Relationship]
) -> None:
    by_type: dict[str, list[str]] = {}
    for rel in relationships:
        by_type.setdefault(rel.loai_quan_he.value, []).append(rel.van_ban_dich)

    for rel_type, targets in by_type.items():
        if rel_type not in _ALLOWED_REL_TYPES:
            logger.warning("[Neo4j] Skipping unknown relationship type: %s", rel_type)
            continue

        def _tx(tx, rt: str = rel_type, tgts: list[str] = targets) -> None:
            query = f"""
                MATCH (src:Document {{document_id: $doc_id}})
                UNWIND $targets AS target_id
                MERGE (tgt:Document {{document_id: target_id}})
                MERGE (src)-[:{rt}]->(tgt)
            """
            tx.run(query, doc_id=doc_id, targets=tgts)

        session.execute_write(_tx)


# ── Chunk-based graph (PDF/DOCX pipeline) ─────────────────────


def build_chunk_graph(doc_id: int, title: str, chunks: list) -> None:
    """Build Document → Chunk nodes from SemanticChunk objects produced by split_legal_document."""
    from app.core.config import settings

    doc_id_str = str(doc_id)
    driver = get_neo4j_driver()
    chunk_dicts = [c.model_dump() for c in chunks]
    batch_size = settings.NEO4J_CHUNK_BATCH_SIZE
    total_batches = (len(chunk_dicts) + batch_size - 1) // batch_size

    with driver.session() as session:
        session.execute_write(
            lambda tx: tx.run(
                "MERGE (d:Document {document_id: $doc_id}) SET d.title = $title",
                doc_id=doc_id_str,
                title=title,
            )
        )

        for batch_num, start in enumerate(range(0, len(chunk_dicts), batch_size), 1):
            batch = chunk_dicts[start:start + batch_size]
            session.execute_write(
                lambda tx, b=batch: tx.run(
                    """
                    MATCH (d:Document {document_id: $doc_id})
                    UNWIND $chunks AS ch
                    MERGE (c:Chunk {chunk_id: ch.chunk_id})
                    SET c += ch.metadata, c.text_content = ch.text_content
                    MERGE (d)-[:HAS_CHUNK]->(c)
                    """,
                    doc_id=doc_id_str,
                    chunks=b,
                )
            )
            logger.info("[Neo4j] Chunk batch %d/%d — %d nodes written — doc_id=%s",
                        batch_num, total_batches, len(batch), doc_id)

        if len(chunk_dicts) > 1:
            pairs = [
                {"from_id": chunk_dicts[i]["chunk_id"], "to_id": chunk_dicts[i + 1]["chunk_id"]}
                for i in range(len(chunk_dicts) - 1)
            ]
            for start in range(0, len(pairs), batch_size):
                batch_pairs = pairs[start:start + batch_size]
                session.execute_write(
                    lambda tx, p=batch_pairs: tx.run(
                        """
                        UNWIND $pairs AS p
                        MATCH (a:Chunk {chunk_id: p.from_id}), (b:Chunk {chunk_id: p.to_id})
                        MERGE (a)-[:NEXT_CHUNK]->(b)
                        """,
                        pairs=p,
                    )
                )

    logger.info("[Neo4j] Chunk graph complete — doc_id=%s, %d chunks.", doc_id, len(chunks))


