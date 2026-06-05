import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { SEVERITY_META, type AlertSeverity, type AlertSummary } from '../../lib/alerts'
import { AlertTriangleIcon, ClockIcon, EyeIcon, LoaderIcon, RefreshIcon } from '../Icons'

type StatKey = AlertSeverity | 'total'

const STAT_CARDS: { key: StatKey; label: string; tone: string }[] = [
  { key: 'urgent',  label: 'Cảnh báo Khẩn Cấp', tone: 'stat--urgent'  },
  { key: 'review',  label: 'Cần Chỉnh',          tone: 'stat--review'  },
  { key: 'monitor', label: 'Theo Dõi',           tone: 'stat--monitor' },
  { key: 'total',   label: 'Tổng Cộng',          tone: 'stat--total'   },
]

export default function AlertsTab() {
  const [alerts, setAlerts] = useState<AlertSummary[]>([])
  const [pending, setPending] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatKey | null>(null)

  async function loadAlerts(silent = false) {
    if (!silent) setLoading(true)
    try {
      const [list, jobs] = await Promise.all([
        api.alerts.list(),
        api.alerts.pending().catch(() => ({ pending: 0 })),
      ])
      setAlerts(list)
      setPending(jobs.pending)
    } catch {
      if (!silent) setAlerts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAlerts() }, [])

  const counts = useMemo(() => {
    const c: Record<StatKey, number> = { urgent: 0, review: 0, monitor: 0, total: alerts.length }
    for (const a of alerts) c[a.severity]++
    return c
  }, [alerts])

  const visible = useMemo(
    () => (filter && filter !== 'total' ? alerts.filter(a => a.severity === filter) : alerts),
    [alerts, filter],
  )

  return (
    <div className="alerts-tab">

      {/* ── Toolbar ── */}
      <div className="alert-tab-toolbar">
        <p className="alert-tab-hint">
          Cảnh báo được tự động sinh khi tài liệu xử lý xong (Qdrant + Neo4j).
        </p>
        <button className="btn btn-outline btn-sm" onClick={() => loadAlerts()} disabled={loading}>
          <RefreshIcon size={14} /> Làm mới
        </button>
      </div>

      {pending > 0 && (
        <div className="alert-notice">
          ⏳ {pending} tài liệu đang chờ sinh cảnh báo (hết quota Gemini) — hệ thống sẽ tự thử lại.
        </div>
      )}

      {/* ── Stat cards ── */}
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

      {/* ── Alert list ── */}
      <div className="alert-list-card">
        <div className="alert-list-head">
          <h2 className="alert-list-title">
            <AlertTriangleIcon size={20} />
            Danh Sách Cảnh Báo Tuân Thủ Quy Định
          </h2>
          {filter && (
            <button className="btn btn-outline btn-sm" onClick={() => setFilter(null)}>
              Bỏ lọc
            </button>
          )}
        </div>

        {loading ? (
          <div className="alert-list-empty"><LoaderIcon size={28} /><p>Đang tải...</p></div>
        ) : visible.length === 0 ? (
          <div className="alert-list-empty">
            <AlertTriangleIcon size={32} />
            <p>Chưa có cảnh báo nào. Tải lên một tài liệu — cảnh báo sẽ tự động xuất hiện sau khi xử lý xong.</p>
          </div>
        ) : (
          <div className="alert-list">
            {visible.map(a => {
              const meta = SEVERITY_META[a.severity]
              return (
                <Link key={a.id} to={`/alerts/${a.id}`} className={`alert-row alert-row--${a.severity}`}>
                  <span className={`alert-dot ${meta.dot}`} />
                  <div className="alert-row-main">
                    <span className="alert-row-title">{a.code}: {a.title}</span>
                    <span className="alert-row-sub">{a.summary}</span>
                  </div>
                  {a.deadline && (
                    <span className="alert-row-deadline">
                      <ClockIcon size={14} />
                      {a.deadline}
                    </span>
                  )}
                  <span className={`alert-chip ${meta.chip}`}>{meta.label}</span>
                  <span className="alert-row-view"><EyeIcon size={16} /></span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
