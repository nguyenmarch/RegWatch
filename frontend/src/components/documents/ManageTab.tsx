import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Document } from '../../lib/api'
import { FileTextIcon, TrashIcon, DownloadIcon, LoaderIcon, FolderOpenIcon } from '../Icons'
import { formatGmt7DateTime } from '../../lib/datetime'
import DeleteDialog from './DeleteDialog'

interface Props {
  docs: Document[]
  loading: boolean
  onDeleted: (id: number) => void
}

function StatusBadge({ status }: { status: Document['status'] }) {
  const cls = {
    pending:    'doc-status--pending',
    processing: 'doc-status--processing',
    completed:  'doc-status--completed',
    failed:     'doc-status--failed',
  }[status] ?? ''
  return <span className={`doc-status ${cls}`}>{status}</span>
}

function SkeletonRow() {
  return (
    <div className="doc-row doc-row--skeleton">
      <div className="sk" style={{ width: 32, height: 32, borderRadius: 8 }} />
      <div style={{ flex: 1 }}>
        <div className="sk sk-title" style={{ marginBottom: 6 }} />
        <div className="sk sk-xs" style={{ width: 80 }} />
      </div>
    </div>
  )
}

export default function ManageTab({ docs, loading, onDeleted }: Props) {
  const { t } = useTranslation()
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmDoc, setConfirmDoc] = useState<Document | null>(null)

  async function handleDelete() {
    if (!confirmDoc) return
    setDeletingId(confirmDoc.id)
    try {
      await api.documents.delete(confirmDoc.id)
      onDeleted(confirmDoc.id)
    } finally {
      setDeletingId(null)
      setConfirmDoc(null)
    }
  }

  if (loading) return (
    <div className="doc-list">
      {[1,2,3].map(i => <SkeletonRow key={i} />)}
    </div>
  )

  if (docs.length === 0) return (
    <div className="docs-empty">
      <div className="docs-empty-icon"><FolderOpenIcon size={36} /></div>
      <h3 className="docs-empty-title">{t('documents.empty')}</h3>
      <p className="docs-empty-hint">{t('documents.emptyHint')}</p>
    </div>
  )

  return (
    <>
      <div className="doc-list">
        {docs.map(doc => (
          <div key={doc.id} className="doc-row">
            <div className="doc-row-icon">
              <FileTextIcon size={18} />
            </div>
            <div className="doc-row-info">
              <p className="doc-row-title">{doc.title}</p>
              <div className="doc-row-meta">
                <StatusBadge status={doc.status} />
                <span className="doc-row-date">
                  {formatGmt7DateTime(doc.created_at)}
                </span>
              </div>
            </div>
            <div className="doc-row-actions">
              {doc.file_path && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => api.documents.download(doc.id, doc.title)}
                >
                  <DownloadIcon size={13} />
                  {t('documents.download')}
                </button>
              )}
              <button
                className="btn btn-sm doc-delete-btn"
                onClick={() => setConfirmDoc(doc)}
                disabled={deletingId === doc.id}
              >
                {deletingId === doc.id
                  ? <LoaderIcon size={13} className="icon-spin" />
                  : <TrashIcon size={13} />
                }
                {t('documents.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirmDoc && (
        <DeleteDialog
          docTitle={confirmDoc.title}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDoc(null)}
          loading={deletingId === confirmDoc.id}
        />
      )}
    </>
  )
}
