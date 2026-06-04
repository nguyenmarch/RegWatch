import { useTranslation } from 'react-i18next'
import { UploadCloudIcon, FileTextIcon } from '../Icons'

interface StagedFile {
  file: File
  id: string
}

interface Props {
  files: StagedFile[]
  onConfirm: () => void
  onCancel: () => void
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export default function UploadConfirmDialog({ files, onConfirm, onCancel }: Props) {
  const { t } = useTranslation()
  const total = files.reduce((s, f) => s + f.file.size, 0)

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog dialog--wide" onClick={e => e.stopPropagation()}>
        <div className="dialog-icon dialog-icon--primary">
          <UploadCloudIcon size={22} />
        </div>
        <h3 className="dialog-title">{t('documents.uploadDialogTitle', { count: files.length })}</h3>
        <p className="dialog-desc">{t('documents.uploadDialogDesc', { size: formatBytes(total) })}</p>

        <ul className="dialog-file-list">
          {files.map(({ id, file }) => (
            <li key={id} className="dialog-file-item">
              <FileTextIcon size={14} />
              <span className="dialog-file-name">{file.name}</span>
              <span className="dialog-file-size">{formatBytes(file.size)}</span>
            </li>
          ))}
        </ul>

        <div className="dialog-actions">
          <button className="btn btn-outline" onClick={onCancel}>{t('documents.deleteCancel')}</button>
          <button className="btn btn-primary" onClick={onConfirm}>
            <UploadCloudIcon size={14} />
            {t('documents.confirmUpload')}
          </button>
        </div>
      </div>
    </div>
  )
}
