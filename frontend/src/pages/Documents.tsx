import { useEffect, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Document, type KbType } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { canAccessKb } from '../lib/permissions'
import ManageTab from '../components/documents/ManageTab'
import UploadTab from '../components/documents/UploadTab'
import HistoryTab from '../components/documents/HistoryTab'
import {
  ScaleIcon, ClipboardListIcon, BuildingIcon,
  FileTextIcon, UploadCloudIcon, ScrollTextIcon,
  LoaderIcon, RefreshIcon,
} from '../components/Icons'

type SubTab = 'manage' | 'upload' | 'history'
type Toast = { id: number; type: 'success' | 'error'; msg: string }
let toastSeq = 0

interface KbConfig {
  type: KbType
  Icon: React.ComponentType<{ size?: number; className?: string }>
  colorClass: string
  badgeKey: string
}

const KB_CONFIGS: KbConfig[] = [
  { type: 'law',         Icon: ScaleIcon,         colorClass: 'kb-law',     badgeKey: 'documents.kb.law.badge'        },
  { type: 'report', Icon: ClipboardListIcon,  colorClass: 'kb-report',  badgeKey: 'documents.kb.report.badge' },
  { type: 'internal',    Icon: BuildingIcon,       colorClass: 'kb-internal',badgeKey: 'documents.kb.internal.badge'   },
]

export default function Documents() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [activeKb, setActiveKb] = useState<KbType>('law')
  const [subTab, setSubTab] = useState<SubTab>('manage')
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [openLogId, setOpenLogId] = useState<number | null>(null)

  const visibleKbConfigs = useMemo(
    () => KB_CONFIGS.filter(config => canAccessKb(user, config.type)),
    [user],
  )
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
      if (!silent) addToast('error', t('documents.toast.fetchError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  useEffect(() => {
    if (visibleKbConfigs.length === 0) return
    if (!visibleKbConfigs.some(config => config.type === activeKb)) {
      setActiveKb(visibleKbConfigs[0].type)
    }
  }, [activeKb, visibleKbConfigs])

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
    const lastId = docIds[docIds.length - 1]
    setOpenLogId(lastId)
    setSubTab('history')
  }

  function switchKb(kb: KbType) {
    setActiveKb(kb)
    setSubTab('manage')
    setOpenLogId(null)
  }

  const SUB_TABS: { key: SubTab; icon: React.ReactNode; labelKey: string }[] = [
    { key: 'manage',  icon: <FileTextIcon size={14} />,    labelKey: 'documents.tabManage'  },
    { key: 'upload',  icon: <UploadCloudIcon size={14} />, labelKey: 'documents.tabUpload'  },
    { key: 'history', icon: <ScrollTextIcon size={14} />,  labelKey: 'documents.tabHistory' },
  ]

  const allProcessing = docs.filter(d => d.status === 'pending' || d.status === 'processing').length

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
            {allProcessing > 0 && (
              <span className="docs-processing-badge">
                <LoaderIcon size={13} className="icon-spin" />
                {t('documents.processing', { count: allProcessing })}
              </span>
            )}
            <button className="btn btn-outline btn-sm" onClick={() => fetchDocs()} disabled={loading}>
              <RefreshIcon size={14} />
              {t('documents.refresh')}
            </button>
          </div>
        </div>

        {/* ── KB Type Selector ── */}
        <div className="kb-selector">
          {visibleKbConfigs.map(({ type, Icon, colorClass, badgeKey }) => {
            const count = docs.filter(d => d.kb_type === type).length
            const processing = docs.filter(d => d.kb_type === type && (d.status === 'pending' || d.status === 'processing')).length
            const isActive = activeKb === type
            return (
              <button
                key={type}
                className={`kb-card ${colorClass} ${isActive ? 'kb-card--active' : ''}`}
                onClick={() => switchKb(type)}
              >
                <div className={`kb-card-icon-wrap ${colorClass}-icon`}>
                  <Icon size={22} />
                </div>
                <div className="kb-card-body">
                  <div className="kb-card-title">{t(`documents.kb.${type === 'report' ? 'report' : type}.label`)}</div>
                  <div className="kb-card-desc">{t(`documents.kb.${type === 'report' ? 'report' : type}.desc`)}</div>
                  <div className="kb-card-footer">
                    <span className={`kb-badge ${colorClass}-badge`}>{t(badgeKey)}</span>
                    <span className="kb-count">
                      {count} {count === 1 ? t('documents.docSingular') : t('documents.docPlural')}
                      {processing > 0 && (
                        <span className="kb-count-spin"><LoaderIcon size={10} className="icon-spin" /></span>
                      )}
                    </span>
                  </div>
                </div>
                {isActive && <span className="kb-card-check">✓</span>}
              </button>
            )
          })}
        </div>

        {/* ── Sub-tabs ── */}
        <div className="docs-tabs">
          {SUB_TABS.map(({ key, icon, labelKey }) => (
            <button
              key={key}
              className={`docs-tab ${subTab === key ? 'docs-tab--active' : ''}`}
              onClick={() => setSubTab(key)}
            >
              {icon}
              {t(labelKey)}
              {key === 'manage' && kbDocs.length > 0 && (
                <span className="docs-tab-badge">{kbDocs.length}</span>
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
          {subTab === 'manage' && (
            <ManageTab docs={kbDocs} loading={loading} onDeleted={handleDeleted} />
          )}
          {subTab === 'upload' && (
            <UploadTab kbType={activeKb} onUploaded={handleUploaded} />
          )}
          {subTab === 'history' && (
            <HistoryTab
              docs={kbDocs}
              loading={loading}
              openLogId={openLogId}
              onLogClose={() => setOpenLogId(null)}
            />
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
