import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api, type Document, type KbType } from '../lib/api'
import ManageTab from '../components/documents/ManageTab'
import UploadTab from '../components/documents/UploadTab'
import { SEVERITY_META, type AnalysisSeverity, type AnalysisSummary } from '../lib/analyses'
import {
  AlertTriangleIcon, ClockIcon, EyeIcon, LoaderIcon, RefreshIcon,
  FileTextIcon, UploadCloudIcon,
} from '../components/Icons'

type SubTab = 'history' | 'manage' | 'upload'
type StatKey = AnalysisSeverity | 'total'

const STAT_CARDS: { key: StatKey; label: string; tone: string }[] = [
  { key: 'urgent',  label: 'Phân Tích Khẩn Cấp', tone: 'stat--urgent'  },
  { key: 'review',  label: 'Cần Chỉnh',          tone: 'stat--review'  },
  { key: 'monitor', label: 'Theo Dõi',           tone: 'stat--monitor' },
  { key: 'total',   label: 'Tổng Cộng',          tone: 'stat--total'   },
]

const SEVERITY_RANK: Record<AnalysisSeverity, number> = { urgent: 0, review: 1, monitor: 2 }

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending:   { text: 'Chưa xử lý', cls: 'status-badge--pending'   },
  processed: { text: 'Đã xử lý',   cls: 'status-badge--processed' },
}

type Toast = { id: number; type: 'success' | 'error'; msg: string }
let toastSeq = 0

// ── AnalysesHistory — dashboard tab ─────────────────────────────────────────────

function AnalysesHistory() {
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([])
  const [pending, setPending] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatKey | null>(null)

  async function loadAnalyses(silent = false) {
    if (!silent) setLoading(true)
    try {
      const [list, jobs] = await Promise.all([
        api.analyses.list(),
        api.analyses.pending().catch(() => ({ pending: 0 })),
      ])
      setAnalyses(list)
      setPending(jobs.pending)
    } catch {
      if (!silent) setAnalyses([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAnalyses() }, [])

  const counts = useMemo(() => {
    const c: Record<StatKey, number> = { urgent: 0, review: 0, monitor: 0, total: analyses.length }
    for (const a of analyses) c[a.severity]++
    return c
  }, [analyses])

  const visible = useMemo(() => {
    const filtered = filter && filter !== 'total'
      ? analyses.filter(a => a.severity === filter)
      : analyses
    return [...filtered].sort((a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.overall_risk.value - a.overall_risk.value
    )
  }, [analyses, filter])

  return (
    <div>
      <div className="docs-header" style={{ marginBottom: '1rem' }}>
        <p className="docs-subtitle">
          Tự động phát hiện xung đột / chồng chéo giữa tài liệu mới và kho tri thức (Qdrant + Neo4j).
        </p>
        <button className="btn btn-outline btn-sm" onClick={() => loadAnalyses()} disabled={loading}>
          <RefreshIcon size={14} /> Làm mới
        </button>
      </div>

      {pending > 0 && (
        <div className="analysis-notice">
          ⏳ {pending} tài liệu đang chờ sinh phân tích (hết quota Gemini) — hệ thống sẽ tự thử lại.
        </div>
      )}

      {/* Stat cards */}
      <div className="stat-grid">
        {STAT_CARDS.map(({ key, label, tone }) => (
          <button
            key={key}
            className={`stat-card ${tone} ${filter === key ? 'stat-card--active' : ''}`}
            onClick={() => setFilter(f => (f === key ? null : key))}
          >
            <span className="stat-value">{counts[key]}</span>
            <span className="stat-label">{label}</span>
            <span className="stat-link">Xem chi tiết →</span>
          </button>
        ))}
      </div>

      {/* Analysis list */}
      <div className="analysis-list-card">
        <div className="analysis-list-head">
          <h2 className="analysis-list-title">
            <AlertTriangleIcon size={20} />
            Danh Sách Phân Tích Tuân Thủ Quy Định
          </h2>
          {filter && (
            <button className="btn btn-outline btn-sm" onClick={() => setFilter(null)}>
              Bỏ lọc
            </button>
          )}
        </div>

        {loading ? (
          <div className="analysis-list-empty"><LoaderIcon size={28} /><p>Đang tải...</p></div>
        ) : visible.length === 0 ? (
          <div className="analysis-list-empty">
            <AlertTriangleIcon size={32} />
            <p>Chưa có phân tích nào. Tải lên một tài liệu — phân tích sẽ tự động xuất hiện sau khi xử lý xong.</p>
          </div>
        ) : (
          <div className="analysis-list">
            {visible.map(a => {
              const meta = SEVERITY_META[a.severity]
              const statusInfo = STATUS_LABEL[a.status] ?? STATUS_LABEL['pending']
              return (
                <Link key={a.id} to={`/analyses/${a.id}`} className={`analysis-row analysis-row--${a.severity}`}>
                  <span className={`analysis-dot ${meta.dot}`} />
                  <div className="analysis-row-main">
                    <span className="analysis-row-title">{a.code}: {a.title}</span>
                    <span className="analysis-row-sub">{a.summary}</span>
                  </div>
                  {a.deadline && (
                    <span className="analysis-row-deadline">
                      <ClockIcon size={14} />
                      {a.deadline}
                    </span>
                  )}
                  <span className={`status-badge ${statusInfo.cls}`}>{statusInfo.text}</span>
                  <span className={`analysis-chip ${meta.chip}`}>{meta.label}</span>
                  <span className="analysis-row-view"><EyeIcon size={16} /></span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Analyses page — 3 sub-tabs ──────────────────────────────────────────────────

export default function Analyses() {
  const [subTab, setSubTab] = useState<SubTab>('history')
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState<Toast[]>([])

  const activeKb: KbType = 'law'
  const kbDocs = docs.filter(d => d.kb_type === activeKb)
  const processingCount = kbDocs.filter(d => d.status === 'pending' || d.status === 'processing').length

  function addToast(type: Toast['type'], msg: string) {
    const id = ++toastSeq
    setToasts(prev => [...prev, { id, type, msg }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }

  const fetchDocs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      setDocs(await api.documents.list())
    } catch {
      if (!silent) addToast('error', 'Không tải được danh sách tài liệu.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  useEffect(() => {
    if (!processingCount) return
    const timer = setInterval(() => fetchDocs(true), 3000)
    return () => clearInterval(timer)
  }, [processingCount, fetchDocs])

  function handleDeleted(id: number) {
    setDocs(prev => prev.filter(d => d.id !== id))
    addToast('success', 'Đã xoá tài liệu.')
  }

  function handleUploaded(_docIds: number[]) {
    fetchDocs(true)
    addToast('success', 'Tải lên thành công — đang xử lý và sinh phân tích...')
    setSubTab('manage')
  }

  const SUB_TABS: { key: SubTab; icon: React.ReactNode; label: string }[] = [
    { key: 'history', icon: <AlertTriangleIcon size={14} />, label: 'Phân Tích' },
    { key: 'manage',  icon: <FileTextIcon size={14} />,      label: 'Quản lý tài liệu' },
    { key: 'upload',  icon: <UploadCloudIcon size={14} />,   label: 'Tải lên' },
  ]

  return (
    <div className="analyses-page">
      <div className="container">

        {/* Page header */}
        <div className="docs-header">
          <div>
            <h1 className="docs-title">Phân Tích Tuân Thủ</h1>
          </div>
          {processingCount > 0 && (
            <span className="docs-processing-badge">
              <LoaderIcon size={13} className="icon-spin" />
              {processingCount} đang xử lý
            </span>
          )}
        </div>

        {/* Sub-tabs */}
        <div className="docs-tabs">
          {SUB_TABS.map(({ key, icon, label }) => (
            <button
              key={key}
              className={`docs-tab ${subTab === key ? 'docs-tab--active' : ''}`}
              onClick={() => setSubTab(key)}
            >
              {icon}
              {label}
              {key === 'manage' && kbDocs.length > 0 && (
                <span className="docs-tab-badge">{kbDocs.length}</span>
              )}
              {key === 'manage' && processingCount > 0 && (
                <span className="docs-tab-badge docs-tab-badge--spin">
                  <LoaderIcon size={10} className="icon-spin" />
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="docs-tab-content">
          {subTab === 'history' && <AnalysesHistory />}
          {subTab === 'manage' && (
            <ManageTab docs={kbDocs} loading={loading} onDeleted={handleDeleted} />
          )}
          {subTab === 'upload' && (
            <UploadTab kbType={activeKb} onUploaded={handleUploaded} />
          )}
        </div>

      </div>

      {/* Toast stack */}
      <div className="toast-stack">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast--${toast.type}`}>
            <span className="toast-dot" />
            {toast.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
