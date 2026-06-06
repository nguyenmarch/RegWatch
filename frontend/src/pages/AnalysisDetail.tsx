import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { exportAnalysisDocx } from '../lib/exportAnalysisDocx'
import { parseBackendDate } from '../lib/datetime'
import {
  SEVERITY_META,
  type AnalysisDetail as AnalysisDetailType,
  type AnalysisUpdate,
  type DetailRow,
  type RiskScore,
} from '../lib/analyses'
import {
  ActivityIcon,
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  EditIcon,
  FileTextIcon,
  LoaderIcon,
  SaveIcon,
  XCircleIcon,
  XIcon,
} from '../components/Icons'

const ROW_STATUS_META: Record<DetailRow['status'], { labelKey: string; cls: string } | null> = {
  violation: { labelKey: 'analyses.detail.rowStatus.violation', cls: 'tag--violation' },
  compliant: { labelKey: 'analyses.detail.rowStatus.compliant', cls: 'tag--compliant' },
  risk: { labelKey: 'analyses.detail.rowStatus.risk', cls: 'tag--risk' },
  missing: { labelKey: 'analyses.detail.rowStatus.missing', cls: 'tag--missing' },
  neutral: null,
}

const SEVERITY_COLORS = {
  urgent: { from: 'rgba(244,63,94,0.18)', to: 'rgba(244,63,94,0.04)', accent: 'var(--rose)' },
  review: { from: 'rgba(245,158,11,0.18)', to: 'rgba(245,158,11,0.04)', accent: 'var(--amber)' },
  monitor: { from: 'rgba(16,185,129,0.18)', to: 'rgba(16,185,129,0.04)', accent: 'var(--emerald)' },
}

function gaugeColor(value: number): string {
  if (value >= 75) return 'var(--rose)'
  if (value >= 55) return '#f97316'
  if (value >= 40) return 'var(--amber)'
  return 'var(--emerald)'
}

function RiskGauge({ score }: { score: RiskScore }) {
  const radius = 44
  const circumference = Math.PI * radius
  const dash = (score.value / 100) * circumference
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
          strokeDasharray={`${dash} ${circumference}`}
          className="gauge-arc"
        />
      </svg>
      <div className="gauge-readout">
        <span className="gauge-value" style={{ color }}>{score.value}%</span>
        {/* <span className="gauge-level" style={{ color }}>{score.level}</span> */}
      </div>
      <span className="gauge-label">{score.label}</span>
    </div>
  )
}

function EditField({
  value,
  editing,
  onChange,
  multiline = false,
}: {
  value: string
  editing: boolean
  onChange: (value: string) => void
  multiline?: boolean
}) {
  if (!editing) return <span>{value}</span>

  if (multiline) {
    return (
      <textarea
        className="edit-field edit-field--area"
        value={value}
        onChange={event => onChange(event.target.value)}
        rows={3}
      />
    )
  }

  return (
    <input
      className="edit-field"
      type="text"
      value={value}
      onChange={event => onChange(event.target.value)}
    />
  )
}

function EmptySection({ text }: { text: string }) {
  return <div className="adetail-empty-inline">{text}</div>
}

export default function AnalysisDetail() {
  const { id } = useParams<{ id: string }>()
  const { t, i18n } = useTranslation()
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
    setError(null)
    api.analyses.get(Number(id))
      .then(data => {
        setAnalysis(data)
        setDraft(data)
      })
      .catch(event => setError(event instanceof Error ? event.message : t('analyses.detail.loadError')))
      .finally(() => setLoading(false))
  }, [id, t])

  const generatedDate = useMemo(() => {
    if (!analysis?.generated_at) return null
    return new Intl.DateTimeFormat(i18n.language === 'vi' ? 'vi-VN' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(parseBackendDate(analysis.generated_at))
  }, [analysis?.generated_at, i18n.language])

  if (loading) {
    return (
      <div className="adetail-page">
        <div className="container">
          <div className="analyses-empty" style={{ paddingTop: '6rem' }}>
            <LoaderIcon size={40} className="icon-spin" />
            <p>{t('analyses.detail.loading')}</p>
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
            <p>{error ?? t('analyses.detail.notFound', { id })}</p>
            <Link to="/analyses" className="btn btn-primary btn-sm">
              <ArrowLeftIcon size={14} />
              {t('analyses.backToHistory')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const meta = SEVERITY_META[analysis.severity]
  const severityColor = SEVERITY_COLORS[analysis.severity]
  const statusKey = analysis.status === 'processed' ? 'processed' : 'pending'
  const current = editing ? { ...analysis, ...draft } : analysis

  function field<K extends keyof AnalysisDetailType>(key: K): AnalysisDetailType[K] {
    return (draft[key] ?? analysis[key]) as AnalysisDetailType[K]
  }

  function setField<K extends keyof AnalysisDetailType>(key: K, value: AnalysisDetailType[K]) {
    setDraft(previous => ({ ...previous, [key]: value }))
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
    setSaving(true)
    try {
      const payload: AnalysisUpdate = {
        title: draft.title,
        summary: draft.summary,
        conflict_headline: draft.conflict_headline,
        deadline: draft.deadline,
        conflict_note: draft.conflict_note,
        risk_conclusion: draft.risk_conclusion,
        overall_risk: draft.overall_risk,
        compare_left: draft.compare_left,
        compare_right: draft.compare_right,
        business_impacts: draft.business_impacts,
        risk_scores: draft.risk_scores,
        detail_tables: draft.detail_tables,
      }
      const updated = await api.analyses.patch(analysis.id, payload)
      setAnalysis(updated)
      setDraft(updated)
      setEditing(false)
      setSaveMsg({ ok: true, text: t('analyses.detail.saveSuccess') })
      window.setTimeout(() => setSaveMsg(null), 3000)
    } catch (event) {
      const message = event instanceof Error ? event.message : t('analyses.detail.unknownError')
      setSaveMsg({ ok: false, text: t('analyses.detail.saveError', { message }) })
    } finally {
      setSaving(false)
    }
  }

  async function publishAnalysis() {
    if (analysis.status === 'processed') return
    setPublishing(true)
    try {
      const updated = await api.analyses.publish(analysis.id)
      setAnalysis(updated)
      setDraft(updated)
      setSaveMsg({ ok: true, text: t('analyses.detail.publishSuccess') })
      window.setTimeout(() => setSaveMsg(null), 4000)
    } catch (event) {
      const message = event instanceof Error ? event.message : t('analyses.detail.unknownError')
      setSaveMsg({ ok: false, text: t('analyses.detail.publishError', { message }) })
    } finally {
      setPublishing(false)
    }
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(analysis, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${analysis.code}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="adetail-page">
      <div className="adetail-topbar">
        <div className="adetail-topbar-inner container">
          <Link to={analysis.document_id ? `/analyses/history/doc-${analysis.document_id}` : '/analyses'} className="adetail-back">
            <ArrowLeftIcon size={15} />
            <span>{analysis.document_id ? t('analyses.detail.backToRun') : t('analyses.backToHistory')}</span>
          </Link>

          <div className="adetail-topbar-center">
            <span className="adetail-topbar-code">{analysis.code}</span>
            <span className={`analysis-chip ${meta.chip}`}>{t(meta.labelKey)}</span>
            <span className={`status-badge status-badge--${statusKey}`}>{t(`analyses.status.${statusKey}`)}</span>
          </div>

          <div className="adetail-topbar-actions">
            {!editing ? (
              <button className="btn btn-outline btn-sm" onClick={startEdit} type="button">
                <EditIcon size={13} />
                {t('analyses.detail.edit')}
              </button>
            ) : (
              <>
                <button className="btn btn-outline btn-sm" onClick={cancelEdit} disabled={saving} type="button">
                  <XIcon size={13} />
                  {t('analyses.detail.cancel')}
                </button>
                <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving} type="button">
                  {saving ? (
                    <>
                      <LoaderIcon size={13} className="icon-spin" />
                      {t('analyses.detail.saving')}
                    </>
                  ) : (
                    <>
                      <SaveIcon size={13} />
                      {t('analyses.detail.save')}
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="container adetail-body">
        <div
          className={`adetail-hero adetail-hero--${analysis.severity}`}
          style={{
            background: `linear-gradient(135deg, ${severityColor.from} 0%, ${severityColor.to} 100%)`,
            borderLeftColor: severityColor.accent,
          }}
        >
          <div className="adetail-hero-left">
            <div className="adetail-hero-code-row">
              <span className="adetail-hero-code">{analysis.code}</span>
              {analysis.deadline && (
                <span className="adetail-hero-deadline">
                  <ClockIcon size={13} />
                  {t('analyses.deadline', { value: analysis.deadline })}
                </span>
              )}
            </div>
            <h1 className="adetail-hero-title">
              <EditField value={String(field('title'))} editing={editing} onChange={value => setField('title', value)} />
            </h1>
            <p className="adetail-hero-headline">
              <EditField
                value={String(field('conflict_headline'))}
                editing={editing}
                onChange={value => setField('conflict_headline', value)}
              />
            </p>
          </div>

          <div className="adetail-hero-right">
            <div className="adetail-risk-stack">
              <div className="adetail-risk-circle" style={{ borderColor: severityColor.accent }}>
                <span className="adetail-risk-pct" style={{ color: severityColor.accent }}>
                  {analysis.overall_risk.value}%
                </span>
              </div>
              <span className="adetail-risk-lbl">{analysis.overall_risk.label}</span>
            </div>
          </div>
        </div>

        {saveMsg && (
          <div className={`save-msg ${saveMsg.ok ? 'save-msg--ok' : 'save-msg--error'}`}>
            {saveMsg.text}
          </div>
        )}

        <div className="adetail-meta-bar">
          <span className={`analysis-chip ${meta.chip}`}>{t(meta.labelKey)}</span>
          <span className={`status-badge status-badge--${statusKey}`}>{t(`analyses.status.${statusKey}`)}</span>
          <span className="adetail-meta-pill">
            <ActivityIcon size={13} />
            {analysis.overall_risk.label}
          </span>
          {generatedDate && (
            <span className="adetail-meta-pill">
              <ClockIcon size={13} />
              {t('analyses.detail.generatedAt', { value: generatedDate })}
            </span>
          )}
        </div>

        <section className="adetail-section adetail-anim" style={{ '--section-delay': '0ms' } as React.CSSProperties}>
          <div className="adetail-section-header">
            <span className="adetail-section-num">01</span>
            <h3 className="adetail-section-title">
              <FileTextIcon size={17} />
              {t('analyses.detail.sections.conflict')}
            </h3>
          </div>

          <div className="compare-grid-v2">
            <div className={`compare-card-v2 compare-card-v2--${current.compare_left.tone}`}>
              <div className="compare-card-v2-top">
                <span className="compare-source">{current.compare_left.source}</span>
                <span className="compare-verdict">
                  {current.compare_left.tone === 'danger' ? <XCircleIcon size={16} /> : <CheckCircleIcon size={16} />}
                  <EditField
                    value={current.compare_left.verdict}
                    editing={editing}
                    onChange={value => setField('compare_left', { ...current.compare_left, verdict: value })}
                  />
                </span>
              </div>
              <div className="compare-quote">
                <EditField
                  value={current.compare_left.quote}
                  editing={editing}
                  multiline
                  onChange={value => setField('compare_left', { ...current.compare_left, quote: value })}
                />
              </div>
            </div>

            <div className="compare-vs-divider"><span>{t('analyses.detail.vs')}</span></div>

            <div className={`compare-card-v2 compare-card-v2--${current.compare_right.tone}`}>
              <div className="compare-card-v2-top">
                <span className="compare-source">{current.compare_right.source}</span>
                <span className="compare-verdict">
                  {current.compare_right.tone === 'danger' ? <XCircleIcon size={16} /> : <CheckCircleIcon size={16} />}
                  <EditField
                    value={current.compare_right.verdict}
                    editing={editing}
                    onChange={value => setField('compare_right', { ...current.compare_right, verdict: value })}
                  />
                </span>
              </div>
              <div className="compare-quote">
                <EditField
                  value={current.compare_right.quote}
                  editing={editing}
                  multiline
                  onChange={value => setField('compare_right', { ...current.compare_right, quote: value })}
                />
              </div>
            </div>

            <div className="compare-conflict-banner">
              <span className="compare-conflict-label">
                <AlertTriangleIcon size={16} />
                {t('analyses.detail.conflictLabel')}
              </span>
              <p>
                <EditField
                  value={String(field('conflict_note'))}
                  editing={editing}
                  multiline
                  onChange={value => setField('conflict_note', value)}
                />
              </p>
            </div>
          </div>
        </section>

        <section className="adetail-section adetail-anim" style={{ '--section-delay': '60ms' } as React.CSSProperties}>
          <div className="adetail-section-header">
            <span className="adetail-section-num">02</span>
            <h3 className="adetail-section-title">
              <FileTextIcon size={17} />
              {t('analyses.detail.sections.summary')}
            </h3>
          </div>
          <p className="adetail-summary-text">
            <EditField value={String(field('summary'))} editing={editing} multiline onChange={value => setField('summary', value)} />
          </p>
        </section>

        <section className="adetail-section adetail-anim" style={{ '--section-delay': '120ms' } as React.CSSProperties}>
          <div className="adetail-section-header">
            <span className="adetail-section-num">03</span>
            <h3 className="adetail-section-title">
              <ActivityIcon size={17} />
              {t('analyses.detail.sections.impact')}
            </h3>
          </div>
          {current.business_impacts.length > 0 ? (
            <div className="impact-grid">
              {current.business_impacts.map((impact, index) => (
                <div key={`${impact.area}-${index}`} className={`impact-card-v2 impact-card-v2--${impact.risk}`}>
                  <div className="impact-card-v2-icon">
                    {impact.risk === 'urgent'
                      ? <AlertTriangleIcon size={16} />
                      : impact.risk === 'review'
                        ? <ClockIcon size={16} />
                        : <CheckCircleIcon size={16} />}
                  </div>
                  <span className="impact-area">{impact.area}</span>
                  <p className="impact-detail">
                    <EditField
                      value={impact.detail}
                      editing={editing}
                      multiline
                      onChange={value => {
                        const updated = [...current.business_impacts]
                        updated[index] = { ...impact, detail: value }
                        setField('business_impacts', updated)
                      }}
                    />
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptySection text={t('analyses.detail.emptySection')} />
          )}
        </section>

        <section className="adetail-section adetail-anim" style={{ '--section-delay': '180ms' } as React.CSSProperties}>
          <div className="adetail-section-header">
            <span className="adetail-section-num">04</span>
            <h3 className="adetail-section-title">
              <ActivityIcon size={17} />
              {t('analyses.detail.sections.risk')}
            </h3>
          </div>
          {current.risk_scores.length > 0 ? (
            <div className="gauge-grid">
              {current.risk_scores.map((score, index) => <RiskGauge key={`${score.label}-${index}`} score={score} />)}
            </div>
          ) : (
            <EmptySection text={t('analyses.detail.emptySection')} />
          )}
          <div className="risk-conclusion-v2">
            <div className="risk-conclusion-head">
              <AlertTriangleIcon size={15} />
              {t('analyses.detail.totalRisk', {
                label: current.overall_risk.label,
                value: current.overall_risk.value,
              })}
            </div>
            <p>
              <EditField
                value={String(field('risk_conclusion'))}
                editing={editing}
                multiline
                onChange={value => setField('risk_conclusion', value)}
              />
            </p>
          </div>
        </section>

        <section className="adetail-section adetail-anim" style={{ '--section-delay': '240ms' } as React.CSSProperties}>
          <div className="adetail-section-header">
            <span className="adetail-section-num">05</span>
            <h3 className="adetail-section-title">
              <FileTextIcon size={17} />
              {t('analyses.detail.sections.detail')}
            </h3>
          </div>
          {current.detail_tables.length > 0 ? (
            <div className="detail-tables">
              {current.detail_tables.map((table, tableIndex) => (
                <div key={`${table.title}-${tableIndex}`} className="detail-table-wrap">
                  <h4 className="detail-table-title">{table.title}</h4>
                  <div className="detail-table-scroll">
                    <table className="detail-table">
                      <thead>
                        <tr>{table.headers.map((header, headerIndex) => <th key={`${header}-${headerIndex}`}>{header}</th>)}</tr>
                      </thead>
                      <tbody>
                        {table.rows.map((row, rowIndex) => {
                          const tag = ROW_STATUS_META[row.status]
                          return (
                            <tr key={`${row.col1}-${rowIndex}`} className={`dtrow dtrow--${row.status}`}>
                              <td className="detail-cell-strong">{row.col1}</td>
                              <td>{row.col2}</td>
                              <td>{row.col3}</td>
                              <td>{tag && <span className={`tag ${tag.cls}`}>{t(tag.labelKey)}</span>}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptySection text={t('analyses.detail.emptySection')} />
          )}
        </section>

        <div className="adetail-actions">
          <div className="adetail-actions-left">
            <button className="btn btn-outline" onClick={downloadJson} type="button">
              <DownloadIcon size={15} />
              JSON
            </button>
            <button className="btn btn-outline" onClick={() => exportAnalysisDocx(analysis)} type="button">
              <DownloadIcon size={15} />
              {t('analyses.detail.exportDocx')}
            </button>
          </div>
          <div className="adetail-actions-right">
            <button
              className={`btn adetail-publish-btn ${analysis.status === 'processed' ? 'adetail-publish-btn--done' : 'btn-primary'}`}
              onClick={publishAnalysis}
              disabled={publishing || analysis.status === 'processed'}
              type="button"
            >
              {publishing ? (
                <>
                  <LoaderIcon size={14} className="icon-spin" />
                  {t('analyses.detail.publishing')}
                </>
              ) : analysis.status === 'processed' ? (
                <>
                  <CheckCircleIcon size={14} />
                  {t('analyses.status.processed')}
                </>
              ) : (
                t('analyses.detail.publish')
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
