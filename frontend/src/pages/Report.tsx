import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import AnalysesHistoryTab from '../components/report/AnalysesHistoryTab'
import ReportTab from '../components/report/ReportTab'
import LLMRecommendTab from '../components/report/LLMRecommendTab'
import { FileTextIcon, SparklesIcon } from '../components/Icons'
import type { Document } from '../lib/api'
import type { ReportItem, Analyses } from '../types/report'

export default function Report() {
  const { t } = useTranslation()
  const [rightTab, setRightTab] = useState<'llmRecommend'>('llmRecommend')

  const [analyses, setAnalyses] = useState<Analyses[]>([])
  const [selectedAnalyses, setSelectedAnalyses] = useState<Analyses | null>(null)
  const [reportItems, setReportItems] = useState<ReportItem[]>([])
  const [kbDocuments, setKbDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const totalAnalyses = analyses.length
  const needsAction = analyses.filter(a => a.severity === 'HIGH' || a.severity === 'CRITICAL').length
  const inProgress = reportItems.filter(ap => ap.status === 'Đang xử lý').length
  const completed = reportItems.filter(ap => ap.status === 'Đã chốt').length
  const totalBudget = reportItems.reduce((sum, ap) => sum + ap.estimated_budget, 0)

  const fetchAnalyses = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.report.listAnalyses()
      setAnalyses(data)
      if (data.length > 0 && !selectedAnalyses) {
        setSelectedAnalyses(data[0])
      }
    } catch (err) {
      console.error('Failed to fetch analyses:', err)
      setAnalyses([])
      setSelectedAnalyses(null)
    } finally {
      setLoading(false)
    }
  }, [selectedAnalyses])

  const fetchReport = useCallback(async (analysesId: number) => {
    try {
      const data = await api.report.getReport(analysesId)
      setReportItems(data.report_items)
    } catch (err) {
      console.error('Failed to fetch report:', err)
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

  const handleSelectAnalyses = (analyses: Analyses) => {
    setSelectedAnalyses(analyses)
  }

  const handleSaveReport = async (items: ReportItem[]) => {
    setSaving(true)
    try {
      if (selectedAnalyses) {
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
    setSaving(true)
    try {
      const data = await api.report.finalizeReport(selectedAnalyses.id)
      
      // Generate and download JSON file of the finalized report
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const name = selectedAnalyses?.analyses_code
        ? `${selectedAnalyses.analyses_code}_report.json`
        : 'report.json'
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      window.alert(t('report.toast.finalizeSuccess') || 'Report finalized successfully')
      fetchAnalyses()
      fetchReport(selectedAnalyses.id)
    } catch (err) {
      console.error('Failed to finalize report:', err)
      window.alert(t('report.toast.finalizeError') || 'Failed to finalize Report')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="report-page">
      <div className="container">
        <div className="report-header">
          <div>
            <h1 className="report-title">{t('report.title') || 'Report'}</h1>
            <p className="report-subtitle">{t('report.subtitle') || 'Quản lý report dự các Analyses rủi ro'}</p>
          </div>
        </div>

        <div className="report-stats-row">
          <div className="report-stat-card">
            <div className="stat-icon stat-icon-1">
              <FileTextIcon size={24} />
            </div>
            <div className="stat-content">
              <div className="stat-value">{totalAnalyses}</div>
              <div className="stat-label">Tổng Analyses</div>
            </div>
          </div>

          <div className="report-stat-card">
            <div className="stat-icon stat-icon-2">⚠️</div>
            <div className="stat-content">
              <div className="stat-value">{needsAction}</div>
              <div className="stat-label">Cần xử lý</div>
            </div>
          </div>

          <div className="report-stat-card">
            <div className="stat-icon stat-icon-3">⏳</div>
            <div className="stat-content">
              <div className="stat-value">{inProgress}</div>
              <div className="stat-label">Đang xử lý</div>
            </div>
          </div>

          <div className="report-stat-card">
            <div className="stat-icon stat-icon-4">✓</div>
            <div className="stat-content">
              <div className="stat-value">{completed}</div>
              <div className="stat-label">Đã chốt Report</div>
            </div>
          </div>

          <div className="report-stat-card">
            <div className="stat-icon stat-icon-5">💰</div>
            <div className="stat-content">
              <div className="stat-value">{(totalBudget / 1e9).toFixed(1)}T</div>
              <div className="stat-label">Ước tính dự trù</div>
            </div>
          </div>
        </div>

        <div className="report-grid">
          <div className="report-left">
            <AnalysesHistoryTab
              analyses={analyses}
              selectedAnalyses={selectedAnalyses}
              onSelectAnalyses={handleSelectAnalyses}
              loading={loading}
            />
          </div>

          <div className="report-center">
            <ReportTab
              key={selectedAnalyses?.id || 0}
              selectedAnalyses={selectedAnalyses}
              items={reportItems}
              onSave={handleSaveReport}
              onFinalize={handleFinalizeReport}
              saving={saving}
            />
          </div>

          <div className="report-right">
            <div className="right-tabs">
              <button
                className={`right-tab ${rightTab === 'llmRecommend' ? 'active' : ''}`}
                onClick={() => setRightTab('llmRecommend')}
              >
                <SparklesIcon size={14} />
                LLM Recommend
              </button>
            </div>
            <div className="right-content">
              <LLMRecommendTab
                selectedAnalyses={selectedAnalyses}
                kbDocuments={kbDocuments}
              />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes report-pulse {
          0% { box-shadow: 0 0 0 rgba(243,112,33,0.0); transform: translateY(0); }
          50% { box-shadow: 0 0 36px rgba(243,112,33,0.22); transform: translateY(-1px); }
          100% { box-shadow: 0 0 0 rgba(243,112,33,0.0); transform: translateY(0); }
        }

        .report-page {
          padding: 20px 0;
          animation: fade-up 0.35s var(--ease) both;
        }

        @media (prefers-reduced-motion: reduce) {
          .report-page,
          .report-grid,
          .report-stats-row,
          .report-left,
          .report-center,
          .report-right {
            animation: none !important;
            transition: none !important;
          }
        }


        .report-grid,
        .report-stats-row,
        .report-left,
        .report-center,
        .report-right {
          animation: fade-up 0.45s var(--ease) both;
        }

        .report-grid { animation-delay: 80ms; }
        .report-stats-row { animation-delay: 30ms; }
        .report-left { animation-delay: 120ms; }
        .report-center { animation-delay: 160ms; }
        .report-right { animation-delay: 200ms; }



        .container {
          max-width: 1600px;
          margin: 0 auto;
          padding: 0 20px;
        }

        .report-header {
          margin-bottom: 30px;
        }

        .report-title {
          font-size: 28px;
          font-weight: 600;
          margin: 0 0 5px 0;
          color: var(--text-1);
        }


        .report-subtitle {
          font-size: 14px;
          color: var(--text-2);
          margin: 0;
        }


        /* Stats Section */
        .report-stats-row {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 15px;
          margin-bottom: 30px;
        }

        .report-stat-card {
          background: rgba(8, 35, 63, 0.5) !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          border-radius: 12px;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1) !important;
          transition: transform 0.15s ease, box-shadow 0.15s ease !important;
          cursor: pointer;
          opacity: 1 !important;
        }

        [data-theme="light"] .report-stat-card {
          background: #ffffff !important;
          border: 1px solid #e5e7eb !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important;
        }

        .report-stats-row .report-stat-card:hover {
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18) !important;
          background: rgba(8, 35, 63, 0.55) !important;
          border-color: rgba(255, 255, 255, 0.12) !important;
          transform: translateY(-3px) scale(1.03) !important;
          opacity: 1 !important;
        }

        [data-theme="light"] .report-stats-row .report-stat-card:hover {
          background: #ffffff !important;
          border-color: #d1d5db !important;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12) !important;
        }

        .stat-icon {
          font-size: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 40px;
        }

        .stat-icon-1 {
          color: #3b82f6;
        }

        .stat-icon-2 {
          color: #ef4444;
        }

        .stat-icon-3 {
          color: #f59e0b;
        }

        .stat-icon-4 {
          color: #10b981;
        }

        .stat-icon-5 {
          color: #8b5cf6;
        }

        .stat-content {
          flex: 1;
        }

        .stat-value {
          font-size: 18px;
          font-weight: 700;
          color: #f37021 !important;
          line-height: 1.2;
        }

        .stat-label {
          font-size: 12px;
          color: var(--text-2) !important;
          margin-top: 2px;
        }

        /* 3-Column Grid */
        .report-grid {
          display: grid;
          grid-template-columns: 350px 1fr 380px;
          gap: 20px;
        }

        .report-left,
        .report-center,
        .report-right {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          overflow: hidden;
        }

        [data-theme="dark"] .report-left,
        [data-theme="dark"] .report-center,
        [data-theme="dark"] .report-right {
          background: rgba(8, 35, 63, 0.72);
          border-color: rgba(255, 255, 255, 0.10);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);
        }

        .report-right {
          display: flex;
          flex-direction: column;
        }

        /* Right Sidebar Tabs */
        .right-tabs {
          display: flex;
          border-bottom: 2px solid #e5e7eb;
          background: #f9fafb;
        }

        [data-theme="dark"] .right-tabs {
          background: rgba(255, 255, 255, 0.04);
          border-bottom-color: rgba(255, 255, 255, 0.10);
        }

        .right-tab {
          flex: 1;
          padding: 12px;
          border: none;
          background: none;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          color: #6b7280;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.2s;
          border-bottom: 2px solid transparent;
          margin-bottom: -2px;
        }

        .right-tab:hover {
          color: #1f2937;
        }

        .right-tab.active {
          color: #2563eb;
          border-bottom-color: #2563eb;
        }

        [data-theme="dark"] .right-tab {
          color: var(--text-2);
        }

        [data-theme="dark"] .right-tab:hover,
        [data-theme="dark"] .right-tab.active {
          color: #93c5fd;
        }

        [data-theme="dark"] .right-tab.active {
          background: rgba(37, 99, 235, 0.10);
          border-bottom-color: #60a5fa;
        }

        .right-content {
          flex: 1;
          overflow-y: auto;
          max-height: 800px;
          padding: 16px;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .report-grid {
            grid-template-columns: 1fr;
          }

          .report-stats-row {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (max-width: 768px) {
          .report-stats-row {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  )
}
