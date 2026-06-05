import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { UploadCloudIcon, FileTextIcon, XIcon, LoaderIcon, CheckCircleIcon, AlertTriangleIcon } from '../Icons'
import UploadConfirmDialog from './UploadConfirmDialog'

interface StagedFile {
  id: string
  file: File
  status: 'staged' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
  docId?: number
}

interface Props {
  onUploaded: (docIds: number[]) => void
}

const ACCEPTED = ['.pdf', '.docx', '.doc']
const MAX_MB = 50
let uid = 0

function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export default function UploadTab({ onUploaded }: Props) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [staged, setStaged] = useState<StagedFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [uploading, setUploading] = useState(false)

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
    const uploadedIds: number[] = []

    for (const sf of staged) {
      setStaged(prev => prev.map(f => f.id === sf.id ? { ...f, status: 'uploading' } : f))
      try {
        const res = await api.documents.upload(sf.file, pct =>
          setStaged(prev => prev.map(f => f.id === sf.id ? { ...f, progress: pct } : f))
        )
        uploadedIds.push(res.id)
        setStaged(prev => prev.map(f => f.id === sf.id
          ? { ...f, status: 'done', progress: 100, docId: res.id } : f
        ))
      } catch (err) {
        setStaged(prev => prev.map(f => f.id === sf.id
          ? { ...f, status: 'error', error: err instanceof Error ? err.message : 'Failed' } : f
        ))
      }
    }

    setUploading(false)
    if (uploadedIds.length > 0) onUploaded(uploadedIds)
  }

  const readyCount = staged.filter(f => f.status === 'staged').length
  const allDone = staged.length > 0 && staged.every(f => f.status === 'done' || f.status === 'error')

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
                {sf.status === 'done'      && <CheckCircleIcon size={16} />}
                {sf.status === 'error'     && <AlertTriangleIcon size={16} />}
                {sf.status === 'uploading' && <LoaderIcon size={16} className="icon-spin" />}
                {sf.status === 'staged'    && <FileTextIcon size={16} />}
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
                {sf.status === 'done' && <p className="staged-done">{t('documents.toast.uploadSuccess')}</p>}
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
    </div>
  )
}
