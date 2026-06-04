import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Document } from '../lib/api'
import UploadZone from '../components/UploadZone'
import DocumentCard from '../components/DocumentCard'
import { FolderOpenIcon, PlusIcon, RefreshIcon, LoaderIcon } from '../components/Icons'

type Toast = { id: number; type: 'success' | 'error'; msg: string }

let toastId = 0

function SkeletonCard() {
  return (
    <div className="doc-card doc-card--skeleton">
      <div className="doc-card-strip" style={{ background: 'var(--bg-3)' }} />
      <div className="doc-card-body">
        <div className="sk sk-sm" />
        <div className="sk sk-title" />
        <div className="sk sk-xs" />
      </div>
    </div>
  )
}

export default function Documents() {
  const { t } = useTranslation()
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])

  function addToast(type: Toast['type'], msg: string) {
    const id = ++toastId
    setToasts(prev => [...prev, { id, type, msg }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }

  const fetchDocs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await api.documents.list()
      setDocs(data)
    } catch {
      if (!silent) addToast('error', t('documents.toast.fetchError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  // Poll while any doc is processing
  useEffect(() => {
    const active = docs.some(d => d.status === 'pending' || d.status === 'processing')
    if (!active) return
    const timer = setInterval(() => fetchDocs(true), 3000)
    return () => clearInterval(timer)
  }, [docs, fetchDocs])

  async function handleUpload(file: File) {
    setUploading(true)
    setUploadProgress(0)
    try {
      await api.documents.upload(file, setUploadProgress)
      addToast('success', t('documents.toast.uploadSuccess'))
      await fetchDocs(true)
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : t('documents.toast.uploadError'))
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  async function handleDelete(id: number) {
    await api.documents.delete(id)
    setDocs(prev => prev.filter(d => d.id !== id))
    addToast('success', t('documents.toast.deleteSuccess'))
  }

  const processingCount = docs.filter(d => d.status === 'pending' || d.status === 'processing').length

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
            <button className="btn btn-primary btn-sm" onClick={() => document.getElementById('upload-trigger')?.click()}>
              <PlusIcon size={15} />
              {t('documents.uploadBtn')}
            </button>
          </div>
        </div>

        {/* ── Upload zone ── */}
        <div id="upload-trigger" style={{ display: 'none' }} />
        <UploadZone
          uploading={uploading}
          progress={uploadProgress}
          onFile={handleUpload}
        />

        {/* ── Document count ── */}
        {!loading && docs.length > 0 && (
          <div className="docs-count">
            <span>{t('documents.count', { count: docs.length })}</span>
            <div className="docs-count-bar" />
          </div>
        )}

        {/* ── Grid ── */}
        {loading ? (
          <div className="docs-grid">
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : docs.length === 0 ? (
          <div className="docs-empty">
            <div className="docs-empty-icon">
              <FolderOpenIcon size={40} />
            </div>
            <h3 className="docs-empty-title">{t('documents.empty')}</h3>
            <p className="docs-empty-hint">{t('documents.emptyHint')}</p>
          </div>
        ) : (
          <div className="docs-grid">
            {docs.map(doc => (
              <DocumentCard key={doc.id} doc={doc} onDelete={handleDelete} />
            ))}
          </div>
        )}

      </div>

      {/* ── Toasts ── */}
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
