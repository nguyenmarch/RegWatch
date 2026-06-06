"""
Enhanced retrieval service for hybrid (vector + graph) legal document search.
Implements:
1. Document-scoped graph queries
2. Clause/Point level queries
3. Citation expansion
4. Metadata filtering
5. Hybrid ranking
6. Deduplication
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Optional

from app.core.config import settings
from app.core.gemini_client import aembed_text
from app.core.neo4j_client import get_neo4j_driver
from app.core.qdrant_client import qdrant_client
from app.utils.citation_extractor import LegalCitation, citation_extractor

logger = logging.getLogger(__name__)

_TOP_K = 5


@dataclass
class RankedResult:
    """Ranked result with scoring."""
    chunk_id: str
    document_id: str
    document_number: str | None
    text: str
    chunk_type: str
    vector_score: float = 0.0
    graph_score: float = 0.0
    citation_score: float = 0.0

    @property
    def total_score(self) -> float:
        """Weighted hybrid score."""
        return (
            self.vector_score * 0.5 +
            self.graph_score * 0.3 +
            self.citation_score * 0.2
        )


class RetrievalService:
    """Unified retrieval service for vector and graph search."""

    async def fetch_vector_context(
        self,
        question: str,
        filter_metadata: dict | None = None,
    ) -> tuple[str, list[dict]]:
        """
        Search Qdrant with optional metadata filtering.
        Supports filtering by: document_type, document_number, article_number, chunk_type
        """
        vector = await aembed_text(question)

        # Build filter conditions from metadata
        filter_obj = None
        if filter_metadata:
            conditions = []
            for key, value in filter_metadata.items():
                if value is None:
                    continue
                if isinstance(value, list):
                    conditions.append({
                        "key": key,
                        "match": {"any": value}
                    })
                else:
                    conditions.append({
                        "key": key,
                        "match": {"value": value}
                    })

            if conditions:
                filter_obj = {"must": conditions}

        hits = await asyncio.to_thread(
            self._qdrant_search,
            vector,
            filter_obj,
        )

        raw_hits = [
            {
                "chunk_id": h.payload.get("chunk_id", ""),
                "document_id": h.payload.get("document_id"),
                "document_number": h.payload.get("document_number"),
                "text": h.payload.get("text", ""),
                "chunk_type": h.payload.get("chunk_type", "TEXT"),
                "score": round(h.score, 4),
            }
            for h in hits
        ]

        if not raw_hits:
            return "", []

        lines = [
            f"[{h['chunk_type']} | doc:{h['document_id']} | score:{h['score']}]\n{h['text']}"
            for h in raw_hits
        ]
        return "\n\n---\n\n".join(lines), raw_hits

    def _qdrant_search(self, vector: list[float], filter_obj: dict | None) -> list:
        """Execute Qdrant search with optional filtering."""
        search_kwargs = {
            "collection_name": settings.QDRANT_COLLECTION_NAME,
            "query_vector": vector,
            "limit": _TOP_K,
        }
        if filter_obj:
            from qdrant_client.models import Filter
            search_kwargs["query_filter"] = Filter(**filter_obj)

        return qdrant_client.search(**search_kwargs)

    async def fetch_graph_context(
        self,
        question: str,
        citations: list[LegalCitation] | None = None,
    ) -> tuple[str, list[dict]]:
        """
        Fetch context from Neo4j knowledge graph.
        Supports:
        - Document-scoped queries
        - Article/Clause/Point queries
        - Citation-based expansion
        """
        if citations is None:
            citations, _ = citation_extractor.extract_from_question(question)

        if not citations or not any(c.article_number for c in citations):
            return "", []

        def _run_query(cites: list[LegalCitation]) -> list[dict]:
            driver = get_neo4j_driver()
            results = []

            with driver.session() as session:
                # Group citations by document
                by_doc = {}
                for cite in cites:
                    key = cite.document_number or "unknown"
                    if key not in by_doc:
                        by_doc[key] = []
                    by_doc[key].append(cite)

                # Execute queries for each document
                for doc_num, cites_in_doc in by_doc.items():
                    rows = self._query_document_context(session, doc_num, cites_in_doc)
                    results.extend(rows)

            return results

        rows = await asyncio.to_thread(_run_query, citations)

        if not rows:
            return "", []

        # Format results
        lines = []
        for row in rows:
            header = row.get("header", f"Điều {row.get('article_number', '?')}")
            block = f"[{header}]\n"

            if row.get("article_intro"):
                block += f"{row['article_intro']}\n"

            if row.get("clause_number"):
                block += f"Khoản {row['clause_number']}: {row.get('clause_text', '')}\n"

            if row.get("point_letter"):
                block += f"Điểm {row['point_letter']}: {row.get('point_text', '')}\n"

            if row.get("related_texts"):
                related = "\n".join(t for t in row["related_texts"] if t)
                if related:
                    block += f"\n[RELATED]\n{related}"

            lines.append(block)

        return "\n\n===\n\n".join(lines), rows

    def _query_document_context(self, session, doc_number: str, cites: list[LegalCitation]) -> list[dict]:
        """Query Neo4j for document and article/clause/point context."""

        # Build article queries
        article_numbers = sorted(set(c.article_number for c in cites if c.article_number))

        if not article_numbers:
            return []

        # Check if specific clause/point is requested
        clause_queries = {c.article_number: c.clause_number for c in cites if c.clause_number}
        point_queries = {c.article_number: c.point_letter for c in cites if c.point_letter}

        query = """
        MATCH (d:Document {document_number: $doc_num})
        OPTIONAL MATCH (d)-[:CONTAINS]->(a:Article)
        WHERE a.article_number IN $art_nums

        OPTIONAL MATCH (a)-[:HAS_CLAUSE]->(c:Clause)
        OPTIONAL MATCH (c)-[:HAS_POINT]->(p:Point)
        OPTIONAL MATCH (c)-[:REFERENCES]->(ref_c:Clause)
        OPTIONAL MATCH (c)-[:NEXT_CLAUSE]->(next_c:Clause)

        RETURN
            a.article_number AS article_number,
            a.header AS header,
            a.introductory_content AS article_intro,
            c.clause_number AS clause_number,
            c.content AS clause_text,
            p.point_letter AS point_letter,
            p.content AS point_text,
            collect(DISTINCT COALESCE(ref_c.content, next_c.content)) AS related_texts
        ORDER BY a.article_number, c.clause_number, p.point_letter
        """

        result = session.run(
            query,
            doc_num=doc_number,
            art_nums=article_numbers,
        )

        return [dict(r) for r in result]

    async def expand_with_references(
        self,
        graph_results: list[dict],
    ) -> list[dict]:
        """Expand results by following REFERENCES relationships."""

        def _expand(results: list[dict]) -> list[dict]:
            driver = get_neo4j_driver()

            with driver.session() as session:
                expanded = []

                for result in results:
                    expanded.append(result)

                    # Find referenced articles
                    if result.get("article_number"):
                        ref_query = """
                        MATCH (a:Article {article_number: $art_num})
                        OPTIONAL MATCH (a)-[:HAS_CLAUSE]->(c:Clause)
                        OPTIONAL MATCH (c)-[:REFERENCES]->(ref_a:Article)
                        -[:HAS_CLAUSE]->(ref_c:Clause)

                        RETURN
                            ref_a.article_number AS article_number,
                            ref_a.header AS header,
                            ref_c.clause_number AS clause_number,
                            ref_c.content AS clause_text
                        LIMIT 3
                        """

                        ref_result = session.run(
                            ref_query,
                            art_num=result["article_number"],
                        )

                        for ref_row in ref_result:
                            expanded.append(dict(ref_row))

                return expanded

        return await asyncio.to_thread(_expand, graph_results)

    async def rank_results(
        self,
        vector_hits: list[dict],
        graph_results: list[dict],
    ) -> list[RankedResult]:
        """
        Rank and merge results from vector and graph retrieval.
        Produces unified ranked list with weighted scoring.
        """

        # Build lookup maps
        by_chunk_id = {h["chunk_id"]: h for h in vector_hits}
        by_article = {}

        for result in graph_results:
            key = (result.get("article_number"), result.get("clause_number"), result.get("point_letter"))
            if key not in by_article:
                by_article[key] = result

        ranked = []
        seen_chunks = set()

        # Add vector hits first (higher vector score)
        for hit in vector_hits:
            chunk_id = hit["chunk_id"]
            if chunk_id in seen_chunks:
                continue
            seen_chunks.add(chunk_id)

            ranked.append(RankedResult(
                chunk_id=chunk_id,
                document_id=hit["document_id"],
                document_number=hit.get("document_number"),
                text=hit["text"],
                chunk_type=hit.get("chunk_type", "TEXT"),
                vector_score=hit.get("score", 0.0),
            ))

        # Add graph results with citation score
        for (article, clause, point), result in by_article.items():
            text_parts = []
            if result.get("header"):
                text_parts.append(f"[{result['header']}]")
            if result.get("article_intro"):
                text_parts.append(result["article_intro"])
            if result.get("clause_text"):
                text_parts.append(f"Khoản {clause}: {result['clause_text']}")
            if result.get("point_text"):
                text_parts.append(f"Điểm {point}: {result['point_text']}")

            text = "\n".join(text_parts)

            ranked.append(RankedResult(
                chunk_id=f"graph_{article}_{clause}_{point}",
                document_id=result.get("document_id", ""),
                document_number=result.get("document_number"),
                text=text,
                chunk_type="ARTICLE",
                graph_score=0.9,
                citation_score=0.8,
            ))

        # Sort by total score
        ranked.sort(key=lambda r: r.total_score, reverse=True)

        return ranked

    async def deduplicate_context(
        self,
        ranked_results: list[RankedResult],
        max_tokens: int = 4000,
    ) -> list[RankedResult]:
        """
        Remove duplicate chunks/articles/clauses.
        Respects token budget.
        """
        seen_articles = set()
        seen_clauses = set()
        seen_chunks = set()
        deduped = []
        total_tokens = 0

        for result in ranked_results:
            # Extract identifiers
            chunk_key = result.chunk_id
            article_key = self._extract_article_id(result.text)
            clause_key = self._extract_clause_id(result.text)

            # Check deduplication
            if chunk_key in seen_chunks:
                continue
            if clause_key and clause_key in seen_clauses:
                continue
            if article_key and article_key in seen_articles and result.chunk_type == "ARTICLE":
                continue

            # Check token budget
            text_tokens = len(result.text.split())
            if total_tokens + text_tokens > max_tokens:
                break

            seen_chunks.add(chunk_key)
            if article_key:
                seen_articles.add(article_key)
            if clause_key:
                seen_clauses.add(clause_key)

            total_tokens += text_tokens
            deduped.append(result)

        logger.info(f"[Retrieval] Deduplicated to {len(deduped)} unique results, {total_tokens} tokens")
        return deduped

    @staticmethod
    def _extract_article_id(text: str) -> str | None:
        """Extract article number from text."""
        import re
        m = re.search(r"Điều\s+(\d+[a-z]?)", text, re.IGNORECASE)
        return m.group(1) if m else None

    @staticmethod
    def _extract_clause_id(text: str) -> tuple[str, str] | None:
        """Extract article-clause pair from text."""
        import re
        art_m = re.search(r"Điều\s+(\d+[a-z]?)", text, re.IGNORECASE)
        clause_m = re.search(r"Khoản\s+(\d+)", text, re.IGNORECASE)
        if art_m and clause_m:
            return (art_m.group(1), clause_m.group(1))
        return None


# Global instance
retrieval_service = RetrievalService()
