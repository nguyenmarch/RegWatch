from typing import Any, Literal

from pydantic import BaseModel, Field


class AnalysesResponse(BaseModel):
    id: int
    analyses_code: str
    severity: str
    title: str
    description: str
    issued_date: str
    due_date: str
    estimated_impact: str
    created_at: str
    status: str = ""


class AnalysesUpsertRequest(BaseModel):
    code: str | None = None
    analyses_code: str | None = None
    title: str
    summary: str = ""
    description: str | None = None
    conflict_headline: str = ""
    severity: str = "monitor"
    deadline: str | None = None
    status: str = "pending"
    overall_risk: dict[str, Any] | None = None
    compare_left: dict[str, Any] | list[Any] | None = None
    compare_right: dict[str, Any] | list[Any] | None = None
    conflict_note: str = ""
    business_impacts: dict[str, Any] | list[Any] | None = None
    risk_scores: dict[str, Any] | list[Any] | None = None
    risk_conclusion: str = ""
    detail_tables: list[Any] | None = None
    document_id: int | None = None
    generated_at: str | None = None


class ReportItemResponse(BaseModel):
    id: int
    analyses_id: int
    report_description: str
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


class ReportItemsUpdate(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list)


class ReportItemsSaveResponse(BaseModel):
    message: str
    count: int


ReportWorkflowStatus = Literal[
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


class ReportResponse(BaseModel):
    analyses_id: int
    workflow_status: ReportWorkflowStatus
    risk_report: RiskReport
    ceo_approval: CeoApproval
    issued_plan: IssuedPlan
    report_items: list[ReportItemResponse]
    action_plan: dict[str, Any] | None = None


class ReportUpdate(BaseModel):
    workflow_status: ReportWorkflowStatus | None = None
    risk_report: RiskReport | None = None
    ceo_approval: CeoApproval | None = None
    issued_plan: IssuedPlan | None = None
    report_items: list[dict[str, Any]] | None = None
    action_plan: dict[str, Any] | None = None


class ActionPlanAnalysis(BaseModel):
    alert_id: int
    alert_code: str
    title: str
    summary: str
    deadline: str


class ActionPlanMetadata(BaseModel):
    created_at: str = ""
    created_by: str = ""
    ceo_approved_at: str = ""
    total_estimated_budget_vnd: int = 0
    knowledge_base_uploaded_files: list[str] = Field(default_factory=list)


class ActionPlanTask(BaseModel):
    task_code: str
    action_description: str
    department: str
    target_date: str
    estimated_budget_vnd: int = 0
    risk_level: str
    status: str
    output_type: str
    impacted_internal_doc: str = ""


class ActionPlanResponse(BaseModel):
    report_id: str
    report_status: str
    analysis: ActionPlanAnalysis
    metadata: ActionPlanMetadata
    tasks: list[ActionPlanTask]


class FinalizedReportResponse(BaseModel):
    analyses_code: str | None

    analyses_title: str
    analyses_severity: str | None
    finalized_at: str
    report_items: list[dict[str, Any]]
    workflow_status: ReportWorkflowStatus = "issued"
    risk_report: RiskReport
    ceo_approval: CeoApproval
    issued_plan: IssuedPlan
    action_plan: dict[str, Any] | None = None


class RecommendationRequest(BaseModel):
    prompt: str = Field(..., min_length=1)


class RecommendationResponse(BaseModel):
    recommendations: list[ReportItemResponse]
