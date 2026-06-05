import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Document } from '../lib/api'
import ManageTab from '../components/documents/ManageTab'
import UploadTab from '../components/documents/UploadTab'
import HistoryTab from '../components/documents/HistoryTab'
import AlertsTab from '../components/documents/AlertsTab'
import { FileTextIcon, UploadCloudIcon, ScrollTextIcon, AlertTriangleIcon, LoaderIcon, RefreshIcon } from '../components/Icons'

type Tab = 'manage' | 'upload' | 'history' | 'alerts'

type Toast = { id: number; type: 'success' | 'error'; msg: string }
let toastSeq = 0

export default function Documents() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('manage')
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [openLogId, setOpenLogId] = useState<number | null>(null)
  const processingCount = docs.filter(d => d.status === 'pending' || d.status === 'processing').length

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
      if (!silent) addToast('error', t('documents.toast.fetchError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  useEffect(() => {
    if (!processingCount) return
    const timer = setInterval(() => fetchDocs(true), 3000)
    return () => clearInterval(timer)
  }, [processingCount, fetchDocs])

  function handleDeleted(id: number) {
    setDocs(prev => prev.filter(d => d.id !== id))
    addToast('success', t('documents.toast.deleteSuccess'))
  }

  function handleUploaded(docIds: number[]) {
    fetchDocs(true)
    addToast('success', t('documents.toast.uploadSuccess'))
    // Forward to history tab and open log for last uploaded doc
    const lastId = docIds[docIds.length - 1]
    setOpenLogId(lastId)
    setTab('history')
  }

  const TABS: { key: Tab; icon: React.ReactNode; label: string }[] = [
    { key: 'manage',  icon: <FileTextIcon size={15} />,     label: t('documents.tabManage')  },
    { key: 'upload',  icon: <UploadCloudIcon size={15} />,  label: t('documents.tabUpload')  },
    { key: 'history', icon: <ScrollTextIcon size={15} />,   label: t('documents.tabHistory') },
    { key: 'alerts',  icon: <AlertTriangleIcon size={15} />, label: t('documents.tabAlerts') },
  ]

  return (
    <div className="docs-page">
      <div className="container">

        {/* ── Page header ── */}
        <div className="docs-header">
          <div>
            <h1 className="docs-title">{t('documents.title')}</h1>
            <p className="docs-subtitle">{t('documents.subtitle')}</p>
          </div>
          <div className="docs-header-actions">
            {processingCount > 0 && (
              <span className="docs-processing-badge">
                <LoaderIcon size={13} className="icon-spin" />
                {t('documents.processing', { count: processingCount })}
              </span>
            )}
            <button className="btn btn-outline btn-sm" onClick={() => fetchDocs()} disabled={loading}>
              <RefreshIcon size={14} />
              {t('documents.refresh')}
            </button>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="docs-tabs">
          {TABS.map(({ key, icon, label }) => (
            <button
              key={key}
              className={`docs-tab ${tab === key ? 'docs-tab--active' : ''}`}
              onClick={() => setTab(key)}
            >
              {icon}
              {label}
              {key === 'manage' && docs.length > 0 && (
                <span className="docs-tab-badge">{docs.length}</span>
              )}
              {key === 'history' && processingCount > 0 && (
                <span className="docs-tab-badge docs-tab-badge--spin">
                  <LoaderIcon size={10} className="icon-spin" />
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="docs-tab-content">
          {tab === 'manage' && (
            <ManageTab docs={docs} loading={loading} onDeleted={handleDeleted} />
          )}
          {tab === 'upload' && (
            <UploadTab onUploaded={handleUploaded} />
          )}
          {tab === 'history' && (
            <HistoryTab
              docs={docs}
              loading={loading}
              openLogId={openLogId}
              onLogClose={() => setOpenLogId(null)}
            />
          )}
          {tab === 'alerts' && (
            <AlertsTab />
          )}
        </div>

      </div>

      {/* ── Toast stack ── */}
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
