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
