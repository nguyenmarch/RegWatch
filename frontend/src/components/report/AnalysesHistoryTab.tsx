import { useMemo, useState } from 'react'
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

type AnalysisFilter = 'all' | 'open' | 'finalized'

const isFinalized = (a: Analyses) => a.status === 'finalized'

export default function AnalysesHistoryTab({
  analyses,
  selectedAnalyses,
  onSelectAnalyses,
  loading,
}: AnalysesHistoryTabProps) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<AnalysisFilter>('all')
  const counts = useMemo(() => {
    const finalized = analyses.filter(isFinalized).length
    return {
      all: analyses.length,
      open: analyses.length - finalized,
      finalized,
    }
  }, [analyses])
  const filteredAnalyses = useMemo(
    () => analyses.filter(a => {
      if (filter === 'finalized') return isFinalized(a)
      if (filter === 'open') return !isFinalized(a)
      return true
    }),
    [analyses, filter],
  )

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
      <div className="rpt-analysis-filters" role="tablist" aria-label="Report analysis filters">
        {[
          { key: 'all' as const, label: 'Tất cả', title: 'Tất cả Analyses', count: counts.all },
          { key: 'open' as const, label: 'Mở', title: 'Chưa giải quyết', count: counts.open },
          { key: 'finalized' as const, label: 'Chốt', title: 'Đã giải quyết', count: counts.finalized },
        ].map(item => (
          <button
            key={item.key}
            type="button"
            className={`rpt-analysis-filter${filter === item.key ? ' rpt-analysis-filter--active' : ''}`}
            onClick={() => setFilter(item.key)}
            title={item.title}
            aria-pressed={filter === item.key}
          >
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </button>
        ))}
      </div>

      {filteredAnalyses.length === 0 ? (
        <div className="rpt-list-empty">
          Không có Analyses phù hợp bộ lọc
        </div>
      ) : filteredAnalyses.map(a => {
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
                <span className={`rpt-item-status${isFinalized(a) ? ' rpt-item-status--done' : ''}`}>
                  {isFinalized(a) ? 'Đã giải quyết' : 'Chưa giải quyết'}
                </span>
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
