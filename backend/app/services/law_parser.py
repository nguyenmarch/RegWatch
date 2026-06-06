from __future__ import annotations

import re
import time
import logging
from dataclasses import dataclass, field as dc_field
from datetime import date
from typing import Any, Iterator

from app.core.enums import (
    DocumentType,
    RelationshipType,
)
from app.schemas.document import (
    LegalDocument,
    DocumentMetadata,
    DocumentRelationship,
    Chapter,
    Section,
    Article,
    Clause,
    Point,
    Appendix,
)



logger = logging.getLogger(__name__)

class ParserError(Exception):
    """Base exception for all parsing errors."""


class MetadataExtractionError(ParserError):
    """Raised when critical metadata cannot be extracted."""


class StructureParsingError(ParserError):
    """Raised when there is a critical failure in the structural hierarchy."""


class DocumentValidationError(ParserError):
    """Raised when parsed document fails structural validation rules."""


# ---------------------------------------------------------------------------
# Centralized Regex Patterns
# ---------------------------------------------------------------------------
class RegexConfig:
    """Compiled regular expressions for extracting legal document structures."""

    # Metadata Patterns - flexible number extraction
    DOC_NUMBER_PATTERN = re.compile(r"Số[:\s]+([A-Za-z0-9/\s\-.,]+?)(?=\s*(?:năm|của|do|$))", re.IGNORECASE)
    DATE_PATTERN = re.compile(
        r"ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})", re.IGNORECASE
    )
    # Matches "có hiệu lực [thi hành] ... từ/kể từ ngày DD tháng MM năm YYYY"
    EFFECTIVE_DATE_PATTERN = re.compile(
        r"có hiệu lực(?:\s+thi\s+hành)?.*?(?:từ|kể từ)\s+ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})",
        re.IGNORECASE,
    )

    # Structural Hierarchy Patterns - OCR tolerant
    CHAPTER_PATTERN = re.compile(r"^(?:CHƯƠNG|CHUONG)\s+([IVXLCDM0-9]+)[\.:]?\s*(.*)$", re.IGNORECASE)
    SECTION_PATTERN = re.compile(r"^(?:Mục|MUC)\s+(\d+)[\.:]?\s*(.*)$", re.IGNORECASE)
    # Support both "Điều 5" and "Điều 5. Title" — title is optional
    ARTICLE_PATTERN = re.compile(r"^(?:Điều|DIEU|Dieu)\s+(\d+[a-z]?)(?:[\.:]?\s*(.*))?$", re.IGNORECASE)
    # Support clause numbers > 99, remove 3-char content minimum
    CLAUSE_PATTERN = re.compile(r"^(\d+)\.\s+(.+)$")
    # Lowercase Vietnamese letters only — no IGNORECASE so uppercase letters don't match
    POINT_PATTERN = re.compile(r"^([a-zđ])\)\s+(.*)$")
    # Extract appendix number: PHỤ LỤC I, PHỤ LỤC 01, PHỤ LỤC A, etc.
    APPENDIX_PATTERN = re.compile(r"^(?:PHỤ LỤC|PHU LUC|Phu luc)\s+([A-Za-z0-9IVXLCDMivxlcdm]+)?(?:\s+(.*))?$", re.IGNORECASE)

    # Cleaning Patterns
    PAGE_NUMBER_PATTERN = re.compile(r"^(Trang\s*\d+|\d+)$", re.IGNORECASE)

    # Relationship Patterns
    BASIS_PATTERN = re.compile(r"^(?:Căn cứ|CAN CU|Can cu)\s+(.*)", re.IGNORECASE)
    REPLACES_PATTERN = re.compile(r"(thay thế|thay the|bãi bỏ|bai bo|hủy bỏ|huy bo)\s+(.*?)(?=\.|\n|$)", re.IGNORECASE)
    AMENDS_PATTERN = re.compile(r"(sửa đổi, bổ sung|sua doi, bo sung|sửa đổi|sua doi)\s+(.*?)(?=\.|\n|$)", re.IGNORECASE)
    GUIDES_PATTERN = re.compile(r"(hướng dẫn|huong dan)\s+(.*?)(?=\.|\n|$)", re.IGNORECASE)
    REFERENCES_PATTERN = re.compile(r"(?:tham chiếu|tham chieu|theo)\s+(.*?)(?=\.|\n|$)", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Pipeline Stages
# ---------------------------------------------------------------------------
class TextCleaner:
    """Normalizes raw text and removes OCR/formatting artifacts in O(n) time."""

    @staticmethod
    def _infer_document_type(lines: list[str]) -> DocumentType:
        """Parse document type from content first, then filename."""
        preamble = " ".join(lines[:50]).lower()

        # Content-based detection (highest priority)
        if any(x in preamble for x in ["nghị định", "nghi dinh"]):
            return DocumentType.DECREE
        if any(x in preamble for x in ["thông tư", "thong tu"]):
            return DocumentType.CIRCULAR
        if any(x in preamble for x in ["quyết định", "quyet dinh"]):
            return DocumentType.DECISION

        # Issuing body hints
        if ("chính phủ" in preamble or "chinh phu" in preamble) and ("ban hành" in preamble or "ban hanh" in preamble):
            return DocumentType.DECREE
        if any(x in preamble for x in ["bộ trưởng", "bo truong", "thống đốc", "thong doc"]):
            return DocumentType.CIRCULAR

        return DocumentType.DECREE 

    @staticmethod
    def clean(raw_text: str) -> Iterator[str]:
        """Yields cleaned, normalized lines."""
        for line in raw_text.splitlines():
            line = line.strip()
            if not line:
                continue
            if RegexConfig.PAGE_NUMBER_PATTERN.match(line):
                continue
            line = re.sub(r"\s+", " ", line)
            yield line


class MetadataExtractor:
    """Extracts top-level metadata utilizing targeted regex sweeps."""

    @staticmethod
    def extract(lines: list[str], filename: str) -> DocumentMetadata:
        # Content-based type detection first (more reliable), filename as fallback
        doc_type = TextCleaner._infer_document_type(lines)
        fname_lower = filename.lower()
        if "thông tư" in fname_lower or "thong tu" in fname_lower:
            doc_type = DocumentType.CIRCULAR
        elif "quyết định" in fname_lower or "quyet dinh" in fname_lower:
            doc_type = DocumentType.DECISION
        elif "nghị định" in fname_lower or "nghi dinh" in fname_lower:
            doc_type = DocumentType.DECREE

        doc_num, issued_date, effective_date = "UNKNOWN", None, None
        issuing_authority, signer, summary = None, None, None

        for line in lines[:50]:
            if m := RegexConfig.DOC_NUMBER_PATTERN.search(line):
                doc_num = m.group(1).strip()
            if m := RegexConfig.DATE_PATTERN.search(line):
                day, month, year = map(int, m.groups())
                try:
                    issued_date = date(year, month, day)
                except ValueError:
                    pass
            # Extract issuing authority (Bộ, Bộ Tư pháp, etc.)
            if "bộ" in line.lower() or "bo" in line.lower():
                if not issuing_authority and len(line) > 5:
                    issuing_authority = line[:100]

        # Effective date and signer typically near the end
        for line in lines[max(0, len(lines) - 100) :]:
            if m := RegexConfig.EFFECTIVE_DATE_PATTERN.search(line):
                day, month, year = map(int, m.groups())
                try:
                    effective_date = date(year, month, day)
                except ValueError:
                    pass
            # Extract signer (usually after "Ký:")
            if "ký:" in line.lower() or "ky:" in line.lower():
                signer = line.split(":", 1)[-1].strip()[:100]

        return DocumentMetadata(
            document_id=doc_num.replace("/", "_"),
            document_type=doc_type,
            document_number=doc_num,
            issued_date=issued_date,
            effective_date=effective_date,
            summary=summary,
            issuing_authority=issuing_authority,
            signer=signer,
        )


class RelationshipExtractor:
    """Scans specific document sections for legal relationships."""

    @staticmethod
    def extract(lines: list[str]) -> list[DocumentRelationship]:
        relationships: list[DocumentRelationship] = []
        seen: set[tuple[str, str]] = set()

        def add_rel(rel_type: RelationshipType, target: str, note: str | None = None) -> None:
            key = (rel_type.value, target)
            if key not in seen:
                seen.add(key)
                relationships.append(
                    DocumentRelationship(
                        relationship_type=rel_type,
                        target_document=target[:200],
                        note=note,
                    )
                )

        n = len(lines)
        preamble_end = min(100, n)
        footer_start = max(0, n - 100)

        for line in lines[:preamble_end]:
            if m := RegexConfig.BASIS_PATTERN.match(line):
                add_rel(RelationshipType.LEGAL_BASIS, m.group(1)[:100], "Extracted from preamble")

        # Implementation clauses (replace/amend/guide) appear toward the end
        for line in lines[footer_start:]:
            if m := RegexConfig.REPLACES_PATTERN.search(line):
                add_rel(RelationshipType.REPLACES, m.group(2))
            if m := RegexConfig.AMENDS_PATTERN.search(line):
                add_rel(RelationshipType.AMENDS, m.group(2))
            if m := RegexConfig.GUIDES_PATTERN.search(line):
                add_rel(RelationshipType.GUIDES, m.group(2))
            if m := RegexConfig.REFERENCES_PATTERN.search(line):
                add_rel(RelationshipType.REFERENCES, m.group(1), "Referenced document")

        return relationships


# ---------------------------------------------------------------------------
# Core Parser & State Machine
# ---------------------------------------------------------------------------

# Intermediate plain dataclasses avoid triggering Pydantic validators mid-parse.
# Section and Chapter validators require children at construction time, so we
# accumulate into these raw structures first and build Pydantic models only at
# finalization when the tree is complete.

@dataclass
class _RawPoint:
    point_number: str
    content: str


@dataclass
class _RawClause:
    clause_number: str | None
    content: str
    points: list[_RawPoint] = dc_field(default_factory=list)


@dataclass
class _RawArticle:
    article_number: str
    title: str | None
    introductory_content: str | None = None
    clauses: list[_RawClause] = dc_field(default_factory=list)


@dataclass
class _RawSection:
    section_number: str
    title: str
    articles: list[_RawArticle] = dc_field(default_factory=list)


@dataclass
class _RawChapter:
    chapter_number: str
    title: str
    sections: list[_RawSection] = dc_field(default_factory=list)
    articles: list[_RawArticle] = dc_field(default_factory=list)


@dataclass
class _RawAppendix:
    appendix_number: str
    title: str | None
    text_data: list[str] = dc_field(default_factory=list)


class StructureParser:
    """
    Deterministic state machine for O(N) hierarchical parsing.
    Accumulates raw intermediate objects, then builds validated Pydantic models
    at finalization once all children are present.
    """

    def __init__(self) -> None:
        self._chapters: list[_RawChapter] = []
        self._standalone_articles: list[_RawArticle] = []
        self._appendices: list[_RawAppendix] = []

        self._cur_chapter: _RawChapter | None = None
        self._cur_section: _RawSection | None = None
        self._cur_article: _RawArticle | None = None
        self._cur_clause: _RawClause | None = None
        self._cur_appendix: _RawAppendix | None = None

        self._in_appendix_mode = False
        self._article_seen = False  # Guard: only enter appendix mode after body content begins

    def parse_lines(self, lines: list[str]) -> tuple[list[Chapter | Article], list[Appendix]]:
        for line in lines:
            if self._try_parse_appendix(line):
                continue
            if self._in_appendix_mode:
                if self._cur_appendix:
                    self._cur_appendix.text_data.append(line)
                continue
            if self._try_parse_chapter(line):
                continue
            if self._try_parse_section(line):
                continue
            if self._try_parse_article(line):
                continue
            if self._try_parse_clause(line):
                continue
            if self._try_parse_point(line):
                continue
            self._append_to_current_node(line)

        return self._finalize_content()

    def _try_parse_appendix(self, line: str) -> bool:
        # Only enter appendix mode after at least one article has been parsed,
        # preventing false matches on "PHỤ LỤC" references in the preamble.
        if not self._article_seen:
            return False
        if m := RegexConfig.APPENDIX_PATTERN.match(line):
            self._in_appendix_mode = True
            # Extract actual appendix number (I, 01, A, etc.) or use auto-increment if missing
            appendix_num = m.group(1).strip() if m.group(1) else str(len(self._appendices) + 1)
            title = m.group(2).strip() if m.group(2) else None
            self._cur_appendix = _RawAppendix(
                appendix_number=appendix_num,
                title=title,
            )
            self._appendices.append(self._cur_appendix)
            return True
        return False

    def _try_parse_chapter(self, line: str) -> bool:
        if m := RegexConfig.CHAPTER_PATTERN.match(line):
            title = m.group(2).strip() if m.group(2) else f"Chương {m.group(1)}"
            self._cur_chapter = _RawChapter(
                chapter_number=m.group(1),
                title=title,
            )
            self._chapters.append(self._cur_chapter)
            self._cur_section = None
            self._cur_article = None
            self._cur_clause = None
            return True
        return False

    def _try_parse_section(self, line: str) -> bool:
        if m := RegexConfig.SECTION_PATTERN.match(line):
            title = m.group(2).strip() if m.group(2) else f"Mục {m.group(1)}"
            self._cur_section = _RawSection(
                section_number=m.group(1),
                title=title,
            )
            if self._cur_chapter:
                self._cur_chapter.sections.append(self._cur_section)
            else:
                logger.warning(
                    "Section %s found outside a chapter; creating implicit chapter.",
                    m.group(1),
                )
                self._cur_chapter = _RawChapter(chapter_number="0", title="(Implicit)")
                self._cur_chapter.sections.append(self._cur_section)
                self._chapters.append(self._cur_chapter)
            self._cur_article = None
            self._cur_clause = None
            return True
        return False

    def _try_parse_article(self, line: str) -> bool:
        if m := RegexConfig.ARTICLE_PATTERN.match(line):
            title = m.group(2).strip() if m.group(2) else None
            self._cur_article = _RawArticle(
                article_number=m.group(1),
                title=title or None,
            )
            self._article_seen = True
            if self._cur_section:
                self._cur_section.articles.append(self._cur_article)
            elif self._cur_chapter:
                self._cur_chapter.articles.append(self._cur_article)
            else:
                self._standalone_articles.append(self._cur_article)
            self._cur_clause = None
            return True
        return False

    def _try_parse_clause(self, line: str) -> bool:
        if not self._cur_article:
            return False
        if m := RegexConfig.CLAUSE_PATTERN.match(line):
            self._cur_clause = _RawClause(clause_number=m.group(1), content=m.group(2))
            self._cur_article.clauses.append(self._cur_clause)
            return True
        return False

    def _try_parse_point(self, line: str) -> bool:
        if m := RegexConfig.POINT_PATTERN.match(line):
            if not self._cur_clause:
                if self._cur_article:
                    # Implicit clause with no number to host the point
                    self._cur_clause = _RawClause(clause_number=None, content="")
                    self._cur_article.clauses.append(self._cur_clause)
                else:
                    return False
            self._cur_clause.points.append(
                _RawPoint(point_number=m.group(1), content=m.group(2))
            )
            return True
        return False

    def _append_to_current_node(self, line: str) -> None:
        """Appends free text to the most deeply nested active node."""
        if self._cur_clause:
            if self._cur_clause.points:
                self._cur_clause.points[-1].content += f" {line}"
            else:
                self._cur_clause.content += f" {line}"
        elif self._cur_article:
            if self._cur_article.introductory_content is None:
                self._cur_article.introductory_content = line
            else:
                self._cur_article.introductory_content += f" {line}"

    # -- Pydantic model builders (called only after all children are accumulated) --

    def _build_article(self, raw: _RawArticle) -> Article:
        return Article(
            article_number=raw.article_number,
            title=raw.title,
            introductory_content=raw.introductory_content,
            clauses=[
                Clause(
                    clause_number=c.clause_number,
                    content=c.content,
                    points=[Point(point_number=p.point_number, content=p.content) for p in c.points],
                )
                for c in raw.clauses
            ],
        )

    def _build_section(self, raw: _RawSection) -> Section | None:
        articles = [self._build_article(a) for a in raw.articles]
        if not articles:
            logger.warning("Section %s has no articles; skipping.", raw.section_number)
            return None
        return Section(section_number=raw.section_number, title=raw.title, articles=articles)

    def _build_chapter(self, raw: _RawChapter) -> Chapter | None:
        sections = [s for s in (self._build_section(r) for r in raw.sections) if s is not None]
        articles = [self._build_article(a) for a in raw.articles]
        if not sections and not articles:
            logger.warning("Chapter %s has no content; skipping.", raw.chapter_number)
            return None
        return Chapter(
            chapter_number=raw.chapter_number,
            title=raw.title,
            sections=sections,
            articles=articles,
        )

    def _finalize_content(self) -> tuple[list[Chapter | Article], list[Appendix]]:
        content: list[Chapter | Article] = []
        for raw_ch in self._chapters:
            ch = self._build_chapter(raw_ch)
            if ch:
                content.append(ch)
        for raw_art in self._standalone_articles:
            content.append(self._build_article(raw_art))

        appendices = [
            Appendix(appendix_number=a.appendix_number, title=a.title, text_data=a.text_data)
            for a in self._appendices
        ]
        return content, appendices


# ---------------------------------------------------------------------------
# Validation & Repair
# ---------------------------------------------------------------------------
class HierarchyRepairService:
    """
    LLM Repair Layer — invoked by ValidationEngine for targeted anomalous fragments.
    Integrate an Anthropic/OpenAI client here with strict schema-constrained prompts.
    """

    def repair_fragment(self, text_fragment: str, context: str) -> list[Any]:
        logger.info("LLM Repair Service invoked (stub — implement client here).")
        # TODO: call LLM with prompt: "Output pure JSON matching Pydantic schema. Do not hallucinate."
        return []


class ValidationEngine:
    """Runs structural checks and coordinates with the repair service if needed."""

    def __init__(self, repair_service: HierarchyRepairService) -> None:
        self.repair_service = repair_service
        self.warnings: list[str] = []

    def validate(self, content: list[Chapter | Article]) -> list[Chapter | Article]:
        article_numbers = self._extract_article_numbers(content)
        self._check_sequence(article_numbers)
        self._check_duplicates(article_numbers)

        for node in content:
            self._recursive_validation(node)

        if self.warnings:
            logger.warning("Validation completed with %d warnings.", len(self.warnings))

        return content

    def _extract_article_numbers(self, content: list[Any]) -> list[str]:
        nums: list[str] = []
        for item in content:
            if isinstance(item, Article):
                nums.append(item.article_number)
            elif isinstance(item, Chapter):
                for sec in item.sections:
                    nums.extend(a.article_number for a in sec.articles)
                nums.extend(a.article_number for a in item.articles)
        return nums

    def _check_sequence(self, numbers: list[str]) -> None:
        try:
            ints = [int(re.sub(r"\D", "", n)) for n in numbers if re.sub(r"\D", "", n)]
            for i in range(1, len(ints)):
                if ints[i] <= ints[i - 1]:
                    self.warnings.append(
                        f"Non-sequential article numbering near Article {numbers[i]}"
                    )
        except Exception as e:
            logger.warning("Article sequence check failed: %s", e)

    def _check_duplicates(self, numbers: list[str]) -> None:
        seen = set()
        for num in numbers:
            if num in seen:
                self.warnings.append(f"Duplicate article number: {num}")
            seen.add(num)

    def _recursive_validation(self, node: Any) -> None:
        if isinstance(node, Clause) and not node.content and node.points:
            self.warnings.append("Point found without explicit Clause content/number.")
        if hasattr(node, "articles"):
            clause_nums = [a.article_number for a in node.articles]
            self._check_list_duplicates(clause_nums, "article")
            for a in node.articles:
                self._recursive_validation(a)
        if hasattr(node, "sections"):
            section_nums = [s.section_number for s in node.sections]
            self._check_list_duplicates(section_nums, "section")
            for s in node.sections:
                self._recursive_validation(s)
        if hasattr(node, "clauses"):
            clause_nums = [c.clause_number for c in node.clauses if c.clause_number]
            self._check_list_duplicates(clause_nums, "clause")
            for c in node.clauses:
                self._recursive_validation(c)

    def _check_list_duplicates(self, items: list[str], item_type: str) -> None:
        seen = set()
        for item in items:
            if item in seen:
                self.warnings.append(f"Duplicate {item_type} number: {item}")
            seen.add(item)


# ---------------------------------------------------------------------------
# Facade / Entry Point
# ---------------------------------------------------------------------------
class LegalDocumentBuilder:
    """Coordinates parsing stages to assemble the final LegalDocument."""

    def __init__(self) -> None:
        self.repair_service = HierarchyRepairService()
        self.validator = ValidationEngine(self.repair_service)

    def build(self, filename: str, text: str) -> LegalDocument:
        t0 = time.perf_counter()
        logger.info("Starting parsing for %s", filename)

        cleaned_lines = list(TextCleaner.clean(text))
        metadata = MetadataExtractor.extract(cleaned_lines, filename)
        relationships = RelationshipExtractor.extract(cleaned_lines)

        parser = StructureParser()
        content, appendices = parser.parse_lines(cleaned_lines)
        content = self.validator.validate(content)

        doc = LegalDocument(
            metadata=metadata,
            relationships=relationships,
            content=content,
            appendices=appendices,
        )

        duration = time.perf_counter() - t0
        logger.info(
            "Parsed %s in %.3fs (%d top-level nodes, %d warnings)",
            filename,
            duration,
            len(content),
            len(self.validator.warnings),
        )
        return doc


class LegalDocumentParser:
    """Public entry point for the parsing module."""

    def __init__(self) -> None:
        self.builder = LegalDocumentBuilder()

    def parse(self, filename: str, text: str) -> LegalDocument:
        """
        Parses raw text extracted from a legal document into a structured LegalDocument model.
        """
        if not text or not text.strip():
            raise ParserError("Input text is empty.")
        try:
            return self.builder.build(filename, text)
        except ParserError:
            raise
        except Exception as e:
            logger.error("Fatal error parsing %s: %s", filename, e, exc_info=True)
            raise ParserError(f"Failed to parse document: {e}") from e


# Example usage:
# parser = LegalDocumentParser()
# legal_doc = parser.parse("nghi_dinh_15.pdf", raw_ocr_text)
