from datetime import datetime
from typing import List, Optional

from sqlalchemy import String, Text, DateTime, Boolean, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.mysql_client import Base


class RemediationDoc(Base):
    """Bảng lưu Văn bản AI đã sinh (Sửa đổi hoặc Đào tạo) gắn với 1 Task."""
    __tablename__ = "remediation_docs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    plan_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    task_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # Nội dung JSON string: {"old_document": "...", "modified_document": "...", "comments": [...]}
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    product_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cd_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # DRAFT → PENDING → APPROVED
    status: Mapped[str] = mapped_column(String(20), default="DRAFT", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    drafts: Mapped[List["DraftVersion"]] = relationship(
        "DraftVersion",
        back_populates="doc",
        cascade="all, delete-orphan",
        order_by="DraftVersion.created_at.desc()",
    )


class DraftVersion(Base):
    """Lưu lịch sử các bản nháp (snapshot) của RemediationDoc mỗi khi user ấn Lưu."""
    __tablename__ = "draft_versions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    remediation_doc_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("remediation_docs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    saved_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationship
    doc: Mapped["RemediationDoc"] = relationship("RemediationDoc", back_populates="drafts")
