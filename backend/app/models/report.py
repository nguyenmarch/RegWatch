from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, JSON, ForeignKey
from app.core.mysql_client import Base

class Report(Base):
    __tablename__ = "reports"

    analyses_id = Column(Integer, ForeignKey("compliance_analyses.id", ondelete="CASCADE"), primary_key=True)
    items = Column(JSON, nullable=False)  # JSON list of ReportItem objects
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
