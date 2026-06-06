export type AnalysesSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface Analyses {
  id: number
  analyses_code: string
  severity: AnalysesSeverity
  title: string
  description: string
  issued_date: string
  due_date: string
  estimated_impact: string
  created_at: string
}

export interface ReportItem {
  id: number
  analyses_id: number
  report_description: string
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

export interface ReportItemsSaveResponse {
  message: string
  count: number
}

export type ReportWorkflowStatus =
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

export interface ReportDossier {
  analyses_id: number
  workflow_status: ReportWorkflowStatus
  risk_report: RiskReport
  ceo_approval: CeoApproval
  issued_plan: IssuedPlan
  report_items: ReportItem[]
}

export type ReportUpdate = Partial<{
  workflow_status: ReportWorkflowStatus
  risk_report: RiskReport
  ceo_approval: CeoApproval
  issued_plan: IssuedPlan
  report_items: ReportItem[]
}>

export interface FinalizedReport {
  analyses_code: string | null
  analyses_title: string
  analyses_severity: string | null
  finalized_at: string
  report_items: ReportItem[]
  workflow_status: ReportWorkflowStatus
  risk_report: RiskReport
  ceo_approval: CeoApproval
  issued_plan: IssuedPlan
}

export interface RecommendationResponse {
  recommendations: string[]
}
