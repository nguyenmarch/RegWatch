import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type KbType } from '../../lib/api'
import { UploadCloudIcon, FileTextIcon, XIcon, LoaderIcon, CheckCircleIcon, AlertTriangleIcon } from '../Icons'
import UploadConfirmDialog from './UploadConfirmDialog'
import CypherPreviewDialog from './CypherPreviewDialog'

interface StagedFile {
  id: string
  file: File
  status: 'staged' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
  docId?: number
}

interface PendingPreview {
  docId: number
  title: string
  cypher: string
}

interface Props {
  onUploaded: (docIds: number[]) => void
  kbType: KbType
}

const ACCEPTED = ['.pdf', '.docx', '.doc', '.json', '.txt']
const MAX_MB = 50
let uid = 0

function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export default function UploadTab({ onUploaded, kbType }: Props) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [staged, setStaged] = useState<StagedFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Cypher preview flow
  const [previewQueue, setPreviewQueue] = useState<{ docId: number; title: string }[]>([])
  const [activePreview, setActivePreview] = useState<PendingPreview | null>(null)
  const [pollingId, setPollingId] = useState<number | null>(null)
  const uploadedIdsRef = useRef<number[]>([])
  const previewQueueRef = useRef(previewQueue)

  useEffect(() => {
    previewQueueRef.current = previewQueue
  }, [previewQueue])

  const addFiles = useCallback((files: File[]) => {
    const valid = files.filter(f => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase()
      return ACCEPTED.includes(ext) && f.size <= MAX_MB * 1024 * 1024
    })
    setStaged(prev => [
      ...prev,
      ...valid.map(f => ({ id: String(++uid), file: f, status: 'staged' as const, progress: 0 })),
    ])
  }, [])

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  function removeFile(id: string) {
    setStaged(prev => prev.filter(f => f.id !== id))
  }

  async function doUpload() {
    setShowConfirm(false)
    setUploading(true)
    uploadedIdsRef.current = []
    const pendingPreviews: { docId: number; title: string }[] = []

    for (const sf of staged) {
      setStaged(prev => prev.map(f => f.id === sf.id ? { ...f, status: 'uploading' } : f))
      try {
        const res = await api.documents.upload(sf.file, kbType, pct =>
          setStaged(prev => prev.map(f => f.id === sf.id ? { ...f, progress: pct } : f))
        )
        uploadedIdsRef.current.push(res.id)
        setStaged(prev => prev.map(f => f.id === sf.id
          ? { ...f, status: 'done', progress: 100, docId: res.id } : f
        ))
        if (kbType === 'law') {
          pendingPreviews.push({ docId: res.id, title: res.title })
        }
      } catch (err) {
        setStaged(prev => prev.map(f => f.id === sf.id
          ? { ...f, status: 'error', error: err instanceof Error ? err.message : 'Failed' } : f
        ))
      }
    }

    setUploading(false)

    if (kbType === 'law' && pendingPreviews.length > 0) {
      // Queue for sequential preview dialogs; first one triggers polling
      setPreviewQueue(pendingPreviews)
      setPollingId(pendingPreviews[0].docId)
    } else if (uploadedIdsRef.current.length > 0) {
      onUploaded(uploadedIdsRef.current)
    }
  }

  // Poll until a queued doc reaches pending_graph or fails
  useEffect(() => {
    if (pollingId === null) return
    let stopped = false
    const poll = async () => {
      try {
        const doc = await api.documents.getById(pollingId)
        if (doc.status === 'pending_graph') {
          const preview = await api.documents.getCypherPreview(pollingId)
          if (stopped) return
          const queued = previewQueueRef.current.find(p => p.docId === pollingId)
          setActivePreview({
            docId: pollingId,
            title: queued?.title ?? doc.title,
            cypher: preview.cypher,
          })
          setPollingId(null)
        } else if (doc.status === 'failed') {
          if (stopped) return
          setPollingId(null)
          advancePreviewQueue()
        }
      } catch { /* network blip — keep polling */ }
    }
    void poll()
    const intervalId = setInterval(poll, 2000)
    return () => {
      stopped = true
      clearInterval(intervalId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingId])

  function advancePreviewQueue() {
    setPreviewQueue(prev => {
      const next = prev.slice(1)
      if (next.length > 0) {
        setPollingId(next[0].docId)
      } else {
        // All previews handled — notify parent
        if (uploadedIdsRef.current.length > 0) {
          onUploaded(uploadedIdsRef.current)
        }
      }
      return next
    })
  }

  function handleCommit() {
    setActivePreview(null)
    advancePreviewQueue()
  }

  function handleCancelPreview() {
    setActivePreview(null)
    // Remove the cancelled doc from uploaded ids
    if (activePreview) {
      uploadedIdsRef.current = uploadedIdsRef.current.filter(id => id !== activePreview.docId)
      setStaged(prev => prev.map(f =>
        f.docId === activePreview.docId ? { ...f, status: 'error', error: 'Upload cancelled' } : f
      ))
    }
    advancePreviewQueue()
  }

  const readyCount = staged.filter(f => f.status === 'staged').length
  const allDone = staged.length > 0 && staged.every(f => f.status === 'done' || f.status === 'error')
  const waitingForPreview = previewQueue.length > 0 && !activePreview

  return (
    <div className="upload-tab">
      {/* Drop zone */}
      <div
        className={`upload-zone ${dragging ? 'upload-zone--drag' : ''} ${uploading ? 'upload-zone--uploading' : ''}`}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED.join(',')}
          style={{ display: 'none' }}
          onChange={e => addFiles(Array.from(e.target.files ?? []))}
        />
        <div className="upload-zone-inner">
          <div className="upload-icon-wrap"><UploadCloudIcon size={32} /></div>
          <p className="upload-label">
            <span className="upload-label-strong">{t('documents.dropzone')}</span>
          </p>
          <p className="upload-sublabel">{t('documents.dropzoneOr')}</p>
          <p className="upload-hint">{t('documents.dropzoneHint')}</p>
        </div>
      </div>

      {/* Staged file list */}
      {staged.length > 0 && (
        <div className="staged-list">
          {staged.map(sf => (
            <div key={sf.id} className={`staged-row staged-row--${sf.status}`}>
              <div className="staged-icon">
                {sf.status === 'done' && <CheckCircleIcon size={16} />}
                {sf.status === 'error' && <AlertTriangleIcon size={16} />}
                {sf.status === 'uploading' && <LoaderIcon size={16} className="icon-spin" />}
                {sf.status === 'staged' && <FileTextIcon size={16} />}
              </div>
              <div className="staged-info">
                <p className="staged-name">{sf.file.name}</p>
                {sf.status === 'uploading' && (
                  <div className="staged-progress-bar">
                    <div className="staged-progress-fill" style={{ width: `${sf.progress}%` }} />
                  </div>
                )}
                {sf.status === 'error' && <p className="staged-error">{sf.error}</p>}
                {sf.status === 'staged' && <p className="staged-size">{formatBytes(sf.file.size)}</p>}
                {sf.status === 'done' && !waitingForPreview && (
                  <p className="staged-done">{t('documents.toast.uploadSuccess')}</p>
                )}
                {sf.status === 'done' && waitingForPreview && sf.docId === previewQueue[0]?.docId && (
                  <p className="staged-done" style={{ color: '#f59e0b' }}>
                    <LoaderIcon size={11} className="icon-spin" style={{ marginRight: 4 }} />
                    Generating Cypher graph…
                  </p>
                )}
              </div>
              {sf.status === 'staged' && (
                <button className="staged-remove" onClick={() => removeFile(sf.id)}>
                  <XIcon size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action bar */}
      {staged.length > 0 && !allDone && (
        <div className="upload-action-bar">
          <button className="btn btn-outline" onClick={() => setStaged([])} disabled={uploading}>
            {t('documents.clearAll')}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowConfirm(true)}
            disabled={uploading || readyCount === 0}
          >
            {uploading
              ? <><LoaderIcon size={14} className="icon-spin" />{t('documents.uploading')}</>
              : <><UploadCloudIcon size={14} />{t('documents.uploadBtn')} ({readyCount})</>
            }
          </button>
        </div>
      )}

      {showConfirm && (
        <UploadConfirmDialog
          files={staged.filter(f => f.status === 'staged')}
          onConfirm={doUpload}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* Cypher preview dialog (shown after staging pipeline completes) */}
      {activePreview && (
        <CypherPreviewDialog
          docId={activePreview.docId}
          title={activePreview.title}
          initialCypher={activePreview.cypher}
          onCommit={handleCommit}
          onCancel={handleCancelPreview}
        />
      )}
    </div>
  )
}
