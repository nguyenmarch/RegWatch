from enum import Enum


class DocumentStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    PENDING_GRAPH = "pending_graph"
    COMPLETED = "completed"
    FAILED = "failed"


class KbType(str, Enum):
    LAW = "law"                   # Qdrant law_collection + Neo4j
    REPORT = "report"              # Qdrant report_collection only
    INTERNAL = "internal"         # Qdrant internal_collection only


class DocumentType(str, Enum):
    DECREE = "DECREE"
    CIRCULAR = "CIRCULAR"
    DECISION = "DECISION"


class RelationshipType(str, Enum):
    LEGAL_BASIS = "LEGAL_BASIS"
    GUIDES = "GUIDES"
    AMENDS = "AMENDS"
    REPLACES = "REPLACES"
    REFERENCES = "REFERENCES"
    RELATED_TO = "RELATED_TO"


class AppendixType(str, Enum):
    TABLE = "TABLE"
    TEXT = "TEXT"
    TEMPLATE = "TEMPLATE"


class DocumentStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    DELETING = "deleting"


class KbType(str, Enum):
    @property
    def use_neo4j(self) -> bool:
        return self == KbType.LAW


class GraphNodeType(str, Enum):
    DOCUMENT = "Document"
    CHAPTER = "Chapter"
    SECTION = "Section"
    ARTICLE = "Article"
    CLAUSE = "Clause"
    POINT = "Point"
    CHUNK = "Chunk"


class GraphRelationshipType(str, Enum):
    HAS_CHAPTER = "HAS_CHAPTER"
    HAS_SECTION = "HAS_SECTION"
    HAS_ARTICLE = "HAS_ARTICLE"
    HAS_CLAUSE = "HAS_CLAUSE"
    HAS_POINT = "HAS_POINT"
    HAS_CHUNK = "HAS_CHUNK"
    NEXT_CHUNK = "NEXT_CHUNK"
    REFERENCES = "REFERENCES"

    @property
    def collection_name(self) -> str:
        return {
            "law": "law_collection",
            "report": "report_collection",
            "internal": "internal_collection",
        }[self.value]

    @property
    def use_neo4j(self) -> bool:
        return self == KbType.LAW
