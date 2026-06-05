// Kiểu dữ liệu Cảnh báo Tuân thủ (Output 1) — khớp response backend (snake_case).
// Dữ liệu thật lấy từ API (Qdrant + Neo4j → Gemini); xem api.alerts.

export type AlertSeverity = 'urgent' | 'review' | 'monitor'

export interface AlertCompareSide {
  source: string
  verdict: string
  quote: string
  tone: 'danger' | 'safe'
}

export interface BusinessImpact {
  area: string
  detail: string
  risk: AlertSeverity
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

/** Bản rút gọn cho danh sách dashboard. */
export interface AlertSummary {
  id: number
  code: string
  document_id: number | null
  title: string
  summary: string
  severity: AlertSeverity
  deadline: string | null
  status: string
  overall_risk: OverallRisk
  created_at: string
}

/** Bản đầy đủ cho trang chi tiết. */
export interface AlertDetail extends AlertSummary {
  conflict_headline: string
  compare_left: AlertCompareSide
  compare_right: AlertCompareSide
  conflict_note: string
  business_impacts: BusinessImpact[]
  risk_scores: RiskScore[]
  risk_conclusion: string
  generated_at: string | null
}

export const SEVERITY_META: Record<
  AlertSeverity,
  { label: string; dot: string; chip: string }
> = {
  urgent:  { label: 'KHẨN CẤP',  dot: 'alert-dot--urgent',  chip: 'alert-chip--urgent'  },
  review:  { label: 'CẦN CHỈNH', dot: 'alert-dot--review',  chip: 'alert-chip--review'  },
  monitor: { label: 'THEO DÕI',  dot: 'alert-dot--monitor', chip: 'alert-chip--monitor' },
}
