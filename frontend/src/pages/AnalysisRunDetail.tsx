import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { api, type Document } from '../lib/api'
import type { AnalysisSeverity, AnalysisSummary } from '../lib/analyses'
import { SEVERITY_META } from '../lib/analyses'
import { buildAnalysisRuns, findAnalysisRun } from '../lib/analysisRuns'
import { exportAnalysisRunDocx } from '../lib/exportAnalysisDocx'
import { parseBackendDate } from '../lib/datetime'
import AnalysisStats, { type AnalysisStatKey } from '../components/analysis/AnalysisStats'
import AnalysisFindingRow from '../components/analysis/AnalysisFindingRow'
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ChartIcon,
  ClockIcon,
  DownloadIcon,
  FileTextIcon,
  LoaderIcon,
  RefreshIcon,
} from '../components/Icons'

function formatDateTime(value: string, lang: string) {
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(parseBackendDate(value))
}

export default function AnalysisRunDetail() {
  const { runKey } = useParams<{ runKey: string }>()
  const { t, i18n } = useTranslation()
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<AnalysisStatKey | null>(null)

  async function loadData() {
    setLoading(true)
    try {
      const [list, docs] = await Promise.all([
        api.analyses.list(),
        api.documents.list().catch(() => [] as Document[]),
      ])
      setAnalyses(list)
      setDocuments(docs)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const runs = useMemo(() => buildAnalysisRuns(analyses, documents), [analyses, documents])
  const run = useMemo(() => findAnalysisRun(runs, runKey), [runs, runKey])

  const counts = useMemo<Record<AnalysisStatKey, number>>(() => {
    const next: Record<AnalysisStatKey, number> = {
      urgent: 0,
      review: 0,
      monitor: 0,
      total: run?.analyses.length ?? 0,
    }
    for (const analysis of run?.analyses ?? []) next[analysis.severity] += 1
    return next
  }, [run])

  const visibleFindings = useMemo(() => {
    const source = run?.analyses ?? []
    if (!filter || filter === 'total') return source
    return source.filter(analysis => analysis.severity === filter)
  }, [run, filter])

  if (loading) {
    return (
      <div className="analyses-page">
        <div className="container">
          <div className="analyses-empty">
            <LoaderIcon size={40} className="icon-spin" />
            <p>{t('analyses.loading')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!run) {
    return (
      <div className="analyses-page">
        <div className="container">
          <div className="analyses-empty">
            <AlertTriangleIcon size={40} />
            <p className="analyses-empty-title">{t('analyses.runNotFound')}</p>
            <Link to="/analyses" className="btn btn-primary btn-sm">
              <ArrowLeftIcon size={14} />
              {t('analyses.backToHistory')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const meta = SEVERITY_META[run.highestSeverity]
  const sourceDate = run.documentCreatedAt ?? run.latestAnalysisAt
  const activeSeverityLabel =
    filter && filter !== 'total' ? t(SEVERITY_META[filter as AnalysisSeverity].labelKey) : null

  function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'analysis-run'
  }

  function downloadRunJson() {
    const payload = {
      key: run.key,
      document_id: run.documentId,
      document_title: run.documentTitle,
      document_created_at: run.documentCreatedAt,
      latest_analysis_at: run.latestAnalysisAt,
      highest_severity: run.highestSeverity,
      top_risk: run.topRisk,
      risk_label: run.riskLabel,
      status: run.status,
      counts: run.counts,
      summary: run.summary,
      analyses: run.analyses,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${safeFileName(run.documentTitle)}-analysis-run.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="analyses-page">
      <div className="container">
        <div className={`analysis-run-hero analysis-run-hero--${run.highestSeverity}`}>
          <div className="analysis-run-hero-top">
            <Link to="/analyses" className="adetail-back">
              <ArrowLeftIcon size={15} />
              {t('analyses.backToHistory')}
            </Link>
            <div className="analysis-run-hero-actions">
              <button className="btn btn-outline btn-sm" onClick={downloadRunJson} type="button">
                <DownloadIcon size={14} />
                {t('analyses.exportJson')}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => void exportAnalysisRunDocx(run)} type="button">
                <DownloadIcon size={14} />
                {t('analyses.exportDocx')}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => void loadData()} type="button">
                <RefreshIcon size={14} />
                {t('analyses.refresh')}
              </button>
            </div>
          </div>

          <div className="analysis-run-hero-main">
            <div className="analysis-run-hero-icon">
              <FileTextIcon size={28} />
            </div>
            <div className="analysis-run-hero-copy">
              <p className="analyses-eyebrow">{t('analyses.runDashboard')}</p>
              <h1 className="analyses-title">{run.documentTitle}</h1>
              <p className="analyses-subtitle">{run.summary}</p>
              <div className="analysis-run-hero-meta">
                <span><ClockIcon size={13} /> {formatDateTime(sourceDate, i18n.language)}</span>
                <span><ChartIcon size={13} /> {t('analyses.findingCount', { count: run.analyses.length })}</span>
                <span className={`analysis-chip ${meta.chip}`}>{t(meta.labelKey)}</span>
                <span className={`status-badge status-badge--${run.status}`}>{t(`analyses.status.${run.status}`)}</span>
              </div>
            </div>
            <div className="analysis-run-hero-risk">
              <span>{run.topRisk}%</span>
              <small>{run.riskLabel}</small>
            </div>
          </div>
        </div>

        <AnalysisStats
          counts={counts}
          active={filter}
          onSelect={key => setFilter(current => (current === key ? null : key))}
        />

        {activeSeverityLabel && (
          <div className="analyses-filter-bar">
            <span>{t('analyses.filteringBy', { severity: activeSeverityLabel })}</span>
            <button className="btn btn-outline btn-xs" onClick={() => setFilter(null)} type="button">
              {t('analyses.clearFilter')}
            </button>
          </div>
        )}

        <div className="analysis-section-head">
          <div>
            <h2>{t('analyses.childDashboardTitle')}</h2>
            <p>{t('analyses.childDashboardSubtitle')}</p>
          </div>
        </div>

        <div className="analyses-list-wrap">
          {visibleFindings.length > 0 ? (
            visibleFindings.map((analysis, index) => (
              <AnalysisFindingRow
                key={analysis.id}
                analysis={analysis}
                index={index}
                showDate
              />
            ))
          ) : (
            <div className="analyses-empty">
              <div className="analyses-empty-icon"><AlertTriangleIcon size={36} /></div>
              <p className="analyses-empty-title">{t('analyses.emptyFilterTitle')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
