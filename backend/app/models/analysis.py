from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text

from app.core.mysql_client import Base


class ComplianceAnalysis(Base):
    """Compliance analysis (Output 1) — generated from conflict/overlap detection.

    Each detected conflict is stored as one row. Nested fields
    (compare, business_impacts, risk_scores, detail_tables) are stored as JSON.
    """

    __tablename__ = "compliance_analyses"

    id                = Column(Integer, primary_key=True, index=True)
    code              = Column(String(32), nullable=False)   # e.g. "VD-001"
    document_id       = Column(
        Integer,
        ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title             = Column(String(255), nullable=False)
    summary           = Column(Text, nullable=False, default="")
    conflict_headline = Column(Text, nullable=False, default="")
    severity          = Column(String(16), nullable=False, default="monitor")
    deadline          = Column(String(32), nullable=True)
    status            = Column(String(16), nullable=False, default="pending")
    overall_risk      = Column(JSON, nullable=False, default=dict)
    compare_left      = Column(JSON, nullable=True)
    compare_right     = Column(JSON, nullable=True)
    conflict_note     = Column(Text, nullable=False, default="")
    business_impacts  = Column(JSON, nullable=False, default=list)
    risk_scores       = Column(JSON, nullable=False, default=list)
    risk_conclusion   = Column(Text, nullable=False, default="")
    detail_tables     = Column(JSON, nullable=False, default=list)
    created_at        = Column(DateTime, default=datetime.utcnow, nullable=False)
    generated_at      = Column(DateTime, nullable=True)
