"""
Neo4j Ingestor: Write GraphData to Neo4j
Handles safe ingestion without APOC dependencies.
"""

from __future__ import annotations

import logging
from dataclasses import asdict
from typing import Any

from app.core.neo4j_client import get_neo4j_driver
from app.services.graph_builder import GraphData, GraphNode, GraphRelationship

logger = logging.getLogger(__name__)

class Neo4jIngestor:
    """Safely ingest graph data into Neo4j."""

    def __init__(self):
        self.driver = get_neo4j_driver()

    def ensure_constraints(self) -> None:
        constraints = [
            "CREATE CONSTRAINT IF NOT EXISTS FOR (d:Document) REQUIRE d.document_id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (n) REQUIRE n.node_id IS UNIQUE",
        ]
        with self.driver.session() as session:
            for constraint in constraints:
                try:
                    session.run(constraint)
                except Exception as e:
                    logger.debug(f"Constraint creation info: {e}")
        logger.info("[Neo4j] Constraints ensured")

    def ingest(self, graph_data: GraphData) -> None:
        """Ingest complete graph data into Neo4j."""
        self._upsert_nodes(graph_data.nodes)
        self._create_relationships(graph_data.relationships)
        logger.info("[Neo4j] Ingestion complete.")

    def _upsert_nodes(self, nodes: list[GraphNode]) -> None:
        """Upsert all nodes using MERGE."""
        if not nodes: return
        with self.driver.session() as session:
            for node in nodes:
                # Dùng node.model_dump() nếu node là Pydantic, hoặc dict trực tiếp
                props = node.properties if hasattr(node, 'properties') else {}
                query = f"MERGE (n:{node.label} {{node_id: $node_id}}) SET n += $props"
                session.run(query, node_id=node.node_id, props=props)

    def _upsert_nodes_batch(self, session, label: str, nodes: list[GraphNode]) -> None:
            """Batch upsert nodes for a specific label."""
            batch_size = 100
            for i in range(0, len(nodes), batch_size):
                batch = nodes[i : i + batch_size]
                node_dicts = [{"node_id": n.node_id, **n.properties} for n in batch]

                query = f"""
                UNWIND $nodes AS node
                MERGE (n:{label} {{node_id: node.node_id}})
                SET n += node
                """

                session.run(query, nodes=node_dicts)
                logger.info(f"[Neo4j] Upserted {min(batch_size, len(batch))} {label} nodes")

    def _create_relationships_batch(self, session, relationships: list[GraphRelationship]) -> None:
            """Batch create relationships."""
            rel_dicts = [
                {
                    "source_id": r.source_id,
                    "target_id": r.target_id,
                    "type": r.relationship_type,
                    "props": r.properties,
                }
                for r in relationships
            ]

            query = """
            UNWIND $relationships AS rel
            MATCH (source {node_id: rel.source_id})
            MATCH (target {node_id: rel.target_id})
            CALL apoc.create.relationship(source, rel.type, rel.props, target) YIELD rel AS created_rel
            RETURN created_rel
            """

            try:
                session.run(query, relationships=rel_dicts)
                logger.info(f"[Neo4j] Created {len(rel_dicts)} relationships")
            except Exception as e:
                # Fallback: use MERGE without apoc
                logger.warning(f"[Neo4j] APOC not available, using standard MERGE: {e}")
                self._create_relationships_standard(session, relationships)


    def _create_relationships(self, relationships: list[GraphRelationship]) -> None:
        """Create all relationships using standard Cypher."""
        if not relationships: return

        with self.driver.session() as session:
            for rel in relationships:
                data = asdict(rel)
                rel_type = data['relationship_type']

                query = f"""
                MATCH (source {{node_id: $source_id}})
                MATCH (target {{node_id: $target_id}})
                MERGE (source)-[r:{rel_type}]->(target)
                SET r += $properties
                """
                session.run(
                    query,
                    source_id=data['source_id'],
                    target_id=data['target_id'],
                    properties=data.get('properties', {})
                )
        logger.info(f"[Neo4j] Created {len(relationships)} relationships")

                    
    def clear_document(self, document_id: str) -> None:
        """Delete all nodes and relationships for a document."""
        with self.driver.session() as session:
            # Delete all relationships first
            session.run(
                """
                MATCH (d:Document {document_id: $doc_id})
                OPTIONAL MATCH (d)-[r]->()
                DELETE r
                """,
                doc_id=document_id,
            )

            # Delete all descendant nodes
            session.run(
                """
                MATCH (d:Document {document_id: $doc_id})
                OPTIONAL MATCH (d)-[*]-(n)
                DETACH DELETE n, d
                """,
                doc_id=document_id,
            )

        logger.info(f"[Neo4j] Cleared document {document_id}")

    def get_stats(self, document_id: str) -> dict[str, Any]:
        """Get statistics about a document's graph."""
        with self.driver.session() as session:
            stats = {}

            # Count nodes by label
            result = session.run(
                """
                MATCH (d:Document {document_id: $doc_id})
                OPTIONAL MATCH (d)-[*]-(n)
                WITH coalesce(head(labels(n)), "Unknown") AS label
                RETURN label, COUNT(*) AS count
                ORDER BY label
                """,
                doc_id=document_id,
            )

            for record in result:
                stats[record["label"]] = record["count"]

            # Count relationships
            result = session.run(
                """
                MATCH (d:Document {document_id: $doc_id})
                OPTIONAL MATCH (d)-[r]->()
                WITH coalesce(type(r), "Unknown") AS rel_type
                RETURN rel_type, COUNT(*) AS count
                ORDER BY rel_type
                """,
                doc_id=document_id,
            )

            rel_stats = {}
            for record in result:
                rel_stats[record["rel_type"]] = record["count"]

            stats["relationships"] = rel_stats

            return stats

# Global instance
neo4j_ingestor = Neo4jIngestor()