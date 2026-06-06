from typing import Any, Literal

from pydantic import BaseModel, Field


class AlertResponse(BaseModel):
    id: int
    alert_code: str
    severity: str
    title: str
    description: str
    issued_date: str
    due_date: str
    estimated_impact: str
    created_at: str


class ActionPlanItemResponse(BaseModel):
    id: int
    alert_id: int
    action_description: str
    responsible_department: str
    target_date: str
    estimated_budget: int
    estimated_risk: str
    code: str
    status: str
    deliverable_type: str = "process_update"
    owner_role: str = "Compliance Department / Risk Manager"
    co_owner_role: str | None = None
    dependency: str | None = None
    evidence_document: str | None = None


class ActionPlanItemsUpdate(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list)


class ActionPlanItemsSaveResponse(BaseModel):
    message: str
    count: int


ActionPlanWorkflowStatus = Literal[
    "draft",
    "submitted_to_ceo",
    "approved_by_ceo",
    "issued",
    "sent_to_compliance",
    "in_execution",
    "completed",
]


class RiskReport(BaseModel):
    risk_level: Literal["1", "2", "3"] | str = ""
    estimated_budget: int = 0
    business_impact: str = ""
    compliance_recommendation: str = ""
    report_summary: str = ""
    submitted_by: str = ""
    submitted_at: str = ""


class CeoApproval(BaseModel):
    status: Literal["pending", "approved", "rejected"] = "pending"
    approved_by: str = ""
    approved_at: str = ""
    approval_note: str = ""


class IssuedPlan(BaseModel):
    issued_by: str = ""
    issued_at: str = ""
    effective_from: str = ""
    version: str = "v1"
    signed_document_ref: str = ""
    issue_note: str = ""


class ActionPlanResponse(BaseModel):
    alert_id: int
    workflow_status: ActionPlanWorkflowStatus
    risk_report: RiskReport
    ceo_approval: CeoApproval
    issued_plan: IssuedPlan
    action_items: list[ActionPlanItemResponse]


class ActionPlanUpdate(BaseModel):
    workflow_status: ActionPlanWorkflowStatus | None = None
    risk_report: RiskReport | None = None
    ceo_approval: CeoApproval | None = None
    issued_plan: IssuedPlan | None = None
    action_items: list[dict[str, Any]] | None = None


class FinalizedActionPlanResponse(BaseModel):
    alert_code: str | None
    alert_title: str
    alert_severity: str | None
    finalized_at: str
    action_plan_items: list[dict[str, Any]]
    workflow_status: ActionPlanWorkflowStatus = "issued"
    risk_report: RiskReport
    ceo_approval: CeoApproval
    issued_plan: IssuedPlan


class RecommendationRequest(BaseModel):
    prompt: str = Field(..., min_length=1)


class RecommendationResponse(BaseModel):
    recommendations: list[str]
