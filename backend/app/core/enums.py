from enum import Enum


class DocumentStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class KbType(str, Enum):
    LAW = "law"                   # Qdrant law_collection + Neo4j
    ACTION_PLAN = "action_plan"   # Qdrant action_plan_collection only
    INTERNAL = "internal"         # Qdrant internal_collection only

    @property
    def collection_name(self) -> str:
        return {
            "law": "law_collection",
            "action_plan": "action_plan_collection",
            "internal": "internal_collection",
        }[self.value]

    @property
    def use_neo4j(self) -> bool:
        return self == KbType.LAW
