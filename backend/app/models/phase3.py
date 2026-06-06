from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.mysql_client import Base


class ActionPlan(Base):
    """
    Bảng lưu thông tin chung của Action Plan (Được truyền từ Giai đoạn 2)
    """
    __tablename__ = "action_plans"

    id = Column(Integer, primary_key=True, index=True)
    plan_code = Column(String(50), unique=True, index=True, nullable=False) # e.g., AP-2026-SHB-001
    law_id = Column(String(100), nullable=True) # e.g., TT-12-2024-TT-NHNN
    law_title = Column(String(500), nullable=True)
    status = Column(String(50), default="APPROVED", nullable=False)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    ceo_approved_at = Column(DateTime, nullable=True)

    # Relationships
    tasks = relationship("ActionPlanTask", back_populates="action_plan", cascade="all, delete-orphan")


class ActionPlanTask(Base):
    """
    Bảng lưu chi tiết từng Task bên trong một Action Plan.
    Mỗi Task sẽ yêu cầu sinh ra một Văn bản ở Giai đoạn 3.
    """
    __tablename__ = "action_plan_tasks"

    id = Column(Integer, primary_key=True, index=True)
    action_plan_id = Column(Integer, ForeignKey("action_plans.id"), nullable=False)
    task_code = Column(String(50), nullable=False) # e.g., TSK-001
    task_name = Column(String(500), nullable=False)
    target_department = Column(String(100), nullable=False) # IT, PRODUCT, PO
    action_required = Column(Text, nullable=False)
    impacted_internal_doc = Column(String(500), nullable=True)
    output_type = Column(String(100), nullable=False) # VĂN_BẢN_SỬA_ĐỔI, VĂN_BẢN_ĐÀO_TẠO_NỘI_BỘ
    
    # Relationships
    action_plan = relationship("ActionPlan", back_populates="tasks")
    document = relationship("Phase3Document", back_populates="task", uselist=False, cascade="all, delete-orphan")


class Phase3Document(Base):
    """
    Bảng lưu trữ Văn bản sửa đổi / Đào tạo được sinh ra ở Giai đoạn 3 (1 Task -> 1 Document)
    """
    __tablename__ = "phase3_documents"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("action_plan_tasks.id"), unique=True, nullable=False)
    content = Column(Text, nullable=True)
    
    # Trạng thái phê duyệt
    product_approved = Column(Boolean, default=False, nullable=False)
    cd_approved = Column(Boolean, default=False, nullable=False)
    status = Column(String(50), default="DRAFT", nullable=False)  # DRAFT, PENDING, APPROVED

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    task = relationship("ActionPlanTask", back_populates="document")
