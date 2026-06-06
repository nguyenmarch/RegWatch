"""
Graph Builder: Convert LegalDocument to GraphData
Transforms structured legal documents into nodes and relationships for Neo4j.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field as dc_field
from typing import Any

from app.schemas.document import (
    LegalDocument,
    Chapter,
    Section,
    Article,
    Clause,
    Point,
    Appendix,
    DocumentRelationship,
)
from app.utils.citation_extractor import citation_extractor

logger = logging.getLogger(__name__)


@dataclass
class GraphNode:
    """Represents a node in the knowledge graph."""
    node_id: str
    label: str  # Document, Chapter, Section, Article, Clause, Point, Appendix
    properties: dict[str, Any] = dc_field(default_factory=dict)


@dataclass
class GraphRelationship:
    """Represents a relationship between nodes."""
    source_id: str
    target_id: str
    relationship_type: str
    properties: dict[str, Any] = dc_field(default_factory=dict)


@dataclass
class GraphData:
    """Complete graph representation of a legal document."""
    nodes: list[GraphNode] = dc_field(default_factory=list)
    relationships: list[GraphRelationship] = dc_field(default_factory=list)

    def __repr__(self) -> str:
        return f"GraphData(nodes={len(self.nodes)}, relationships={len(self.relationships)})"


class GraphBuilder:
    """Build graph data from LegalDocument."""

    def __init__(self):
        self.node_counter = {}
        self.node_map = {}  # (label, id) -> node_id

    def build(self, doc: LegalDocument) -> GraphData:
        """Build complete graph from LegalDocument."""
        graph = GraphData()

        # Reset for this document
        self.node_counter = {}
        self.node_map = {}

        metadata = doc.metadata
        doc_id = metadata.document_id

        # 1. Create Document node
        doc_node_id = self._make_node_id(doc_id, "")
        doc_node = self._create_document_node(doc_node_id, metadata)
        graph.nodes.append(doc_node)

        # 2. Create hierarchical nodes (Chapter -> Section -> Article -> Clause -> Point)
        for item in doc.content:
            if isinstance(item, Chapter):
                self._add_chapter_hierarchy(graph, doc_node_id, item)
            elif isinstance(item, Article):
                self._add_article_hierarchy(graph, doc_node_id, item)

        # 3. Create appendix nodes
        for appendix in doc.appendices:
            self._add_appendix(graph, doc_node_id, appendix)

        # 4. Create legal relationships between documents
        self._add_legal_relationships(graph, doc_node_id, doc.relationships)

        # 5. Extract and add citation relationships
        self._add_citation_relationships(graph, doc)

        logger.info(
            "[GraphBuilder] Built graph for %s: %d nodes, %d relationships",
            doc_id,
            len(graph.nodes),
            len(graph.relationships),
        )

        return graph

    def _make_node_id(self, base: str, suffix: str) -> str:
        """Generate unique node IDs."""
        if suffix:
            return f"{base}_{suffix}"
        return base

    def _create_document_node(self, node_id: str, metadata) -> GraphNode:
        """Create Document node."""
        return GraphNode(
            node_id=node_id,
            label="Document",
            properties={
                "document_id": metadata.document_id,
                "document_type": metadata.document_type.value if metadata.document_type else None,
                "document_number": metadata.document_number,
                "issued_date": metadata.issued_date.isoformat() if metadata.issued_date else None,
                "effective_date": metadata.effective_date.isoformat() if metadata.effective_date else None,
                "issuing_authority": metadata.issuing_authority,
                "signer": metadata.signer,
                "summary": metadata.summary,
            },
        )

    def _add_chapter_hierarchy(self, graph: GraphData, doc_id: str, chapter: Chapter) -> None:
        """Add chapter and its sections/articles to graph."""
        chapter_node_id = self._make_node_id(doc_id, f"CH_{chapter.chapter_number}")

        # Create chapter node
        chapter_node = GraphNode(
            node_id=chapter_node_id,
            label="Chapter",
            properties={
                "chapter_number": chapter.chapter_number,
                "title": chapter.title,
            },
        )
        graph.nodes.append(chapter_node)

        # Add containment relationship
        graph.relationships.append(
            GraphRelationship(
                source_id=doc_id,
                target_id=chapter_node_id,
                relationship_type="CONTAINS",
            )
        )

        # Add sections
        for section in chapter.sections:
            self._add_section_hierarchy(graph, chapter_node_id, doc_id, section)

        # Add direct articles in chapter
        for article in chapter.articles:
            self._add_article_hierarchy(graph, chapter_node_id, article)

    def _add_section_hierarchy(self, graph: GraphData, chapter_id: str, doc_id: str, section: Section) -> None:
        """Add section and its articles to graph."""
        section_node_id = self._make_node_id(doc_id, f"SEC_{section.section_number}")

        # Create section node
        section_node = GraphNode(
            node_id=section_node_id,
            label="Section",
            properties={
                "section_number": section.section_number,
                "title": section.title,
            },
        )
        graph.nodes.append(section_node)

        # Add containment relationship
        graph.relationships.append(
            GraphRelationship(
                source_id=chapter_id,
                target_id=section_node_id,
                relationship_type="HAS_SECTION",
            )
        )

        # Add articles in section
        for article in section.articles:
            self._add_article_hierarchy(graph, section_node_id, article)

    def _add_article_hierarchy(self, graph: GraphData, parent_id: str, article: Article) -> None:
        """Add article and its clauses/points to graph."""
        doc_id = parent_id.split("_")[0]
        article_node_id = self._make_node_id(doc_id, f"ART_{article.article_number}")

        # Create article node
        article_node = GraphNode(
            node_id=article_node_id,
            label="Article",
            properties={
                "article_number": article.article_number,
                "title": article.title,
                "introductory_content": article.introductory_content,
            },
        )
        graph.nodes.append(article_node)

        # Add containment relationship
        rel_type = "HAS_ARTICLE" if parent_id.startswith(f"{doc_id}_SEC") else "HAS_ARTICLE"
        graph.relationships.append(
            GraphRelationship(
                source_id=parent_id,
                target_id=article_node_id,
                relationship_type=rel_type,
            )
        )

        # Add clauses
        for clause in article.clauses:
            self._add_clause_hierarchy(graph, article_node_id, doc_id, clause)

    def _add_clause_hierarchy(self, graph: GraphData, article_id: str, doc_id: str, clause: Clause) -> None:
        """Add clause and its points to graph."""
        clause_num = clause.clause_number or "0"
        clause_node_id = self._make_node_id(doc_id, f"CL_{article_id.split('_')[1]}_{clause_num}")

        # Create clause node
        clause_node = GraphNode(
            node_id=clause_node_id,
            label="Clause",
            properties={
                "clause_number": clause.clause_number,
                "content": clause.content,
            },
        )
        graph.nodes.append(clause_node)

        # Add containment relationship
        graph.relationships.append(
            GraphRelationship(
                source_id=article_id,
                target_id=clause_node_id,
                relationship_type="HAS_CLAUSE",
            )
        )

        # Add points
        for point in clause.points:
            self._add_point(graph, clause_node_id, doc_id, point)

    def _add_point(self, graph: GraphData, clause_id: str, doc_id: str, point: Point) -> None:
        """Add point to graph."""
        point_node_id = self._make_node_id(doc_id, f"PT_{clause_id.split('_')[2]}_{point.point_number}")

        # Create point node
        point_node = GraphNode(
            node_id=point_node_id,
            label="Point",
            properties={
                "point_number": point.point_number,
                "content": point.content,
            },
        )
        graph.nodes.append(point_node)

        # Add containment relationship
        graph.relationships.append(
            GraphRelationship(
                source_id=clause_id,
                target_id=point_node_id,
                relationship_type="HAS_POINT",
            )
        )

    def _add_appendix(self, graph: GraphData, doc_id: str, appendix: Appendix) -> None:
        """Add appendix node to graph."""
        appendix_node_id = self._make_node_id(doc_id, f"APP_{appendix.appendix_number}")

        # Create appendix node
        appendix_node = GraphNode(
            node_id=appendix_node_id,
            label="Appendix",
            properties={
                "appendix_number": appendix.appendix_number,
                "title": appendix.title,
                "introduction": appendix.introduction,
                "appendix_type": appendix.appendix_type.value if appendix.appendix_type else None,
            },
        )
        graph.nodes.append(appendix_node)

        # Add containment relationship
        graph.relationships.append(
            GraphRelationship(
                source_id=doc_id,
                target_id=appendix_node_id,
                relationship_type="HAS_APPENDIX",
            )
        )

    def _add_legal_relationships(
        self, graph: GraphData, source_doc_id: str, relationships: list[DocumentRelationship]
    ) -> None:
        """Add legal relationships between documents."""
        for rel in relationships:
            if not rel.target_document:
                continue

            rel_type_map = {
                "LEGAL_BASIS": "LEGAL_BASIS",
                "AMENDS": "AMENDS",
                "REPLACES": "REPLACES",
                "GUIDES": "GUIDES",
                "REFERENCES": "REFERENCES",
                "RELATED_TO": "RELATED_TO",
            }

            rel_type = rel_type_map.get(rel.relationship_type.value, "RELATED_TO")

            graph.relationships.append(
                GraphRelationship(
                    source_id=source_doc_id,
                    target_id=rel.target_document[:50],  # Limit to prevent overly long IDs
                    relationship_type=rel_type,
                    properties={"note": rel.note} if rel.note else {},
                )
            )

    def _add_citation_relationships(self, graph: GraphData, doc: LegalDocument) -> None:
        """Extract and add citation relationships between articles in the document."""
        article_nodes = {n.properties.get("article_number"): n for n in graph.nodes if n.label == "Article"}

        # Build map of article -> all its text content
        article_texts: dict[str, str] = {}
        self._collect_article_texts(doc.content, article_texts)

        # For each article, extract citations and create REFERENCES relationships
        for article_num, text in article_texts.items():
            if article_num not in article_nodes:
                continue

            source_node = article_nodes[article_num]
            citations, grouped = citation_extractor.extract_from_question(text)

            # Add REFERENCES relationships to cited articles in same document
            for cited_article in grouped.get("articles", []):
                if cited_article.article_number in article_nodes:
                    target_node = article_nodes[cited_article.article_number]
                    if source_node.node_id != target_node.node_id:
                        graph.relationships.append(
                            GraphRelationship(
                                source_id=source_node.node_id,
                                target_id=target_node.node_id,
                                relationship_type="REFERENCES",
                            )
                        )

    def _collect_article_texts(self, items: list, article_texts: dict[str, str]) -> None:
        """Recursively collect all text content from articles."""
        for item in items:
            if isinstance(item, Chapter):
                for section in item.sections:
                    self._collect_article_texts(section.articles, article_texts)
                self._collect_article_texts(item.articles, article_texts)
            elif isinstance(item, Article):
                text_parts = []
                if item.title:
                    text_parts.append(item.title)
                if item.introductory_content:
                    text_parts.append(item.introductory_content)
                for clause in item.clauses:
                    if clause.content:
                        text_parts.append(clause.content)
                    for point in clause.points:
                        if point.content:
                            text_parts.append(point.content)
                article_texts[item.article_number] = "\n".join(text_parts)

    def _extract_full_text(self, doc: LegalDocument) -> str:
        """Extract all text from document for citation extraction."""
        texts = []

        for item in doc.content:
            if isinstance(item, Chapter):
                texts.append(item.title)
                for section in item.sections:
                    texts.append(section.title)
                    for article in section.articles:
                        texts.append(f"Điều {article.article_number}")
                        if article.title:
                            texts.append(article.title)
                        if article.introductory_content:
                            texts.append(article.introductory_content)
                        for clause in article.clauses:
                            if clause.content:
                                texts.append(clause.content)
            elif isinstance(item, Article):
                texts.append(f"Điều {item.article_number}")
                if item.title:
                    texts.append(item.title)
                if item.introductory_content:
                    texts.append(item.introductory_content)

        return "\n".join(texts)

    @staticmethod
    def _text_mentions_article(text: str, article_num: str) -> bool:
        """Check if text mentions a specific article."""
        if not text:
            return False
        return f"Điều {article_num}" in text or f"điều {article_num}" in text.lower()


# Global instance
graph_builder = GraphBuilder()
