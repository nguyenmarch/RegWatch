import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import AlertHistoryTab from '../components/actionplan/AlertHistoryTab'
import ActionPlanTab from '../components/actionplan/ActionPlanTab'
import LLMRecommendTab from '../components/actionplan/LLMRecommendTab'
import { FileTextIcon, SparklesIcon } from '../components/Icons'
import type { Document } from '../lib/api'
import type { ActionPlanItem, Alert } from '../types/actionplan'

export default function ActionPlan() {
  const { t } = useTranslation()
  const [rightTab, setRightTab] = useState<'llmRecommend'>('llmRecommend')

  const [alerts, setAlerts] = useState<Alert[]>([])
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [actionPlanItems, setActionPlanItems] = useState<ActionPlanItem[]>([])
  const [kbDocuments, setKbDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const totalAlerts = alerts.length
  const needsAction = alerts.filter(a => a.severity === 'HIGH' || a.severity === 'CRITICAL').length
  const inProgress = actionPlanItems.filter(ap => ap.status === 'Đang xử lý').length
  const completed = actionPlanItems.filter(ap => ap.status === 'Đã chốt').length
  const totalBudget = actionPlanItems.reduce((sum, ap) => sum + ap.estimated_budget, 0)

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.actionPlan.listAlerts()
      setAlerts(data)
      if (data.length > 0 && !selectedAlert) {
        setSelectedAlert(data[0])
      }
    } catch (err) {
      console.error('Failed to fetch alerts:', err)
      const mockAlerts: Alert[] = [
        {
          id: 1,
          alert_code: 'ALERT-2025-00024',
          severity: 'CRITICAL',
          title: 'Thông tư 50/2024/TT-NHNN',
          description: 'Yêu cầu mới về xác minh danh tính khách hàng',
          issued_date: '2025-01-15',
          due_date: '2025-06-15',
          estimated_impact: '28.7 tỷ',
          created_at: '2025-01-15T10:00:00',
        },
      ]
      setAlerts(mockAlerts)
      if (mockAlerts.length > 0 && !selectedAlert) setSelectedAlert(mockAlerts[0])
    } finally {
      setLoading(false)
    }
  }, [selectedAlert])

  const fetchActionPlan = useCallback(async (alertId: number) => {
    try {
      const data = await api.actionPlan.getActionPlan(alertId)
      setActionPlanItems(data.action_items)
    } catch (err) {
      console.error('Failed to fetch action plan:', err)
      const mockItems: ActionPlanItem[] = [
        {
          id: 1,
          alert_id: alertId,
          action_description: 'Cập nhật hệ thống nhận dạng khách hàng (KYC)',
          responsible_department: 'Khối Công nghệ',
          target_date: '25/08/2025',
          estimated_budget: 12000000000,
          estimated_risk: 'Cao',
          code: 'AP-001',
          status: 'Cần xử lý',
          deliverable_type: 'process_update',
          owner_role: 'Compliance Department / Risk Manager',
          co_owner_role: 'Product / IT / PO',
          dependency: '',
          evidence_document: '',
        },
      ]
      setActionPlanItems(mockItems)
    }
  }, [])

  const fetchKnowledgeBase = useCallback(async () => {
    try {
      const data = await api.documents.list('action_plan')
      setKbDocuments(data)
    } catch (err) {
      console.error('Failed to fetch knowledge base:', err)
      setKbDocuments([])
    }
  }, [])

  useEffect(() => {
    fetchAlerts()
    fetchKnowledgeBase()
  }, [fetchAlerts, fetchKnowledgeBase])

  useEffect(() => {
    if (selectedAlert) fetchActionPlan(selectedAlert.id)
  }, [selectedAlert, fetchActionPlan])

  const handleSelectAlert = (alert: Alert) => {
    setSelectedAlert(alert)
  }

  const handleSaveActionPlan = async (items: ActionPlanItem[]) => {
    setSaving(true)
    try {
      if (selectedAlert) {
        await api.actionPlan.saveActionPlanItems(selectedAlert.id, items)
        setActionPlanItems(items)
        alert(t('actionPlan.toast.saveSucess') || 'Action Plan saved successfully')
      }
    } catch (err) {
      console.error('Failed to save action plan:', err)
      alert(t('actionPlan.toast.saveError') || 'Failed to save Action Plan')
    } finally {
      setSaving(false)
    }
  }

  const handleFinalizeActionPlan = async () => {
    if (!selectedAlert) return
    setSaving(true)
    try {
      const data = await api.actionPlan.finalizeActionPlan(selectedAlert.id)
      
      // Generate and download JSON file of the finalized action plan
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const name = selectedAlert?.alert_code
        ? `${selectedAlert.alert_code}_action_plan.json`
        : 'action_plan.json'
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      alert(t('actionPlan.toast.finalizeSuccess') || 'Action Plan finalized successfully')
      fetchAlerts()
      fetchActionPlan(selectedAlert.id)
    } catch (err) {
      console.error('Failed to finalize action plan:', err)
      alert(t('actionPlan.toast.finalizeError') || 'Failed to finalize Action Plan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="actionplan-page">
      <div className="container">
        <div className="actionplan-header">
          <div>
            <h1 className="actionplan-title">{t('actionPlan.title') || 'Action Plan'}</h1>
            <p className="actionplan-subtitle">{t('actionPlan.subtitle') || 'Quản lý kế hoạch hành động dự các Alert rủi ro'}</p>
          </div>
        </div>

        <div className="actionplan-stats-row">
          <div className="actionplan-stat-card">
            <div className="stat-icon stat-icon-1">
              <FileTextIcon size={24} />
            </div>
            <div className="stat-content">
              <div className="stat-value">{totalAlerts}</div>
              <div className="stat-label">Tổng Alert</div>
            </div>
          </div>

          <div className="actionplan-stat-card">
            <div className="stat-icon stat-icon-2">⚠️</div>
            <div className="stat-content">
              <div className="stat-value">{needsAction}</div>
              <div className="stat-label">Cần xử lý</div>
            </div>
          </div>

          <div className="actionplan-stat-card">
            <div className="stat-icon stat-icon-3">⏳</div>
            <div className="stat-content">
              <div className="stat-value">{inProgress}</div>
              <div className="stat-label">Đang xử lý</div>
            </div>
          </div>

          <div className="actionplan-stat-card">
            <div className="stat-icon stat-icon-4">✓</div>
            <div className="stat-content">
              <div className="stat-value">{completed}</div>
              <div className="stat-label">Đã chốt Action Plan</div>
            </div>
          </div>

          <div className="actionplan-stat-card">
            <div className="stat-icon stat-icon-5">💰</div>
            <div className="stat-content">
              <div className="stat-value">{(totalBudget / 1e9).toFixed(1)}T</div>
              <div className="stat-label">Ước tính dự trù</div>
            </div>
          </div>
        </div>

        <div className="actionplan-grid">
          <div className="actionplan-left">
            <AlertHistoryTab
              alerts={alerts}
              selectedAlert={selectedAlert}
              onSelectAlert={handleSelectAlert}
              loading={loading}
            />
          </div>

          <div className="actionplan-center">
            <ActionPlanTab
              key={selectedAlert?.id || 0}
              selectedAlert={selectedAlert}
              items={actionPlanItems}
              onSave={handleSaveActionPlan}
              onFinalize={handleFinalizeActionPlan}
              saving={saving}
            />
          </div>

          <div className="actionplan-right">
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
                selectedAlert={selectedAlert}
                kbDocuments={kbDocuments}
              />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes actionplan-pulse {
          0% { box-shadow: 0 0 0 rgba(243,112,33,0.0); transform: translateY(0); }
          50% { box-shadow: 0 0 36px rgba(243,112,33,0.22); transform: translateY(-1px); }
          100% { box-shadow: 0 0 0 rgba(243,112,33,0.0); transform: translateY(0); }
        }

        .actionplan-page {
          padding: 20px 0;
          animation: fade-up 0.35s var(--ease) both;
        }

        @media (prefers-reduced-motion: reduce) {
          .actionplan-page,
          .actionplan-grid,
          .actionplan-stats-row,
          .actionplan-left,
          .actionplan-center,
          .actionplan-right {
            animation: none !important;
            transition: none !important;
          }
        }


        .actionplan-grid,
        .actionplan-stats-row,
        .actionplan-left,
        .actionplan-center,
        .actionplan-right {
          animation: fade-up 0.45s var(--ease) both;
        }

        .actionplan-grid { animation-delay: 80ms; }
        .actionplan-stats-row { animation-delay: 30ms; }
        .actionplan-left { animation-delay: 120ms; }
        .actionplan-center { animation-delay: 160ms; }
        .actionplan-right { animation-delay: 200ms; }



        .container {
          max-width: 1600px;
          margin: 0 auto;
          padding: 0 20px;
        }

        .actionplan-header {
          margin-bottom: 30px;
        }

        .actionplan-title {
          font-size: 28px;
          font-weight: 600;
          margin: 0 0 5px 0;
          color: var(--text-1);
        }


        .actionplan-subtitle {
          font-size: 14px;
          color: var(--text-2);
          margin: 0;
        }


        /* Stats Section */
        .actionplan-stats-row {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 15px;
          margin-bottom: 30px;
        }

        .actionplan-stat-card {
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

        [data-theme="light"] .actionplan-stat-card {
          background: #ffffff !important;
          border: 1px solid #e5e7eb !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important;
        }

        .actionplan-stats-row .actionplan-stat-card:hover {
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18) !important;
          background: rgba(8, 35, 63, 0.55) !important;
          border-color: rgba(255, 255, 255, 0.12) !important;
          transform: translateY(-3px) scale(1.03) !important;
          opacity: 1 !important;
        }

        [data-theme="light"] .actionplan-stats-row .actionplan-stat-card:hover {
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
        .actionplan-grid {
          display: grid;
          grid-template-columns: 350px 1fr 380px;
          gap: 20px;
        }

        .actionplan-left,
        .actionplan-center,
        .actionplan-right {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          overflow: hidden;
        }

        [data-theme="dark"] .actionplan-left,
        [data-theme="dark"] .actionplan-center,
        [data-theme="dark"] .actionplan-right {
          background: rgba(8, 35, 63, 0.72);
          border-color: rgba(255, 255, 255, 0.10);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);
        }

        .actionplan-right {
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
          .actionplan-grid {
            grid-template-columns: 1fr;
          }

          .actionplan-stats-row {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (max-width: 768px) {
          .actionplan-stats-row {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  )
}

