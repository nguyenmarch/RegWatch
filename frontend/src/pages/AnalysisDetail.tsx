import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { exportAnalysisDocx } from '../lib/exportAnalysisDocx'
import { parseBackendDate } from '../lib/datetime'
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
  DownloadIcon, EditIcon, SaveIcon, XIcon,
} from '../components/Icons'

const STATUS_LABEL: Record<DetailRow['status'], { text: string; cls: string } | null> = {
  violation: { text: 'VI PHẠM',   cls: 'tag--violation' },
  compliant: { text: 'TUÂN THỦ',  cls: 'tag--compliant' },
  risk:      { text: 'Rủi ro',    cls: 'tag--risk'      },
  missing:   { text: 'Chưa có',   cls: 'tag--missing'   },
  neutral:   null,
}

const PUBLISH_STATUS: Record<string, { text: string; cls: string }> = {
  pending:   { text: 'Chưa xử lý', cls: 'status-badge--pending'   },
  processed: { text: 'Đã xử lý',   cls: 'status-badge--processed' },
}

const SEVERITY_COLORS: Record<string, { from: string; to: string; accent: string }> = {
  urgent:  { from: 'rgba(244,63,94,0.18)',  to: 'rgba(244,63,94,0.04)',  accent: 'var(--rose)'    },
  review:  { from: 'rgba(245,158,11,0.18)', to: 'rgba(245,158,11,0.04)', accent: 'var(--amber)'   },
  monitor: { from: 'rgba(16,185,129,0.18)', to: 'rgba(16,185,129,0.04)', accent: 'var(--emerald)' },
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
    <div className="gauge gauge--v2">
      <svg viewBox="0 0 100 56" className="gauge-svg">
        <path d="M 6 50 A 44 44 0 0 1 94 50" fill="none" stroke="var(--border)" strokeWidth="8" strokeLinecap="round" />
        <path
          d="M 6 50 A 44 44 0 0 1 94 50"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          className="gauge-arc"
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
    <input className="edit-field" type="text" value={value}
      onChange={e => onChange(e.target.value)} />
  )
}

export default function AnalysisDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const [analysis, setAnalysis] = useState<AnalysisDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<AnalysisDetailType>>({})
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

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
      <div className="adetail-page">
        <div className="container">
          <div className="analyses-empty" style={{ paddingTop: '6rem' }}>
            <LoaderIcon size={40} /><p>Đang tải phân tích...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !analysis) {
    return (
      <div className="adetail-page">
        <div className="container">
          <div className="analyses-empty" style={{ paddingTop: '6rem' }}>
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
  const sevColor = SEVERITY_COLORS[analysis.severity]
  const current = editing ? { ...analysis, ...draft } : analysis

  function field<K extends keyof AnalysisDetailType>(key: K): AnalysisDetailType[K] {
    return (draft[key] ?? analysis![key]) as AnalysisDetailType[K]
  }
  function setField<K extends keyof AnalysisDetailType>(key: K, val: AnalysisDetailType[K]) {
    setDraft(prev => ({ ...prev, [key]: val }))
  }

  function startEdit() { setDraft({ ...analysis }); setEditing(true); setSaveMsg(null) }
  function cancelEdit() { setDraft({ ...analysis }); setEditing(false); setSaveMsg(null) }

  async function saveEdit() {
    if (!analysis) return
    setSaving(true)
    try {
      const payload: AnalysisUpdate = {
        title: draft.title, summary: draft.summary,
        conflict_headline: draft.conflict_headline, deadline: draft.deadline,
        conflict_note: draft.conflict_note, risk_conclusion: draft.risk_conclusion,
        overall_risk: draft.overall_risk, compare_left: draft.compare_left,
        compare_right: draft.compare_right, business_impacts: draft.business_impacts,
        risk_scores: draft.risk_scores, detail_tables: draft.detail_tables,
      }
      const updated = await api.analyses.patch(analysis.id, payload)
      setAnalysis(updated); setDraft(updated); setEditing(false)
      setSaveMsg({ ok: true, text: 'Đã lưu thay đổi.' })
      setTimeout(() => setSaveMsg(null), 3000)
    } catch (e) {
      setSaveMsg({ ok: false, text: 'Lưu thất bại: ' + (e instanceof Error ? e.message : 'Lỗi') })
    } finally {
      setSaving(false)
    }
  }

  async function publishAnalysis() {
    if (!analysis || analysis.status === 'processed') return
    setPublishing(true)
    try {
      const updated = await api.analyses.publish(analysis.id)
      setAnalysis(updated); setDraft(updated)
      setSaveMsg({ ok: true, text: 'Phân tích đã được đánh dấu là Đã xử lý.' })
      setTimeout(() => setSaveMsg(null), 4000)
    } catch (e) {
      setSaveMsg({ ok: false, text: 'Gửi thất bại: ' + (e instanceof Error ? e.message : 'Lỗi') })
    } finally {
      setPublishing(false)
    }
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(analysis, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${analysis!.code}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  const generatedDate = analysis.generated_at
    ? new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
      }).format(parseBackendDate(analysis.generated_at))
    : null

  return (
    <div className="adetail-page">

      {/* ── Sticky top nav ── */}
      <div className="adetail-topbar">
        <div className="adetail-topbar-inner container">
          <Link to="/analyses" className="adetail-back">
            <ArrowLeftIcon size={15} />
            <span>Phân Tích</span>
          </Link>
          <div className="adetail-topbar-center">
            <span className="adetail-topbar-code">{analysis.code}</span>
            <span className={`analysis-chip ${meta.chip}`}>{t(meta.labelKey)}</span>
            <span className={`status-badge ${statusInfo.cls}`}>{statusInfo.text}</span>
          </div>
          <div className="adetail-topbar-actions">
            {!editing ? (
              <button className="btn btn-outline btn-sm" onClick={startEdit}>
                <EditIcon size={13} /> Chỉnh sửa
              </button>
            ) : (
              <>
                <button className="btn btn-outline btn-sm" onClick={cancelEdit} disabled={saving}>
                  <XIcon size={13} /> Huỷ
                </button>
                <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>
                  {saving
                    ? <><LoaderIcon size={13} className="icon-spin" /> Đang lưu...</>
                    : <><SaveIcon size={13} /> Lưu</>
                  }
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="container adetail-body">

        {/* ── Hero banner ── */}
        <div
          className={`adetail-hero adetail-hero--${analysis.severity}`}
          style={{
            background: `linear-gradient(135deg, ${sevColor.from} 0%, ${sevColor.to} 100%)`,
            borderLeftColor: sevColor.accent,
          }}
        >
          <div className="adetail-hero-left">
            <div className="adetail-hero-code-row">
              <span className="adetail-hero-code">{analysis.code}</span>
              {analysis.deadline && (
                <span className="adetail-hero-deadline">
                  <ClockIcon size={13} /> Hạn: {analysis.deadline}
                </span>
              )}
            </div>
            <h1 className="adetail-hero-title">
              <EditField
                value={String(field('title'))}
                editing={editing}
                onChange={v => setField('title', v)}
              />
            </h1>
            <p className="adetail-hero-headline">
              <EditField
                value={String(field('conflict_headline'))}
                editing={editing}
                onChange={v => setField('conflict_headline', v)}
              />
            </p>
          </div>
          <div className="adetail-hero-right">
            <div className="adetail-risk-circle" style={{ borderColor: sevColor.accent }}>
              <span className="adetail-risk-pct" style={{ color: sevColor.accent }}>
                {analysis.overall_risk.value}%
              </span>
              <span className="adetail-risk-lbl">{analysis.overall_risk.label}</span>
            </div>
          </div>
        </div>

        {/* ── Save / error message ── */}
        {saveMsg && (
          <div className={`save-msg ${saveMsg.ok ? 'save-msg--ok' : 'save-msg--error'}`}>
            {saveMsg.text}
          </div>
        )}

        {/* ── Meta pills ── */}
        <div className="adetail-meta-bar">
          <span className={`analysis-chip ${meta.chip}`}>{t(meta.labelKey)}</span>
          <span className={`status-badge ${statusInfo.cls}`}>{statusInfo.text}</span>
          <span className="adetail-meta-pill"><ActivityIcon size={13} /> {analysis.overall_risk.label}</span>
          {generatedDate && (
            <span className="adetail-meta-pill"><ClockIcon size={13} /> Sinh: {generatedDate}</span>
          )}
        </div>

        {/* ── Section 1: Phân tích xung đột ── */}
        <section className="adetail-section adetail-anim" style={{ '--section-delay': '0ms' } as React.CSSProperties}>
          <div className="adetail-section-header">
            <span className="adetail-section-num">01</span>
            <h3 className="adetail-section-title"><FileTextIcon size={17} /> Phân Tích Xung Đột</h3>
          </div>
          <div className="compare-grid-v2">
            <div className={`compare-card-v2 compare-card-v2--${current.compare_left.tone}`}>
              <div className="compare-card-v2-top">
                <span className="compare-source">{current.compare_left.source}</span>
                <span className="compare-verdict">
                  {current.compare_left.tone === 'danger'
                    ? <XCircleIcon size={16} />
                    : <CheckCircleIcon size={16} />}
                  <EditField value={current.compare_left.verdict} editing={editing}
                    onChange={v => setField('compare_left', { ...current.compare_left, verdict: v })} />
                </span>
              </div>
              <p className="compare-quote">
                "<EditField value={current.compare_left.quote} editing={editing} multiline
                  onChange={v => setField('compare_left', { ...current.compare_left, quote: v })} />"
              </p>
            </div>

            <div className="compare-vs-divider"><span>VS</span></div>

            <div className={`compare-card-v2 compare-card-v2--${current.compare_right.tone}`}>
              <div className="compare-card-v2-top">
                <span className="compare-source">{current.compare_right.source}</span>
                <span className="compare-verdict">
                  {current.compare_right.tone === 'danger'
                    ? <XCircleIcon size={16} />
                    : <CheckCircleIcon size={16} />}
                  <EditField value={current.compare_right.verdict} editing={editing}
                    onChange={v => setField('compare_right', { ...current.compare_right, verdict: v })} />
                </span>
              </div>
              <p className="compare-quote">
                "<EditField value={current.compare_right.quote} editing={editing} multiline
                  onChange={v => setField('compare_right', { ...current.compare_right, quote: v })} />"
              </p>
            </div>

            <div className="compare-conflict-banner">
              <span className="compare-conflict-label">
                <AlertTriangleIcon size={16} /> XUNG ĐỘT
              </span>
              <p>
                <EditField value={String(field('conflict_note'))} editing={editing} multiline
                  onChange={v => setField('conflict_note', v)} />
              </p>
            </div>
          </div>
        </section>

        {/* ── Section 2: Tóm tắt ── */}
        <section className="adetail-section adetail-anim" style={{ '--section-delay': '60ms' } as React.CSSProperties}>
          <div className="adetail-section-header">
            <span className="adetail-section-num">02</span>
            <h3 className="adetail-section-title"><FileTextIcon size={17} /> Tóm Tắt</h3>
          </div>
          <p className="adetail-summary-text">
            <EditField value={String(field('summary'))} editing={editing} multiline
              onChange={v => setField('summary', v)} />
          </p>
        </section>

        {/* ── Section 3: Tác động nghiệp vụ ── */}
        <section className="adetail-section adetail-anim" style={{ '--section-delay': '120ms' } as React.CSSProperties}>
          <div className="adetail-section-header">
            <span className="adetail-section-num">03</span>
            <h3 className="adetail-section-title"><ActivityIcon size={17} /> Tác Động Nghiệp Vụ</h3>
          </div>
          <div className="impact-grid">
            {current.business_impacts.map((imp, i) => (
              <div key={i} className={`impact-card-v2 impact-card-v2--${imp.risk}`}>
                <div className="impact-card-v2-icon">
                  {imp.risk === 'urgent' ? <AlertTriangleIcon size={16} />
                    : imp.risk === 'review' ? <ClockIcon size={16} />
                    : <CheckCircleIcon size={16} />}
                </div>
                <span className="impact-area">{imp.area}</span>
                <p className="impact-detail">
                  <EditField value={imp.detail} editing={editing} multiline
                    onChange={v => {
                      const updated = [...current.business_impacts]
                      updated[i] = { ...imp, detail: v }
                      setField('business_impacts', updated)
                    }} />
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Section 4: Chỉ số rủi ro ── */}
        <section className="adetail-section adetail-anim" style={{ '--section-delay': '180ms' } as React.CSSProperties}>
          <div className="adetail-section-header">
            <span className="adetail-section-num">04</span>
            <h3 className="adetail-section-title"><ActivityIcon size={17} /> Chỉ Số Rủi Ro</h3>
          </div>
          <div className="gauge-grid">
            {current.risk_scores.map((s, i) => <RiskGauge key={i} score={s} />)}
          </div>
          <div className="risk-conclusion-v2">
            <div className="risk-conclusion-head">
              <AlertTriangleIcon size={15} />
              TỔNG RỦI RO: {current.overall_risk.label} ({current.overall_risk.value}%)
            </div>
            <p>
              <EditField value={String(field('risk_conclusion'))} editing={editing} multiline
                onChange={v => setField('risk_conclusion', v)} />
            </p>
          </div>
        </section>

        {/* ── Section 5: Phân tích chi tiết ── */}
        <section className="adetail-section adetail-anim" style={{ '--section-delay': '240ms' } as React.CSSProperties}>
          <div className="adetail-section-header">
            <span className="adetail-section-num">05</span>
            <h3 className="adetail-section-title"><FileTextIcon size={17} /> Phân Tích Chi Tiết</h3>
          </div>
          <div className="detail-tables">
            {current.detail_tables.map((tbl, ti) => (
              <div key={ti} className="detail-table-wrap">
                <h4 className="detail-table-title">{tbl.title}</h4>
                <div className="detail-table-scroll">
                  <table className="detail-table">
                    <thead>
                      <tr>{tbl.headers.map((h, hi) => <th key={hi}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {tbl.rows.map((row, ri) => {
                        const tag = STATUS_LABEL[row.status]
                        return (
                          <tr key={ri} className={`dtrow dtrow--${row.status}`}>
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
              </div>
            ))}
          </div>
        </section>

        {/* ── Action bar ── */}
        <div className="adetail-actions">
          <div className="adetail-actions-left">
            <button className="btn btn-outline" onClick={downloadJson}>
              <DownloadIcon size={15} /> JSON
            </button>
            <button className="btn btn-outline" onClick={() => exportAnalysisDocx(analysis)}>
              <DownloadIcon size={15} /> Báo cáo .docx
            </button>
          </div>
          <div className="adetail-actions-right">
            <button
              className={`btn adetail-publish-btn ${analysis.status === 'processed' ? 'adetail-publish-btn--done' : 'btn-primary'}`}
              onClick={publishAnalysis}
              disabled={publishing || analysis.status === 'processed'}
            >
              {publishing
                ? <><LoaderIcon size={14} className="icon-spin" /> Đang gửi...</>
                : analysis.status === 'processed'
                  ? <><CheckCircleIcon size={14} /> Đã xử lý</>
                  : 'Gửi & Đánh dấu đã xử lý'
              }
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
