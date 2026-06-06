import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import AnalysesHistoryTab from '../components/report/AnalysesHistoryTab'
import ReportTab from '../components/report/ReportTab'
import LLMRecommendTab from '../components/report/LLMRecommendTab'
import { FileTextIcon, SparklesIcon, LoaderIcon } from '../components/Icons'
import type { Document } from '../lib/api'
import type { ReportDossier, ReportItem, Analyses } from '../types/report'

export default function Report() {
  const { t } = useTranslation()

  const [analyses, setAnalyses] = useState<Analyses[]>([])
  const [selectedAnalyses, setSelectedAnalyses] = useState<Analyses | null>(null)
  const [reportDossier, setReportDossier] = useState<ReportDossier | null>(null)
  const [reportItems, setReportItems] = useState<ReportItem[]>([])
  const [kbDocuments, setKbDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const autoSelectedRef = useRef(false)

  const totalAnalyses = analyses.length
  const finalizedAnalyses = analyses.filter(a => a.status === 'finalized').length
  const needsAction = analyses.filter(a => a.status !== 'finalized').length
  const completed = finalizedAnalyses
  const reportLocked = selectedAnalyses?.status === 'finalized' || reportDossier?.workflow_status === 'issued'

  const fetchAnalyses = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.report.listAnalyses()
      setAnalyses(data)
      if (data.length > 0 && !autoSelectedRef.current) {
        autoSelectedRef.current = true
        setSelectedAnalyses(data[0])
      }
    } catch (err) {
      console.error('Failed to fetch analyses:', err)
      setAnalyses([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchReport = useCallback(async (analysesId: number) => {
    try {
      const data = await api.report.getReport(analysesId)
      setReportDossier(data)
      setReportItems(data.report_items)
    } catch (err) {
      console.error('Failed to fetch report:', err)
      setReportDossier(null)
      setReportItems([])
    }
  }, [])

  const fetchKnowledgeBase = useCallback(async () => {
    try {
      const data = await api.documents.list('report')
      setKbDocuments(data)
    } catch (err) {
      console.error('Failed to fetch knowledge base:', err)
      setKbDocuments([])
    }
  }, [])

  useEffect(() => {
    fetchAnalyses()
    fetchKnowledgeBase()
  }, [fetchAnalyses, fetchKnowledgeBase])

  useEffect(() => {
    if (selectedAnalyses) fetchReport(selectedAnalyses.id)
  }, [selectedAnalyses, fetchReport])

  const handleSelectAnalyses = (a: Analyses) => setSelectedAnalyses(a)

  const handleSaveReport = async (items: ReportItem[]) => {
    setSaving(true)
    try {
      if (selectedAnalyses) {
        if (reportLocked) return
        await api.report.saveReportItems(selectedAnalyses.id, items)
        setReportItems(items)
        window.alert(t('report.toast.saveSucess') || 'Report saved successfully')
      }
    } catch (err) {
      console.error('Failed to save report:', err)
      window.alert(t('report.toast.saveError') || 'Failed to save Report')
    } finally {
      setSaving(false)
    }
  }

  const handleFinalizeReport = async () => {
    if (!selectedAnalyses) return
    if (reportLocked) return
    setSaving(true)
    try {
      const data = await api.report.finalizeReport(selectedAnalyses.id)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = selectedAnalyses.analyses_code
        ? `${selectedAnalyses.analyses_code}_report.json`
        : 'report.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      window.alert(t('report.toast.finalizeSuccess') || 'Report finalized successfully')
      setReportItems(data.report_items)
      setReportDossier({
        analyses_id: selectedAnalyses.id,
        workflow_status: data.workflow_status,
        risk_report: data.risk_report,
        ceo_approval: data.ceo_approval,
        issued_plan: data.issued_plan,
        report_items: data.report_items,
        action_plan: data.action_plan ?? null,
      })
      setSelectedAnalyses(prev => prev ? { ...prev, status: 'finalized' } : prev)
      setAnalyses(prev => prev.map(item =>
        item.id === selectedAnalyses.id ? { ...item, status: 'finalized' } : item
      ))
      await Promise.all([fetchAnalyses(), fetchReport(selectedAnalyses.id)])
    } catch (err) {
      console.error('Failed to finalize report:', err)
      window.alert(t('report.toast.finalizeError') || 'Failed to finalize Report')
    } finally {
      setSaving(false)
    }
  }

  const stats = [
    {
      label: 'Tổng Analyses', value: totalAnalyses, mod: 'blue', d: '80ms',
      icon: (
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
    },
    {
      label: 'Cần xử lý', value: needsAction, mod: 'red', d: '110ms',
      icon: (
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
    {
      label: 'Đã chốt Report', value: completed, mod: 'green', d: '140ms',
      icon: (
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ),
    },
  ]

  return (
    <div className="rpt-page">
      <div className="container">
        {/* Header */}
        <div className="rpt-header">
          <div className="rpt-header-left">
            <p className="rpt-eyebrow">Compliance Report</p>
            <h1 className="rpt-title">{t('report.title') || 'Report'}</h1>
            <p className="rpt-subtitle">{t('report.subtitle') || 'Quản lý report các Analyses rủi ro'}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="rpt-stats">
          {stats.map(s => (
            <div
              key={s.label}
              className={`rpt-stat rpt-stat--${s.mod}`}
              style={{ '--d': s.d } as React.CSSProperties}
            >
              <div className="rpt-stat-icon">{s.icon}</div>
              <div>
                <div className="rpt-stat-val">{s.value}</div>
                <div className="rpt-stat-lbl">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 3-column grid */}
        <div className="rpt-grid">
          {/* Left: analyses list */}
          <div className="rpt-panel" style={{ '--d': '220ms' } as React.CSSProperties}>
            <div className="rpt-panel-head">
              <div className="rpt-panel-icon"><FileTextIcon size={14} /></div>
              <span className="rpt-panel-title">Danh sách Analyses</span>
              {loading && <LoaderIcon size={13} className="icon-spin" />}
              <span className="rpt-panel-badge">{analyses.length}</span>
            </div>
            <div className="rpt-left-wrap">
              <AnalysesHistoryTab
                analyses={analyses}
                selectedAnalyses={selectedAnalyses}
                onSelectAnalyses={handleSelectAnalyses}
                loading={loading}
              />
            </div>
          </div>

          {/* Center: report editor — ReportTab owns its own panel-head + toolbar + scroll area */}
          <div className="rpt-panel" style={{ '--d': '260ms' } as React.CSSProperties}>
            <ReportTab
              key={selectedAnalyses?.id ?? 0}
              selectedAnalyses={selectedAnalyses}
              items={reportItems}
              onSave={handleSaveReport}
              onFinalize={handleFinalizeReport}
              saving={saving}
              locked={reportLocked}
              actionPlan={reportDossier?.action_plan ?? null}
            />
          </div>

          {/* Right: AI panel */}
          <div className="rpt-panel rpt-right-panel" style={{ '--d': '300ms' } as React.CSSProperties}>
            <div className="rpt-panel-head">
              <div className="rpt-panel-icon"><SparklesIcon size={14} /></div>
              <span className="rpt-panel-title">AI Recommendations</span>
            </div>
            <div className="rpt-right-wrap">
              <LLMRecommendTab
                selectedAnalyses={selectedAnalyses}
                kbDocuments={kbDocuments}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
