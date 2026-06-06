import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { exportAnalysisDocx } from '../lib/exportAnalysisDocx'
import {
  SEVERITY_META,
  type AnalysisDetail as AnalysisDetailType,
  type DetailRow,
  type RiskScore,
  type AnalysisUpdate,
} from '../lib/analyses'
import {
  ArrowLeftIcon, AlertTriangleIcon, CheckCircleIcon, XCircleIcon,
  ClockIcon, ActivityIcon, FileTextIcon, LoaderIcon,
  DownloadIcon, EditIcon, SaveIcon,
} from '../components/Icons'

const STATUS_LABEL: Record<DetailRow['status'], { text: string; cls: string } | null> = {
  violation: { text: 'VI PHẠM',  cls: 'tag--violation' },
  compliant: { text: 'TUÂN THỰ', cls: 'tag--compliant' },
  risk:      { text: 'Rủi ro',   cls: 'tag--risk' },
  missing:   { text: 'Chưa có',  cls: 'tag--missing' },
  neutral:   null,
}

const PUBLISH_STATUS: Record<string, { text: string; cls: string }> = {
  pending:   { text: 'Chưa xử lý', cls: 'status-badge--pending'   },
  processed: { text: 'Đã xử lý',   cls: 'status-badge--processed' },
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

// Editable text field
function EditField({
  value, editing, onChange, multiline = false,
}: {
  value: string; editing: boolean; onChange: (v: string) => void; multiline?: boolean
}) {
  if (!editing) return <span>{value}</span>
  if (multiline) {
    return (
      <textarea
        className="edit-field edit-field--area"
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
      />
    )
  }
  return (
    <input
      className="edit-field"
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  )
}

export default function AnalysisDetail() {
  const { id } = useParams<{ id: string }>()
  const [analysis, setAnalysis] = useState<AnalysisDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit state
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<AnalysisDetailType>>({})
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api.analyses.get(Number(id))
      .then(data => { setAnalysis(data); setDraft(data) })
      .catch(e => setError(e instanceof Error ? e.message : 'Không tải được phân tích.'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="analysis-detail-page">
        <div className="container">
          <div className="analysis-empty"><LoaderIcon size={40} /><p>Đang tải...</p></div>
        </div>
      </div>
    )
  }

  if (error || !analysis) {
    return (
      <div className="analysis-detail-page">
        <div className="container">
          <div className="analysis-empty">
            <AlertTriangleIcon size={40} />
            <p>{error ?? `Không tìm thấy phân tích "${id}".`}</p>
            <Link to="/analyses" className="btn btn-primary btn-sm">← Về danh sách</Link>
          </div>
        </div>
      </div>
    )
  }

  const meta = SEVERITY_META[analysis.severity]
  const statusInfo = PUBLISH_STATUS[analysis.status] ?? PUBLISH_STATUS['pending']
  const current = editing ? { ...analysis, ...draft } : analysis

  function field<K extends keyof AnalysisDetailType>(key: K): AnalysisDetailType[K] {
    return (draft[key] ?? analysis![key]) as AnalysisDetailType[K]
  }

  function setField<K extends keyof AnalysisDetailType>(key: K, val: AnalysisDetailType[K]) {
    setDraft(prev => ({ ...prev, [key]: val }))
  }

  function startEdit() {
    setDraft({ ...analysis })
    setEditing(true)
    setSaveMsg(null)
  }

  function cancelEdit() {
    setDraft({ ...analysis })
    setEditing(false)
    setSaveMsg(null)
  }

  async function saveEdit() {
    if (!analysis) return
    setSaving(true)
    try {
      const payload: AnalysisUpdate = {
        title:             draft.title,
        summary:           draft.summary,
        conflict_headline: draft.conflict_headline,
        deadline:          draft.deadline,
        conflict_note:     draft.conflict_note,
        risk_conclusion:   draft.risk_conclusion,
        overall_risk:      draft.overall_risk,
        compare_left:      draft.compare_left,
        compare_right:     draft.compare_right,
        business_impacts:  draft.business_impacts,
        risk_scores:       draft.risk_scores,
        detail_tables:     draft.detail_tables,
      }
      const updated = await api.analyses.patch(analysis.id, payload)
      setAnalysis(updated)
      setDraft(updated)
      setEditing(false)
      setSaveMsg('Đã lưu thay đổi.')
      setTimeout(() => setSaveMsg(null), 3000)
    } catch (e) {
      setSaveMsg('Lưu thất bại: ' + (e instanceof Error ? e.message : 'Lỗi không xác định'))
    } finally {
      setSaving(false)
    }
  }

  async function publishAnalysis() {
    if (!analysis || analysis.status === 'processed') return
    setPublishing(true)
    try {
      const updated = await api.analyses.publish(analysis.id)
      setAnalysis(updated)
      setDraft(updated)
      setSaveMsg('Đã gửi JSON — phân tích đánh dấu là Đã xử lý.')
      setTimeout(() => setSaveMsg(null), 4000)
    } catch (e) {
      setSaveMsg('Gửi thất bại: ' + (e instanceof Error ? e.message : 'Lỗi không xác định'))
    } finally {
      setPublishing(false)
    }
  }

  function downloadJson() {
    if (!analysis) return
    const blob = new Blob([JSON.stringify(analysis, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${analysis.code}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="analysis-detail-page">
      <div className="container">

        <Link to="/analyses" className="analysis-back"><ArrowLeftIcon size={16} /> Về danh sách phân tích</Link>

        {/* Hero + edit toggle */}
        <div className="analysis-hero">
          <div className="analysis-hero-icon"><AlertTriangleIcon size={28} /></div>
          <div className="analysis-hero-text" style={{ flex: 1 }}>
            <h1 className="analysis-hero-title">
              {analysis.code}:{' '}
              <EditField
                value={String(field('title'))}
                editing={editing}
                onChange={v => setField('title', v)}
              />
            </h1>
            <p className="analysis-hero-sub">
              <EditField
                value={String(field('conflict_headline'))}
                editing={editing}
                onChange={v => setField('conflict_headline', v)}
              />
            </p>
          </div>
          <div className="analysis-hero-actions">
            {!editing ? (
              <button className="btn btn-outline btn-sm" onClick={startEdit}>
                <EditIcon size={14} /> Chỉnh sửa
              </button>
            ) : (
              <>
                <button className="btn btn-outline btn-sm" onClick={cancelEdit} disabled={saving}>
                  Huỷ
                </button>
                <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>
                  {saving
                    ? <><LoaderIcon size={14} className="icon-spin" /> Đang lưu...</>
                    : <><SaveIcon size={14} /> Lưu</>
                  }
                </button>
              </>
            )}
          </div>
        </div>

        {saveMsg && (
          <div className={`save-msg ${saveMsg.startsWith('Lưu thất bại') || saveMsg.startsWith('Gửi thất bại') ? 'save-msg--error' : 'save-msg--ok'}`}>
            {saveMsg}
          </div>
        )}

        <div className="analysis-meta-bar">
          <span className={`analysis-chip ${meta.chip}`}>{meta.label}</span>
          <span className={`status-badge ${statusInfo.cls}`}>{statusInfo.text}</span>
          {analysis.deadline && (
            <span className="analysis-meta-pill">
              <ClockIcon size={14} />
              Hạn cuối:{' '}
              <EditField
                value={String(field('deadline') ?? '')}
                editing={editing}
                onChange={v => setField('deadline', v || null as unknown as string)}
              />
            </span>
          )}
          <span className="analysis-meta-pill"><ActivityIcon size={14} /> Mức độ: {analysis.overall_risk.label}</span>
        </div>

        {/* ── 1. Phân tích xung đột ── */}
        <section className="panel">
          <h3 className="panel-title"><FileTextIcon size={18} /> 1. Phân Tích Xung Đột</h3>
          <div className="compare-grid">
            <div className={`compare-card compare-card--${current.compare_left.tone}`}>
              <span className="compare-source">{current.compare_left.source}</span>
              <span className="compare-verdict">
                {current.compare_left.tone === 'danger' ? <XCircleIcon size={18} /> : <CheckCircleIcon size={18} />}
                <EditField
                  value={current.compare_left.verdict}
                  editing={editing}
                  onChange={v => setField('compare_left', { ...current.compare_left, verdict: v })}
                />
              </span>
              <p className="compare-quote">
                "
                <EditField
                  value={current.compare_left.quote}
                  editing={editing}
                  multiline
                  onChange={v => setField('compare_left', { ...current.compare_left, quote: v })}
                />
                "
              </p>
            </div>
            <div className={`compare-card compare-card--${current.compare_right.tone}`}>
              <span className="compare-source">{current.compare_right.source}</span>
              <span className="compare-verdict">
                {current.compare_right.tone === 'danger' ? <XCircleIcon size={18} /> : <CheckCircleIcon size={18} />}
                <EditField
                  value={current.compare_right.verdict}
                  editing={editing}
                  onChange={v => setField('compare_right', { ...current.compare_right, verdict: v })}
                />
              </span>
              <p className="compare-quote">
                "
                <EditField
                  value={current.compare_right.quote}
                  editing={editing}
                  multiline
                  onChange={v => setField('compare_right', { ...current.compare_right, quote: v })}
                />
                "
              </p>
            </div>
            <div className="compare-card compare-card--conflict">
              <span className="compare-verdict compare-verdict--warn">
                <AlertTriangleIcon size={18} /> XUNG ĐỘT
              </span>
              <p className="compare-note">
                <EditField
                  value={String(field('conflict_note'))}
                  editing={editing}
                  multiline
                  onChange={v => setField('conflict_note', v)}
                />
              </p>
            </div>
          </div>
        </section>

        {/* ── 2. Tóm tắt ── */}
        <section className="panel">
          <h3 className="panel-title"><FileTextIcon size={18} /> 2. Tóm Tắt</h3>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.7 }}>
            <EditField
              value={String(field('summary'))}
              editing={editing}
              multiline
              onChange={v => setField('summary', v)}
            />
          </p>
        </section>

        {/* ── 3. Tác động nghiệp vụ ── */}
        <section className="panel">
          <h3 className="panel-title"><ActivityIcon size={18} /> 3. Tác Động Nghiệp Vụ</h3>
          <div className="impact-grid">
            {current.business_impacts.map((imp, i) => (
              <div key={i} className={`impact-card impact-card--${imp.risk}`}>
                <span className="impact-area">{imp.area}</span>
                <p className="impact-detail">
                  <EditField
                    value={imp.detail}
                    editing={editing}
                    multiline
                    onChange={v => {
                      const updated = [...current.business_impacts]
                      updated[i] = { ...imp, detail: v }
                      setField('business_impacts', updated)
                    }}
                  />
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 4. Chỉ số rủi ro ── */}
        <section className="panel">
          <h3 className="panel-title"><ActivityIcon size={18} /> 4. Chỉ Số Rủi Ro</h3>
          <div className="gauge-grid">
            {current.risk_scores.map((s, i) => <RiskGauge key={i} score={s} />)}
          </div>
          <div className="risk-conclusion">
            <span className="risk-conclusion-head">
              <AlertTriangleIcon size={16} />
              TỔNG RỦI RO: {current.overall_risk.label} ({current.overall_risk.value}%)
            </span>
            <p>
              <EditField
                value={String(field('risk_conclusion'))}
                editing={editing}
                multiline
                onChange={v => setField('risk_conclusion', v)}
              />
            </p>
          </div>
        </section>

        {/* ── 5. Phân tích chi tiết ── */}
        <section className="panel">
          <h3 className="panel-title"><FileTextIcon size={18} /> 5. Phân Tích Chi Tiết</h3>
          <div className="detail-tables">
            {current.detail_tables.map((tbl, ti) => (
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

        {/* Actions */}
        <div className="analysis-actions">
          <button className="btn btn-outline" onClick={downloadJson}>
            <DownloadIcon size={16} /> Tải JSON
          </button>
          <button className="btn btn-outline" onClick={() => exportAnalysisDocx(analysis)}>
            <DownloadIcon size={16} /> Tải Báo Cáo (.docx)
          </button>
          <button
            className="btn btn-primary"
            onClick={publishAnalysis}
            disabled={publishing || analysis.status === 'processed'}
          >
            {publishing
              ? <><LoaderIcon size={14} className="icon-spin" /> Đang gửi...</>
              : analysis.status === 'processed'
                ? '✓ Đã gửi JSON'
                : 'Gửi JSON'
            }
          </button>
        </div>

      </div>
    </div>
  )
}
