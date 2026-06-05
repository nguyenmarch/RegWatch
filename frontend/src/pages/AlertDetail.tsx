import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { SEVERITY_META, type AlertDetail as AlertDetailType, type DetailRow, type RiskScore } from '../lib/alerts'
import {
  ArrowLeftIcon, AlertTriangleIcon, CheckCircleIcon, XCircleIcon,
  ClockIcon, ActivityIcon, FileTextIcon, LoaderIcon,
  DownloadIcon, PrinterIcon,
} from '../components/Icons'

const STATUS_LABEL: Record<DetailRow['status'], { text: string; cls: string } | null> = {
  violation: { text: 'VI PHẠM',  cls: 'tag--violation' },
  compliant: { text: 'TUÂN THỦ', cls: 'tag--compliant' },
  risk:      { text: 'Rủi ro',   cls: 'tag--risk' },
  missing:   { text: 'Chưa có',  cls: 'tag--missing' },
  neutral:   null,
}

function gaugeColor(value: number): string {
  if (value >= 75) return 'var(--rose)'
  if (value >= 55) return '#f97316'
  if (value >= 40) return 'var(--amber)'
  return 'var(--emerald)'
}

function RiskGauge({ score }: { score: RiskScore }) {
  const r = 44
  const circ = Math.PI * r
  const dash = (score.value / 100) * circ
  const color = gaugeColor(score.value)
  return (
    <div className="gauge">
      <svg viewBox="0 0 100 56" className="gauge-svg">
        <path d="M 6 50 A 44 44 0 0 1 94 50" fill="none" stroke="var(--border)" strokeWidth="8" strokeLinecap="round" />
        <path
          d="M 6 50 A 44 44 0 0 1 94 50"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
        />
      </svg>
      <div className="gauge-readout">
        <span className="gauge-value" style={{ color }}>{score.value}%</span>
        <span className="gauge-level" style={{ color }}>{score.level}</span>
      </div>
      <span className="gauge-label">{score.label}</span>
    </div>
  )
}

export default function AlertDetail() {
  const { id } = useParams<{ id: string }>()
  const [alert, setAlert] = useState<AlertDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api.alerts.get(Number(id))
      .then(setAlert)
      .catch(e => setError(e instanceof Error ? e.message : 'Không tải được cảnh báo.'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="alert-detail-page">
        <div className="container">
          <div className="alert-empty"><LoaderIcon size={40} /><p>Đang tải...</p></div>
        </div>
      </div>
    )
  }

  if (error || !alert) {
    return (
      <div className="alert-detail-page">
        <div className="container">
          <div className="alert-empty">
            <AlertTriangleIcon size={40} />
            <p>{error ?? `Không tìm thấy cảnh báo "${id}".`}</p>
            <Link to="/documents" className="btn btn-primary btn-sm">← Về danh sách</Link>
          </div>
        </div>
      </div>
    )
  }

  const meta = SEVERITY_META[alert.severity]

  function downloadJson() {
    if (!alert) return
    const blob = new Blob([JSON.stringify(alert, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${alert.code}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="alert-detail-page">
      <div className="container">

        <Link to="/documents" className="alert-back"><ArrowLeftIcon size={16} /> Về danh sách cảnh báo</Link>

        <div className="alert-hero">
          <div className="alert-hero-icon"><AlertTriangleIcon size={28} /></div>
          <div className="alert-hero-text">
            <h1 className="alert-hero-title">{alert.code}: {alert.title.toUpperCase()}</h1>
            <p className="alert-hero-sub">{alert.conflict_headline}</p>
          </div>
        </div>

        <div className="alert-meta-bar">
          <span className={`alert-chip ${meta.chip}`}>{meta.label}</span>
          {alert.deadline && <span className="alert-meta-pill"><ClockIcon size={14} /> Hạn cuối: {alert.deadline}</span>}
          <span className="alert-meta-pill"><ActivityIcon size={14} /> Mức độ: {alert.overall_risk.label}</span>
        </div>

        {/* ── 1. Phân tích xung đột ── */}
        <section className="panel">
          <h3 className="panel-title"><FileTextIcon size={18} /> 1. Phân Tích Xung Đột</h3>
          <div className="compare-grid">
            <div className={`compare-card compare-card--${alert.compare_left.tone}`}>
              <span className="compare-source">{alert.compare_left.source}</span>
              <span className="compare-verdict">
                {alert.compare_left.tone === 'danger' ? <XCircleIcon size={18} /> : <CheckCircleIcon size={18} />}
                {alert.compare_left.verdict}
              </span>
              <p className="compare-quote">"{alert.compare_left.quote}"</p>
            </div>
            <div className={`compare-card compare-card--${alert.compare_right.tone}`}>
              <span className="compare-source">{alert.compare_right.source}</span>
              <span className="compare-verdict">
                {alert.compare_right.tone === 'danger' ? <XCircleIcon size={18} /> : <CheckCircleIcon size={18} />}
                {alert.compare_right.verdict}
              </span>
              <p className="compare-quote">"{alert.compare_right.quote}"</p>
            </div>
            <div className="compare-card compare-card--conflict">
              <span className="compare-verdict compare-verdict--warn">
                <AlertTriangleIcon size={18} /> XUNG ĐỘT
              </span>
              <p className="compare-note">{alert.conflict_note}</p>
            </div>
          </div>
        </section>

        {/* ── 2. Tác động nghiệp vụ ── */}
        <section className="panel">
          <h3 className="panel-title"><ActivityIcon size={18} /> 2. Tác Động Nghiệp Vụ</h3>
          <div className="impact-grid">
            {alert.business_impacts.map((imp, i) => (
              <div key={i} className={`impact-card impact-card--${imp.risk}`}>
                <span className="impact-area">{imp.area}</span>
                <p className="impact-detail">{imp.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 3. Chỉ số rủi ro ── */}
        <section className="panel">
          <h3 className="panel-title"><ActivityIcon size={18} /> 3. Chỉ Số Rủi Ro</h3>
          <div className="gauge-grid">
            {alert.risk_scores.map((s, i) => <RiskGauge key={i} score={s} />)}
          </div>
          <div className="risk-conclusion">
            <span className="risk-conclusion-head">
              <AlertTriangleIcon size={16} />
              TỔNG RỦI RO: {alert.overall_risk.label} ({alert.overall_risk.value}%)
            </span>
            <p>{alert.risk_conclusion}</p>
          </div>
        </section>

        {/* ── 4. Phân tích chi tiết ── */}
        <section className="panel">
          <h3 className="panel-title"><FileTextIcon size={18} /> 4. Phân Tích Chi Tiết</h3>
          <div className="detail-tables">
            {alert.detail_tables.map((tbl, ti) => (
              <div key={ti} className="detail-table-wrap">
                <h4 className="detail-table-title">{tbl.title}</h4>
                <table className="detail-table">
                  <thead>
                    <tr>{tbl.headers.map((h, hi) => <th key={hi}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {tbl.rows.map((row, ri) => {
                      const tag = STATUS_LABEL[row.status]
                      return (
                        <tr key={ri}>
                          <td className="detail-cell-strong">{row.col1}</td>
                          <td>{row.col2}</td>
                          <td>{row.col3}</td>
                          <td>{tag && <span className={`tag ${tag.cls}`}>{tag.text}</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>

        <div className="alert-actions">
          <button className="btn btn-outline" onClick={downloadJson}>
            <DownloadIcon size={16} /> Tải JSON
          </button>
          <button className="btn btn-primary" onClick={() => window.print()}>
            <PrinterIcon size={16} /> In Báo Cáo (PDF)
          </button>
        </div>

      </div>
    </div>
  )
}
