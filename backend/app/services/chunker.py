from __future__ import annotations

import hashlib
import json
import logging
import re
from pathlib import Path

from app.schemas.document import (
    LegalDocument,
    LegalChunk,
    LegalPath,
    Chapter,
    Article,
    Clause,
    Point,
    Appendix,
)

logger = logging.getLogger(__name__)


def _stable_chunk_id(
    document_id: str,
    chapter: str | None = None,
    section: str | None = None,
    article: str | None = None,
    clause: str | None = None,
    point: str | None = None,
) -> str:
    """Generate stable SHA256-based chunk ID from hierarchical position."""
    components = [document_id]
    if chapter:
        components.append(f"CH:{chapter}")
    if section:
        components.append(f"SEC:{section}")
    if article:
        components.append(f"ART:{article}")
    if clause:
        components.append(f"KHO:{clause}")
    if point:
        components.append(f"PNT:{point}")

    combined = "|".join(components)
    hash_digest = hashlib.sha256(combined.encode()).hexdigest()[:12]
    return f"{document_id}_{hash_digest}"


def _build_full_context(
    article: Article,
    clause: Clause | None = None,
    point: Point | None = None,
) -> str:
    """Build full parent context for a chunk."""
    context_lines = []

    article_header = f"Điều {article.article_number}"
    if article.title:
        article_header += f". {article.title}"
    context_lines.append(article_header)

    if article.introductory_content:
        context_lines.append(article.introductory_content)

    if clause:
        if clause.clause_number:
            context_lines.append(f"Khoản {clause.clause_number}. {clause.content}")
        else:
            context_lines.append(clause.content)

        if point:
            context_lines.append(f"{point.point_number}) {point.content}")

    return "\n".join(context_lines)


def chunk_legal_document(doc: LegalDocument) -> list[LegalChunk]:
    """
    Semantic chunker for structured legal documents.
    Creates chunks at Article, Clause, and Point levels with full hierarchical context.
    """
    chunks: list[LegalChunk] = []
    meta = doc.metadata
    doc_id = meta.document_id

    def _process_article(
        article: Article,
        chapter_num: str | None = None,
        section_num: str | None = None,
        chapter_title: str | None = None,
        section_title: str | None = None,
    ) -> None:
        """Process a single article and its sub-elements."""
        article_level_meta = {
            "document_type": meta.document_type.value if meta.document_type else None,
            "issued_date": meta.issued_date.isoformat() if meta.issued_date else None,
            "effective_date": meta.effective_date.isoformat() if meta.effective_date else None,
            "issuing_authority": meta.issuing_authority,
            "article_number": article.article_number,
            "article_title": article.title,
            "chapter_number": chapter_num,
            "chapter_title": chapter_title,
            "section_number": section_num,
            "section_title": section_title,
        }

        # Article-level chunk (intro content)
        if article.introductory_content:
            chunk_id = _stable_chunk_id(
                doc_id,
                chapter=chapter_num,
                section=section_num,
                article=article.article_number,
            )
            chunk_text = _build_full_context(article)

            chunks.append(
                LegalChunk(
                    chunk_id=chunk_id,
                    document_id=doc_id,
                    text=chunk_text,
                    chunk_type="ARTICLE",
                    path=LegalPath(
                        chapter=chapter_num,
                        section=section_num,
                        article=article.article_number,
                    ),
                    metadata={**article_level_meta, "has_clauses": bool(article.clauses)},
                )
            )

        # Clause and Point level chunks
        for clause in article.clauses:
            if not clause.points:
                # Clause without points
                chunk_id = _stable_chunk_id(
                    doc_id,
                    chapter=chapter_num,
                    section=section_num,
                    article=article.article_number,
                    clause=clause.clause_number,
                )
                chunk_text = _build_full_context(article, clause)

                chunks.append(
                    LegalChunk(
                        chunk_id=chunk_id,
                        document_id=doc_id,
                        text=chunk_text,
                        chunk_type="CLAUSE",
                        path=LegalPath(
                            chapter=chapter_num,
                            section=section_num,
                            article=article.article_number,
                            clause=clause.clause_number,
                        ),
                        metadata={
                            **article_level_meta,
                            "clause_number": clause.clause_number,
                        },
                    )
                )
            else:
                # Clause with points - create point-level chunks
                for point in clause.points:
                    chunk_id = _stable_chunk_id(
                        doc_id,
                        chapter=chapter_num,
                        section=section_num,
                        article=article.article_number,
                        clause=clause.clause_number,
                        point=point.point_number,
                    )
                    chunk_text = _build_full_context(article, clause, point)

                    chunks.append(
                        LegalChunk(
                            chunk_id=chunk_id,
                            document_id=doc_id,
                            text=chunk_text,
                            chunk_type="POINT",
                            path=LegalPath(
                                chapter=chapter_num,
                                section=section_num,
                                article=article.article_number,
                                clause=clause.clause_number,
                                point=point.point_number,
                            ),
                            metadata={
                                **article_level_meta,
                                "clause_number": clause.clause_number,
                                "point_number": point.point_number,
                            },
                        )
                    )

    # Process main content (chapters/articles)
    for item in doc.content:
        if isinstance(item, Chapter):
            chapter_num = item.chapter_number
            chapter_title = item.title

            # Process sections within chapter
            for section in item.sections:
                section_num = section.section_number
                section_title = section.title

                for article in section.articles:
                    _process_article(
                        article,
                        chapter_num=chapter_num,
                        section_num=section_num,
                        chapter_title=chapter_title,
                        section_title=section_title,
                    )

            # Process articles directly in chapter
            for article in item.articles:
                _process_article(
                    article,
                    chapter_num=chapter_num,
                    chapter_title=chapter_title,
                )

        elif isinstance(item, Article):
            # Standalone article
            _process_article(item)

    # Process appendices
    for appendix in doc.appendices:
        _process_appendix(doc, appendix)

    logger.info(
        "[Chunker] Generated %d chunks from document %s (%s)",
        len(chunks),
        doc_id,
        meta.document_type.value,
    )
    return chunks


def _process_appendix(doc: LegalDocument, appendix: Appendix) -> list[LegalChunk]:
    """Process appendix content into chunks."""
    chunks: list[LegalChunk] = []
    doc_id = doc.metadata.document_id

    base_meta = {
        "document_type": doc.metadata.document_type.value if doc.metadata.document_type else None,
        "issued_date": doc.metadata.issued_date.isoformat() if doc.metadata.issued_date else None,
        "appendix_number": appendix.appendix_number,
        "appendix_title": appendix.title,
    }

    # Introduction chunk
    if appendix.introduction:
        chunk_id = _stable_chunk_id(doc_id, article=f"APP_{appendix.appendix_number}")
        chunks.append(
            LegalChunk(
                chunk_id=chunk_id,
                document_id=doc_id,
                text=f"Phụ lục {appendix.appendix_number}\n{appendix.introduction}",
                chunk_type="APPENDIX",
                path=LegalPath(article=f"APP_{appendix.appendix_number}"),
                metadata=base_meta,
            )
        )

    # Text data chunks
    for idx, text in enumerate(appendix.text_data):
        chunk_id = _stable_chunk_id(
            doc_id, article=f"APP_{appendix.appendix_number}_t{idx}"
        )
        chunks.append(
            LegalChunk(
                chunk_id=chunk_id,
                document_id=doc_id,
                text=text,
                chunk_type="APPENDIX",
                path=LegalPath(article=f"APP_{appendix.appendix_number}"),
                metadata={**base_meta, "text_index": idx},
            )
        )

    # Table data chunks
    if appendix.table_data:
        chunk_id = _stable_chunk_id(
            doc_id, article=f"APP_{appendix.appendix_number}_table"
        )
        table_text = json.dumps(appendix.table_data, ensure_ascii=False, indent=2)
        chunks.append(
            LegalChunk(
                chunk_id=chunk_id,
                document_id=doc_id,
                text=table_text,
                chunk_type="APPENDIX",
                path=LegalPath(article=f"APP_{appendix.appendix_number}"),
                metadata={**base_meta, "is_table": True},
            )
        )

    return chunks


def fallback_text_chunker(
    text: str,
    doc_id: str,
    filename: str,
    document_type: str | None = None,
) -> list[LegalChunk]:
    """
    Fallback paragraph-aware sliding-window chunker for raw text.
    Use this only when structured parsing fails.
    Generates simple sequential chunks without hierarchical context.
    """
    from app.core.config import settings

    size = settings.CHUNK_SIZE
    overlap = settings.CHUNK_OVERLAP
    stem = Path(filename).stem

    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    logger.info(
        "[Chunker] fallback_text_chunker — doc_id=%s, paragraphs=%d, size=%d, overlap=%d",
        doc_id,
        len(paragraphs),
        size,
        overlap,
    )

    chunks: list[LegalChunk] = []
    buf: list[str] = []
    buf_len = 0
    idx = 0

    def _flush(buf: list[str], idx: int) -> LegalChunk:
        body = "\n\n".join(buf)
        chunk_id = hashlib.sha256(
            f"{doc_id}|fallback|{idx}".encode()
        ).hexdigest()[:12]

        return LegalChunk(
            chunk_id=f"{doc_id}_fb_{chunk_id}",
            document_id=doc_id,
            text=body,
            chunk_type="TEXT",
            path=LegalPath(),
            metadata={
                "filename": stem,
                "chunk_index": idx,
                "document_type": document_type,
                "is_fallback": True,
            },
        )

    for para in paragraphs:
        if buf_len + len(para) > size and buf:
            chunks.append(_flush(buf, idx))
            idx += 1
            tail: list[str] = []
            tail_len = 0
            for p in reversed(buf):
                if tail_len + len(p) > overlap:
                    break
                tail.insert(0, p)
                tail_len += len(p)
            buf, buf_len = tail, tail_len
        buf.append(para)
        buf_len += len(para)

    if buf:
        chunks.append(_flush(buf, idx))

    logger.info("[Chunker] Produced %d fallback chunks from doc_id=%s", len(chunks), doc_id)
    return chunks
