import { useTranslation } from 'react-i18next'
import type { Analyses } from '../../types/report'
import { LoaderIcon } from '../Icons'

interface AnalysesHistoryTabProps {
  analyses: Analyses[]
  selectedAnalyses: Analyses | null
  onSelectAnalyses: (analyses: Analyses) => void
  loading: boolean
}

const normalizeSeverity = (severity: string): string => {
  const v = (severity || '').trim().toUpperCase()
  if (['CRITICAL', 'URGENT'].includes(v)) return 'CRITICAL'
  if (v === 'HIGH') return 'HIGH'
  if (['MEDIUM', 'REVIEW'].includes(v)) return 'MEDIUM'
  return 'LOW'
}

const formatDate = (value: string) => {
  if (!value) return 'Chưa có'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Chưa có'
  return date.toLocaleDateString('vi-VN')
}

const SEV_CLASS: Record<string, string> = {
  CRITICAL: 'rpt-sev--critical',
  HIGH: 'rpt-sev--high',
  MEDIUM: 'rpt-sev--medium',
  LOW: 'rpt-sev--low',
}

export default function AnalysesHistoryTab({
  analyses,
  selectedAnalyses,
  onSelectAnalyses,
  loading,
}: AnalysesHistoryTabProps) {
  const { t } = useTranslation()

  if (loading && analyses.length === 0) {
    return (
      <div className="rpt-list-empty">
        <LoaderIcon size={18} className="icon-spin" />
      </div>
    )
  }

  if (analyses.length === 0) {
    return (
      <div className="rpt-list-empty">
        {t('report.noAnalyses') || 'Không có Analyses nào'}
      </div>
    )
  }

  return (
    <div className="rpt-list">
      {analyses.map(a => {
        const sev = normalizeSeverity(a.severity)
        const isActive = selectedAnalyses?.id === a.id
        return (
          <div
            key={a.id}
            className={`rpt-item${isActive ? ' rpt-item--active' : ''}`}
            onClick={() => onSelectAnalyses(a)}
          >
            <div className="rpt-item-strip" />
            <div className="rpt-item-body">
              <div className="rpt-item-top">
                <span className={`rpt-sev ${SEV_CLASS[sev] ?? ''}`}>{sev}</span>
                <span className="rpt-item-code">{a.analyses_code}</span>
              </div>
              <div className="rpt-item-title">{a.title}</div>
              <div className="rpt-item-dates">
                <span className="rpt-item-date-pair">
                  <span>{t('report.issuedDate') || 'Phát hành'}:</span>
                  <span>{formatDate(a.issued_date)}</span>
                </span>
                <span className="rpt-item-date-pair">
                  <span>{t('report.dueDate') || 'Hạn'}:</span>
                  <span>{formatDate(a.due_date)}</span>
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
