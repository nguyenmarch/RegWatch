from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class Phase3DocumentResponse(BaseModel):
    id: int
    task_id: int
    content: Optional[str] = None
    product_approved: bool
    cd_approved: bool
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ActionPlanTaskResponse(BaseModel):
    id: int
    action_plan_id: int
    task_code: str
    task_name: str
    target_department: str
    action_required: str
    impacted_internal_doc: Optional[str] = None
    output_type: str
    document: Optional[Phase3DocumentResponse] = None

    class Config:
        from_attributes = True


class ActionPlanResponse(BaseModel):
    id: int
    plan_code: str
    law_id: Optional[str] = None
    law_title: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    ceo_approved_at: Optional[datetime] = None
    tasks: List[ActionPlanTaskResponse] = []

    class Config:
        from_attributes = True


class DocumentGenerateRequest(BaseModel):
    task_id: int
    refinement_prompt: Optional[str] = None
    generation_type: str = "document" # "document" or "announcement"


class Phase3DocumentUpdate(BaseModel):
    content: str


class ApprovalRequest(BaseModel):
    role: str  # "product" or "cd"


class GroupDocumentGenerateRequest(BaseModel):
    task_ids: List[int]
    refinement_prompt: Optional[str] = None
    generation_type: str = "document"

