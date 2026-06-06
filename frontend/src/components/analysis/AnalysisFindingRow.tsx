import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { SEVERITY_META, type AnalysisSummary } from '../../lib/analyses'
import { parseBackendDate } from '../../lib/datetime'
import { ClockIcon, EyeIcon, FileTextIcon } from '../Icons'

interface Props {
  analysis: AnalysisSummary
  index: number
  documentTitle?: string
  showDate?: boolean
}

function formatShortDate(value: string, lang: string) {
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(parseBackendDate(value))
}

export default function AnalysisFindingRow({
  analysis,
  index,
  documentTitle,
  showDate = false,
}: Props) {
  const { t, i18n } = useTranslation()
  const meta = SEVERITY_META[analysis.severity]
  const statusKey = analysis.status === 'processed' ? 'processed' : 'pending'

  return (
    <Link
      to={`/analyses/${analysis.id}`}
      className={`arow arow--${analysis.severity}`}
      style={{ '--row-delay': `${index * 40}ms` } as CSSProperties}
    >
      <div className="arow-accent" />
      <span className={`analysis-dot ${meta.dot}`} />

      <div className="arow-body">
        <div className="arow-top">
          <span className="arow-code">{analysis.code}</span>
          <span className="arow-title">{analysis.title}</span>
        </div>
        <p className="arow-summary">{analysis.summary}</p>
        <div className="arow-meta">
          {documentTitle && (
            <span className="arow-date">
              <FileTextIcon size={12} />
              {documentTitle}
            </span>
          )}
          {analysis.deadline && (
            <span className="arow-deadline">
              <ClockIcon size={12} />
              {t('analyses.deadline', { value: analysis.deadline })}
            </span>
          )}
          {showDate && <span className="arow-date">{formatShortDate(analysis.created_at, i18n.language)}</span>}
        </div>
      </div>

      <div className="arow-right">
        <div className="arow-risk">
          <span className="arow-risk-value">{analysis.overall_risk.value}%</span>
          <span className="arow-risk-label">{analysis.overall_risk.label}</span>
        </div>
        <span className={`analysis-chip ${meta.chip}`}>{t(meta.labelKey)}</span>
        <span className={`status-badge status-badge--${statusKey}`}>{t(`analyses.status.${statusKey}`)}</span>
        <span className="arow-arrow"><EyeIcon size={16} /></span>
      </div>
    </Link>
  )
}

export function AnalysisRowSkeleton() {
  return (
    <div className="arow-skeleton">
      <div className="arow-accent" />
      <div className="sk" style={{ width: 9, height: 9, borderRadius: '50%' }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="sk sk-title" style={{ width: '60%' }} />
        <div className="sk sk-xs" style={{ width: '80%' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <div className="sk sk-xs" style={{ width: 48 }} />
        <div className="sk sk-xs" style={{ width: 64 }} />
      </div>
    </div>
  )
}
