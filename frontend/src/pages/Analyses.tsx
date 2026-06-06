import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Document } from '../lib/api'
import type { AnalysisSeverity, AnalysisSummary } from '../lib/analyses'
import { SEVERITY_META } from '../lib/analyses'
import { buildAnalysisRuns, countRunFindings } from '../lib/analysisRuns'
import AnalysisStats, { type AnalysisStatKey } from '../components/analysis/AnalysisStats'
import AnalysisRunCard, { AnalysisRunCardSkeleton } from '../components/analysis/AnalysisRunCard'
import AnalysisFindingRow, { AnalysisRowSkeleton } from '../components/analysis/AnalysisFindingRow'
import {
  AlertTriangleIcon,
  ChartIcon,
  FileTextIcon,
  LoaderIcon,
  RefreshIcon,
  ScrollTextIcon,
} from '../components/Icons'

type Tab = 'history' | 'findings'

const TABS: { key: Tab; icon: JSX.Element; labelKey: string }[] = [
  { key: 'history', icon: <ScrollTextIcon size={15} />, labelKey: 'analyses.tabs.history' },
  { key: 'findings', icon: <ChartIcon size={15} />, labelKey: 'analyses.tabs.findings' },
]

export default function Analyses() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('history')
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [pending, setPending] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<AnalysisStatKey | null>(null)

  async function loadData(silent = false) {
    if (!silent) setLoading(true)
    try {
      const [list, docs, jobs] = await Promise.all([
        api.analyses.list(),
        api.documents.list().catch(() => [] as Document[]),
        api.analyses.pending().catch(() => ({ pending: 0 })),
      ])
      setAnalyses(list)
      setDocuments(docs)
      setPending(jobs.pending)
    } catch {
      if (!silent) {
        setAnalyses([])
        setDocuments([])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    if (!pending) return undefined
    const timer = window.setInterval(() => void loadData(true), 5000)
    return () => window.clearInterval(timer)
  }, [pending])

  const runs = useMemo(() => buildAnalysisRuns(analyses, documents), [analyses, documents])

  const counts = useMemo<Record<AnalysisStatKey, number>>(() => {
    const next: Record<AnalysisStatKey, number> = {
      urgent: 0,
      review: 0,
      monitor: 0,
      total: analyses.length,
    }
    for (const analysis of analyses) next[analysis.severity] += 1
    return next
  }, [analyses])

  const visibleRuns = useMemo(() => {
    if (!filter || filter === 'total') return runs
    return runs.filter(run => run.counts[filter] > 0)
  }, [runs, filter])

  const visibleFindings = useMemo(() => {
    const filtered =
      filter && filter !== 'total' ? analyses.filter(analysis => analysis.severity === filter) : analyses
    return [...filtered].sort((a, b) => b.overall_risk.value - a.overall_risk.value)
  }, [analyses, filter])

  function handleStatSelect(key: AnalysisStatKey) {
    setFilter(current => (current === key ? null : key))
  }

  const activeSeverityLabel =
    filter && filter !== 'total' ? t(SEVERITY_META[filter as AnalysisSeverity].labelKey) : null

  return (
    <div className="analyses-page">
      <div className="container">
        <div className="analyses-header analyses-header--hero">
          <div className="analyses-header-left">
            <div className="analyses-header-icon">
              <ChartIcon size={24} />
            </div>
            <div>
              <p className="analyses-eyebrow">{t('analyses.eyebrow')}</p>
              <h1 className="analyses-title">{t('analyses.title')}</h1>
              <p className="analyses-subtitle">{t('analyses.subtitle')}</p>
            </div>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => void loadData()} disabled={loading}>
            <RefreshIcon size={14} />
            {t('analyses.refresh')}
          </button>
        </div>

        {pending > 0 && (
          <div className="analyses-notice">
            <LoaderIcon size={14} className="icon-spin" />
            <span>{t('analyses.pendingNotice', { count: pending })}</span>
          </div>
        )}

        <div className="analysis-run-summary">
          <div>
            <span className="analysis-run-summary-label">{t('analyses.parentRuns')}</span>
            <strong>{runs.length}</strong>
          </div>
          <div>
            <span className="analysis-run-summary-label">{t('analyses.childFindings')}</span>
            <strong>{countRunFindings(runs)}</strong>
          </div>
          <div>
            <span className="analysis-run-summary-label">{t('analyses.openItems')}</span>
            <strong>{analyses.filter(item => item.status !== 'processed').length}</strong>
          </div>
        </div>

        <AnalysisStats
          counts={counts}
          active={filter}
          loading={loading}
          onSelect={handleStatSelect}
        />

        <div className="docs-tabs">
          {TABS.map(({ key, icon, labelKey }) => (
            <button
              key={key}
              className={`docs-tab ${tab === key ? 'docs-tab--active' : ''}`}
              onClick={() => setTab(key)}
              type="button"
            >
              {icon}
              {t(labelKey)}
              <span className="docs-tab-badge">
                {key === 'history' ? visibleRuns.length : visibleFindings.length}
              </span>
            </button>
          ))}
        </div>

        {activeSeverityLabel && (
          <div className="analyses-filter-bar">
            <span>{t('analyses.filteringBy', { severity: activeSeverityLabel })}</span>
            <button className="btn btn-outline btn-xs" onClick={() => setFilter(null)} type="button">
              {t('analyses.clearFilter')}
            </button>
          </div>
        )}

        <div className="docs-tab-content">
          {tab === 'history' ? (
            <HistoryTab runs={visibleRuns} loading={loading} total={runs.length} />
          ) : (
            <FindingsTab analyses={visibleFindings} documents={documents} loading={loading} />
          )}
        </div>
      </div>
    </div>
  )
}

function HistoryTab({
  runs,
  loading,
  total,
}: {
  runs: ReturnType<typeof buildAnalysisRuns>
  loading: boolean
  total: number
}) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="analysis-run-grid">
        {[1, 2, 3].map(item => <AnalysisRunCardSkeleton key={item} />)}
      </div>
    )
  }

  if (total === 0) {
    return (
      <div className="analyses-empty">
        <div className="analyses-empty-icon"><FileTextIcon size={36} /></div>
        <p className="analyses-empty-title">{t('analyses.emptyHistoryTitle')}</p>
        <p className="analyses-empty-hint">{t('analyses.emptyHistoryHint')}</p>
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="analyses-empty">
        <div className="analyses-empty-icon"><AlertTriangleIcon size={36} /></div>
        <p className="analyses-empty-title">{t('analyses.emptyFilterTitle')}</p>
      </div>
    )
  }

  return (
    <div className="analysis-run-grid">
      {runs.map((run, index) => <AnalysisRunCard key={run.key} run={run} index={index} />)}
    </div>
  )
}

function FindingsTab({
  analyses,
  documents,
  loading,
}: {
  analyses: AnalysisSummary[]
  documents: Document[]
  loading: boolean
}) {
  const { t } = useTranslation()
  const documentsById = useMemo(() => new Map(documents.map(doc => [doc.id, doc])), [documents])

  if (loading) {
    return (
      <div className="analyses-list-wrap">
        {[1, 2, 3].map(item => <AnalysisRowSkeleton key={item} />)}
      </div>
    )
  }

  if (analyses.length === 0) {
    return (
      <div className="analyses-empty">
        <div className="analyses-empty-icon"><AlertTriangleIcon size={36} /></div>
        <p className="analyses-empty-title">{t('analyses.emptyFindingsTitle')}</p>
        <p className="analyses-empty-hint">{t('analyses.emptyFindingsHint')}</p>
      </div>
    )
  }

  return (
    <div className="analyses-list-wrap">
      {analyses.map((analysis, index) => (
        <AnalysisFindingRow
          key={analysis.id}
          analysis={analysis}
          index={index}
          documentTitle={analysis.document_id ? documentsById.get(analysis.document_id)?.title : undefined}
          showDate
        />
      ))}
    </div>
  )
}
