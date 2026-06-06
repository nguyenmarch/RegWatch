export type AnalysisSeverity = 'urgent' | 'review' | 'monitor'

export interface AnalysisCompareSide {
  source: string
  verdict: string
  quote: string
  tone: 'danger' | 'safe'
}

export interface BusinessImpact {
  area: string
  detail: string
  risk: AnalysisSeverity
}

export interface RiskScore {
  label: string
  value: number
  level: string
}

export interface DetailRow {
  col1: string
  col2: string
  col3: string
  status: 'violation' | 'compliant' | 'risk' | 'missing' | 'neutral'
}

export interface DetailTable {
  title: string
  headers: string[]
  rows: DetailRow[]
}

export interface OverallRisk {
  value: number
  label: string
}

export interface AnalysisSummary {
  id: number
  code: string
  document_id: number | null
  title: string
  summary: string
  severity: AnalysisSeverity
  deadline: string | null
  status: string
  overall_risk: OverallRisk
  created_at: string
}

export interface AnalysisDetail extends AnalysisSummary {
  conflict_headline: string
  compare_left: AnalysisCompareSide
  compare_right: AnalysisCompareSide
  conflict_note: string
  business_impacts: BusinessImpact[]
  risk_scores: RiskScore[]
  risk_conclusion: string
  detail_tables: DetailTable[]
  generated_at: string | null
}

export interface AnalysisUpdate {
  title?: string
  summary?: string
  conflict_headline?: string
  deadline?: string | null
  overall_risk?: OverallRisk
  compare_left?: AnalysisCompareSide
  compare_right?: AnalysisCompareSide
  conflict_note?: string
  business_impacts?: BusinessImpact[]
  risk_scores?: RiskScore[]
  risk_conclusion?: string
  detail_tables?: DetailTable[]
}

export const SEVERITY_META: Record<
  AnalysisSeverity,
  { labelKey: string; dot: string; chip: string }
> = {
  urgent: { labelKey: 'analyses.severity.urgent', dot: 'analysis-dot--urgent', chip: 'analysis-chip--urgent' },
  review: { labelKey: 'analyses.severity.review', dot: 'analysis-dot--review', chip: 'analysis-chip--review' },
  monitor: { labelKey: 'analyses.severity.monitor', dot: 'analysis-dot--monitor', chip: 'analysis-chip--monitor' },
}
