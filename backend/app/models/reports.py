from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey

from app.core.mysql_client import Base


class RiskReport(Base):
    __tablename__ = "risk_reports"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    status = Column(String(50), default="pending", nullable=False)
    risk_items = Column(JSON, default=list, nullable=False)
    generated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
