from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String

from app.core.mysql_client import Base





class ActionPlan(Base):
    __tablename__ = "action_plans"

    analyses_id = Column(Integer, ForeignKey("compliance_analyses.id", ondelete="CASCADE"), primary_key=True)

    action_plan_id = Column(String(64), nullable=False, index=True)

    associated_law = Column(JSON, nullable=False, default=dict)
    plan_metadata = Column("metadata", JSON, nullable=False, default=dict)

    tasks = Column(JSON, nullable=False, default=list)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

