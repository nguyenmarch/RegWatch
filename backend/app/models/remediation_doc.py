from datetime import datetime
from typing import List, Optional

from sqlalchemy import String, Text, DateTime, Boolean, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.mysql_client import Base


class ActionPlan(Base):
    """Bảng lưu Kế hoạch hành động (Action Plan) đồng bộ từ Qdrant."""
    __tablename__ = "action_plans"

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    plan_code: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    law_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    law_title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="draft", nullable=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    ceo_approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationship: 1 ActionPlan → nhiều ActionPlanTask
    tasks: Mapped[List["ActionPlanTask"]] = relationship(
        "ActionPlanTask",
        back_populates="action_plan",
        cascade="all, delete-orphan",
    )


class ActionPlanTask(Base):
    """Bảng lưu các Task (Đầu việc) của một Action Plan."""
    __tablename__ = "action_plan_tasks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    action_plan_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("action_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    task_code: Mapped[str] = mapped_column(String(100), nullable=False)
    task_name: Mapped[str] = mapped_column(String(500), nullable=False)
    target_department: Mapped[str] = mapped_column(String(200), nullable=False)
    action_required: Mapped[str] = mapped_column(Text, nullable=False)
    impacted_internal_doc: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    output_type: Mapped[str] = mapped_column(String(100), nullable=False)

    # Relationships
    action_plan: Mapped["ActionPlan"] = relationship("ActionPlan", back_populates="tasks")
    document: Mapped[Optional["RemediationDoc"]] = relationship(
        "RemediationDoc",
        back_populates="task",
        uselist=False,
        cascade="all, delete-orphan",
    )


class RemediationDoc(Base):
    """Bảng lưu Văn bản AI đã sinh (Sửa đổi hoặc Đào tạo) gắn với 1 Task."""
    __tablename__ = "remediation_docs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("action_plan_tasks.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
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

    # Relationship
    task: Mapped["ActionPlanTask"] = relationship("ActionPlanTask", back_populates="document")
