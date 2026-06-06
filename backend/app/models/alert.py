from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, Text, JSON, ForeignKey
from app.core.mysql_client import Base

class ComplianceAlert(Base):
    __tablename__ = "compliance_alerts"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(32), nullable=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=True)
    title = Column(String(255), nullable=False)
    summary = Column(Text, nullable=True)
    conflict_headline = Column(Text, nullable=True)
    severity = Column(String(16), nullable=True)
    deadline = Column(String(32), nullable=True)
    status = Column(String(16), default="open", nullable=True)
    overall_risk = Column(JSON, nullable=True)
    compare_left = Column(JSON, nullable=True)
    compare_right = Column(JSON, nullable=True)
    conflict_note = Column(Text, nullable=True)
    business_impacts = Column(JSON, nullable=True)
    risk_scores = Column(JSON, nullable=True)
    risk_conclusion = Column(Text, nullable=True)
    detail_tables = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    generated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
