export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface Alert {
  id: number
  alert_code: string
  severity: AlertSeverity
  title: string
  description: string
  issued_date: string
  due_date: string
  estimated_impact: string
  created_at: string
}

export interface ActionPlanItem {
  id: number
  alert_id: number
  action_description: string
  responsible_department: string
  target_date: string
  estimated_budget: number
  estimated_risk: string
  code: string
  status: string
  deliverable_type: DeliverableType
  owner_role: string
  co_owner_role: string
  dependency: string
  evidence_document: string
}

export interface ActionPlanItemsSaveResponse {
  message: string
  count: number
}

export type ActionPlanWorkflowStatus =
  | 'draft'
  | 'submitted_to_ceo'
  | 'approved_by_ceo'
  | 'issued'
  | 'sent_to_compliance'
  | 'in_execution'
  | 'completed'

export type DeliverableType =
  | 'policy_amendment'
  | 'internal_training'
  | 'system_change'
  | 'process_update'
  | 'communication'

export interface RiskReport {
  risk_level: string
  estimated_budget: number
  business_impact: string
  compliance_recommendation: string
  report_summary: string
  submitted_by: string
  submitted_at: string
}

export interface CeoApproval {
  status: 'pending' | 'approved' | 'rejected'
  approved_by: string
  approved_at: string
  approval_note: string
}

export interface IssuedPlan {
  issued_by: string
  issued_at: string
  effective_from: string
  version: string
  signed_document_ref: string
  issue_note: string
}

export interface ActionPlanDossier {
  alert_id: number
  workflow_status: ActionPlanWorkflowStatus
  risk_report: RiskReport
  ceo_approval: CeoApproval
  issued_plan: IssuedPlan
  action_items: ActionPlanItem[]
}

export type ActionPlanUpdate = Partial<{
  workflow_status: ActionPlanWorkflowStatus
  risk_report: RiskReport
  ceo_approval: CeoApproval
  issued_plan: IssuedPlan
  action_items: ActionPlanItem[]
}>

export interface FinalizedActionPlan {
  alert_code: string | null
  alert_title: string
  alert_severity: string | null
  finalized_at: string
  action_plan_items: ActionPlanItem[]
  workflow_status: ActionPlanWorkflowStatus
  risk_report: RiskReport
  ceo_approval: CeoApproval
  issued_plan: IssuedPlan
}

export interface RecommendationResponse {
  recommendations: string[]
}
