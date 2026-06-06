import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Document } from '../../lib/api'
import { FileTextIcon, TrashIcon, DownloadIcon, LoaderIcon, FolderOpenIcon, GraphNetworkIcon } from '../Icons'
import { formatGmt7DateTime } from '../../lib/datetime'
import DeleteDialog from './DeleteDialog'
import CypherPreviewDialog from './CypherPreviewDialog'

interface Props {
  docs: Document[]
  loading: boolean
  onDeleted: (id: number) => void
  onChanged?: () => void
}

interface PendingPreview {
  docId: number
  title: string
  cypher: string
}

function StatusBadge({ status }: { status: Document['status'] }) {
  const cls = {
    pending:       'doc-status--pending',
    processing:    'doc-status--processing',
    pending_graph: 'doc-status--processing',
    completed:     'doc-status--completed',
    failed:        'doc-status--failed',
  }[status] ?? ''
  const { t } = useTranslation()
  return <span className={`doc-status ${cls}`}>{t(`documents.status.${status}`, { defaultValue: status })}</span>
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

export default function ManageTab({ docs, loading, onDeleted, onChanged }: Props) {
  const { t } = useTranslation()
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmDoc, setConfirmDoc] = useState<Document | null>(null)
  const [activePreview, setActivePreview] = useState<PendingPreview | null>(null)
  const [loadingPreviewId, setLoadingPreviewId] = useState<number | null>(null)

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

  async function handleReviewGraph(doc: Document) {
    setLoadingPreviewId(doc.id)
    try {
      const preview = await api.documents.getCypherPreview(doc.id)
      setActivePreview({
        docId: doc.id,
        title: preview.title || doc.title,
        cypher: preview.cypher,
      })
    } finally {
      setLoadingPreviewId(null)
    }
  }

  function handlePreviewClosed() {
    setActivePreview(null)
    onChanged?.()
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
              {doc.status === 'pending_graph' && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void handleReviewGraph(doc)}
                  disabled={loadingPreviewId === doc.id}
                >
                  {loadingPreviewId === doc.id ? (
                    <LoaderIcon size={13} className="icon-spin" />
                  ) : (
                    <GraphNetworkIcon size={13} />
                  )}
                  {loadingPreviewId === doc.id ? t('documents.reviewingGraph') : t('documents.reviewGraph')}
                </button>
              )}
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

      {activePreview && (
        <CypherPreviewDialog
          docId={activePreview.docId}
          title={activePreview.title}
          initialCypher={activePreview.cypher}
          onCommit={handlePreviewClosed}
          onCancel={handlePreviewClosed}
        />
      )}
    </>
  )
}
