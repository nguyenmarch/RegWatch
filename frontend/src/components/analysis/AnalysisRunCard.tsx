import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { SEVERITY_META } from '../../lib/analyses'
import type { AnalysisRun } from '../../lib/analysisRuns'
import { parseBackendDate } from '../../lib/datetime'
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
  ScrollTextIcon,
} from '../Icons'

interface Props {
  run: AnalysisRun
  index: number
}

function formatDateTime(value: string, lang: string) {
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(parseBackendDate(value))
}

export default function AnalysisRunCard({ run, index }: Props) {
  const { t, i18n } = useTranslation()
  const meta = SEVERITY_META[run.highestSeverity]
  const sourceDate = run.documentCreatedAt ?? run.latestAnalysisAt

  return (
    <Link
      to={`/analyses/history/${run.key}`}
      className={`arun-card arun-card--${run.highestSeverity}`}
      style={{ '--run-delay': `${index * 55}ms` } as CSSProperties}
    >
      <div className="arun-strip" />
      <div className="arun-top">
        <div className="arun-file-icon">
          <FileTextIcon size={20} />
        </div>
        <div className="arun-title-block">
          <h3 className="arun-title">{run.documentTitle}</h3>
          <div className="arun-meta">
            <span><ClockIcon size={13} /> {formatDateTime(sourceDate, i18n.language)}</span>
            <span><ScrollTextIcon size={13} /> {t('analyses.findingCount', { count: run.analyses.length })}</span>
          </div>
        </div>
        <span className={`analysis-chip ${meta.chip}`}>{t(meta.labelKey)}</span>
      </div>

      <p className="arun-summary">{run.summary}</p>

      <div className="arun-metrics">
        <div className="arun-risk">
          <span className="arun-risk-value">{run.topRisk}%</span>
          <span className="arun-risk-label">{run.riskLabel}</span>
        </div>
        <div className="arun-counts">
          <span className="arun-count arun-count--urgent">{run.counts.urgent}</span>
          <span className="arun-count arun-count--review">{run.counts.review}</span>
          <span className="arun-count arun-count--monitor">{run.counts.monitor}</span>
        </div>
      </div>

      <div className="arun-footer">
        <span className={`status-badge status-badge--${run.status}`}>
          {run.status === 'processed' ? <CheckCircleIcon size={12} /> : <AlertTriangleIcon size={12} />}
          {t(`analyses.status.${run.status}`)}
        </span>
        <span className="arun-open">
          {t('analyses.openDashboard')}
          <ArrowRightIcon size={14} />
        </span>
      </div>
    </Link>
  )
}

export function AnalysisRunCardSkeleton() {
  return (
    <div className="arun-card arun-card--skeleton">
      <div className="arun-strip" />
      <div className="arun-top">
        <div className="sk" style={{ width: 44, height: 44, borderRadius: 10 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="sk sk-title" style={{ width: '70%' }} />
          <div className="sk sk-xs" style={{ width: '45%' }} />
        </div>
      </div>
      <div className="sk sk-xs" style={{ width: '90%', marginTop: 16 }} />
      <div className="sk sk-xs" style={{ width: '55%', marginTop: 10 }} />
    </div>
  )
}
