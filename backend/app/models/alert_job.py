from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.core.mysql_client import Base


class AlertJob(Base):
    """Hàng đợi sinh cảnh báo (Output 1) cho mỗi tài liệu.

    Cho phép sinh cảnh báo BỀN BỈ: khi Gemini hết quota (429), job giữ trạng thái
    'pending' + đặt next_retry_at để scheduler tự thử lại sau — không mất cảnh báo.

    status: pending  — chờ sinh / chờ thử lại (do hết quota)
            completed — đã sinh xong (kể cả khi không có xung đột nào)
            failed    — lỗi không phải quota, dừng lại (có thể thử lại thủ công)
    """

    __tablename__ = "alert_jobs"

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
