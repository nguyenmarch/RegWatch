"""
Citation extraction and parsing for Vietnamese legal documents.
Supports parsing citations at multiple levels:
- Điều 15 (Article 15)
- Khoản 2 Điều 15 (Clause 2 of Article 15)
- Điểm a Khoản 2 Điều 15 (Point a of Clause 2 of Article 15)
- Nghị định 123/2024/NĐ-CP (Decree 123/2024/NĐ-CP)
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class LegalCitation:
    """Represents a structured legal citation."""
    document_number: Optional[str] = None  # e.g., "123/2024/NĐ-CP"
    document_type: Optional[str] = None    # e.g., "Nghị định", "Thông tư"
    article_number: Optional[str] = None   # e.g., "15"
    clause_number: Optional[str] = None    # e.g., "2"
    point_letter: Optional[str] = None     # e.g., "a"

    def __str__(self) -> str:
        """Return formatted citation string."""
        parts = []
        if self.point_letter:
            parts.append(f"Điểm {self.point_letter}")
        if self.clause_number:
            parts.append(f"Khoản {self.clause_number}")
        if self.article_number:
            parts.append(f"Điều {self.article_number}")
        if self.document_number:
            doc_type = self.document_type or ""
            parts.append(f"{doc_type} {self.document_number}".strip())
        return " ".join(parts)

    def is_complete(self) -> bool:
        """Check if citation has at least article number."""
        return bool(self.article_number)


class CitationExtractor:
    """
    Extract and parse Vietnamese legal citations from text.
    Handles citations at multiple hierarchical levels.
    """

    # Patterns for document types and numbers
    DOC_TYPE_PATTERN = re.compile(
        r"(Nghị định|Thông tư|Quyết định|Quy chuẩn|Thông tư liên tịch|Chỉ thị)",
        re.IGNORECASE
    )

    # Document number: 123/2024/NĐ-CP, 123/2024/TT-BTP, etc.
    DOC_NUMBER_PATTERN = re.compile(
        r"(\d+/\d{4}(?:/[A-Z\-]+)?)",
        re.IGNORECASE
    )

    # Point: Điểm a, điểm b, etc.
    POINT_PATTERN = re.compile(
        r"[Đđ]i[eề]m\s+([a-zđ])",
        re.IGNORECASE
    )

    # Clause: Khoản 1, khoản 2, etc.
    CLAUSE_PATTERN = re.compile(
        r"[Kk]ho[aả]n\s+(\d+)",
        re.IGNORECASE
    )

    # Article: Điều 15, điều 15a, etc.
    ARTICLE_PATTERN = re.compile(
        r"[Đđ]i[eề]u\s+(\d+[a-z]?)",
        re.IGNORECASE
    )

    def extract(self, text: str) -> list[LegalCitation]:
        """Extract all citations from text."""
        citations = []

        # Try to extract document-level citations
        doc_citations = self._extract_document_citations(text)
        citations.extend(doc_citations)

        # Extract article-level and sub-article citations
        article_citations = self._extract_article_citations(text)
        citations.extend(article_citations)

        return list({str(c): c for c in citations}.values())  # Deduplicate

    def _extract_document_citations(self, text: str) -> list[LegalCitation]:
        """Extract document-level citations (e.g., Nghị định 123/2024/NĐ-CP)."""
        citations = []

        # Find all document type + number combinations
        for doc_match in re.finditer(
            r"(Nghị định|Thông tư|Quyết định|Quy chuẩn|Thông tư liên tịch|Chỉ thị)"
            r"(?:\s+số)?\s*(\d+/\d{4}(?:/[A-Z\-]+)?)",
            text,
            re.IGNORECASE
        ):
            doc_type = doc_match.group(1)
            doc_num = doc_match.group(2)
            citations.append(LegalCitation(
                document_type=doc_type,
                document_number=doc_num,
            ))

        return citations

    def _extract_article_citations(self, text: str) -> list[LegalCitation]:
        """Extract article and sub-article citations."""
        citations = []

        # Split text into sentences for better context
        sentences = re.split(r'[.;:\n]', text)

        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue

            # Find all article references
            article_matches = list(self.ARTICLE_PATTERN.finditer(sentence))

            for article_match in article_matches:
                article_num = article_match.group(1)

                # Try to find clause before article
                clause_match = None
                clause_search = sentence[:article_match.start()]
                for match in self.CLAUSE_PATTERN.finditer(clause_search):
                    clause_match = match

                # Try to find point before clause
                point_match = None
                if clause_match:
                    point_search = sentence[:clause_match.start()]
                    for match in self.POINT_PATTERN.finditer(point_search):
                        point_match = match
                else:
                    # Point might be before article directly
                    point_search = sentence[:article_match.start()]
                    for match in self.POINT_PATTERN.finditer(point_search):
                        point_match = match

                # Try to find document context
                doc_type = None
                doc_num = None
                doc_match_before = None
                for match in self.DOC_TYPE_PATTERN.finditer(sentence[:article_match.start()]):
                    doc_match_before = match

                if doc_match_before:
                    doc_type = doc_match_before.group(1)
                    # Find number after document type
                    doc_num_text = sentence[doc_match_before.end():]
                    doc_num_match = self.DOC_NUMBER_PATTERN.search(doc_num_text)
                    if doc_num_match:
                        doc_num = doc_num_match.group(1)

                citation = LegalCitation(
                    document_type=doc_type,
                    document_number=doc_num,
                    article_number=article_num,
                    clause_number=clause_match.group(1) if clause_match else None,
                    point_letter=point_match.group(1) if point_match else None,
                )
                citations.append(citation)

        return citations

    def extract_from_question(
        self, question: str
    ) -> tuple[list[LegalCitation], dict[str, list]]:
        """
        Extract citations and group by type.
        Returns: (all_citations, grouped_by_type)
        """
        citations = self.extract(question)

        grouped = {
            "documents": [],
            "articles": [],
            "clauses": [],
            "points": [],
        }

        for citation in citations:
            if citation.document_number:
                grouped["documents"].append(citation)
            if citation.point_letter:
                grouped["points"].append(citation)
            elif citation.clause_number:
                grouped["clauses"].append(citation)
            elif citation.article_number:
                grouped["articles"].append(citation)

        return citations, grouped


# Global instance for use throughout the app
citation_extractor = CitationExtractor()
