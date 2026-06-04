import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UploadCloudIcon, FileTextIcon } from './Icons'

const ACCEPTED = ['.pdf', '.docx', '.doc']
const MAX_MB = 50

interface Props {
  uploading: boolean
  progress: number
  onFile: (file: File) => void
}

export default function UploadZone({ uploading, progress, onFile }: Props) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function validate(file: File): string | null {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ACCEPTED.includes(ext)) return t('documents.errorType')
    if (file.size > MAX_MB * 1024 * 1024) return t('documents.errorSize', { mb: MAX_MB })
    return null
  }

  function handleFiles(files: FileList | null) {
    if (!files?.length) return
    const file = files[0]
    const err = validate(file)
    if (err) { setError(err); return }
    setError(null)
    onFile(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="upload-section">
      <div
        className={`upload-zone ${dragging ? 'upload-zone--drag' : ''} ${uploading ? 'upload-zone--uploading' : ''}`}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />

        {uploading ? (
          <div className="upload-zone-inner">
            <div className="upload-spinner">
              <FileTextIcon size={32} />
            </div>
            <p className="upload-label">{t('documents.uploading')}</p>
            <div className="upload-progress-bar">
              <div className="upload-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="upload-pct">{progress}%</span>
          </div>
        ) : (
          <div className="upload-zone-inner">
            <div className="upload-icon-wrap">
              <UploadCloudIcon size={36} />
            </div>
            <p className="upload-label">
              <span className="upload-label-strong">{t('documents.dropzone')}</span>
            </p>
            <p className="upload-sublabel">{t('documents.dropzoneOr')}</p>
            <p className="upload-hint">{t('documents.dropzoneHint')}</p>
          </div>
        )}
      </div>

      {error && (
        <p className="upload-error">{error}</p>
      )}
    </div>
  )
}
