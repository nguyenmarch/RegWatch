from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.core.mysql_client import Base


class AnalysisJob(Base):
    """Analysis generation queue (Output 1) for each document.

    Enables DURABLE generation: when Gemini hits quota (429), the job stays
    'pending' and sets next_retry_at so the scheduler retries later — no analysis lost.

    status: pending  — awaiting generation / awaiting retry (quota exhausted)
            completed — generation finished (even when no conflict found)
            failed    — non-quota error, stopped (can be retried manually)
    """

    __tablename__ = "analysis_jobs"

    id            = Column(Integer, primary_key=True, index=True)
    document_id   = Column(
        Integer,
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    status        = Column(String(16), nullable=False, default="pending", index=True)
    attempts      = Column(Integer, nullable=False, default=0)
    last_error    = Column(Text, nullable=True)
    next_retry_at = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at    = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
