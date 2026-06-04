import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Document } from '../lib/api'
import {
  FileTextIcon, TrashIcon, LoaderIcon,
  CheckCircleIcon, ClockIcon, AlertTriangleIcon, XCircleIcon,
} from './Icons'

interface Props {
  doc: Document
  onDelete: (id: number) => Promise<void>
}

function StatusBadge({ status }: { status: Document['status'] }) {
  const { t } = useTranslation()
  const config = {
    pending:    { cls: 'doc-status--pending',    Icon: ClockIcon,         spin: false },
    processing: { cls: 'doc-status--processing', Icon: LoaderIcon,        spin: true  },
    completed:  { cls: 'doc-status--completed',  Icon: CheckCircleIcon,   spin: false },
    failed:     { cls: 'doc-status--failed',     Icon: AlertTriangleIcon, spin: false },
  }[status]

  return (
    <span className={`doc-status ${config.cls}`}>
      <config.Icon size={12} className={config.spin ? 'icon-spin' : undefined} />
      {t(`documents.status.${status}`)}
    </span>
  )
}

function FileExtBadge({ path }: { path: string | null }) {
  const ext = path?.split('.').pop()?.toUpperCase() ?? 'FILE'
  const cls = ext === 'PDF' ? 'ext-pdf' : ext === 'DOCX' || ext === 'DOC' ? 'ext-docx' : 'ext-other'
  return <span className={`doc-ext ${cls}`}>{ext}</span>
}

function formatDate(iso: string, lang: string) {
  return new Date(iso).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export default function DocumentCard({ doc, onDelete }: Props) {
  const { t, i18n } = useTranslation()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [leaving, setLeaving] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      setLeaving(true)
      await new Promise(r => setTimeout(r, 200))
      await onDelete(doc.id)
    } finally {
      setDeleting(false)
      setLeaving(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className={`doc-card ${leaving ? 'doc-card--leaving' : ''}`}>
      {/* Status strip */}
      <div className={`doc-card-strip doc-strip--${doc.status}`} />

      <div className="doc-card-body">
        {/* Top row */}
        <div className="doc-card-top">
          <div className="doc-card-icon">
            <FileTextIcon size={20} />
            <FileExtBadge path={doc.file_path} />
          </div>
          <StatusBadge status={doc.status} />
        </div>

        {/* Title */}
        <h3 className="doc-card-title" title={doc.title}>{doc.title}</h3>

        {/* Meta */}
        <p className="doc-card-date">{formatDate(doc.created_at, i18n.language)}</p>

        {/* Delete action */}
        <div className="doc-card-footer">
          {confirmDelete ? (
            <div className="doc-delete-confirm">
              <span className="doc-delete-label">{t('documents.deleteConfirm')}</span>
              <button
                className="btn btn-outline btn-sm doc-cancel-btn"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                {t('documents.deleteCancel')}
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting
                  ? <LoaderIcon size={13} className="icon-spin" />
                  : <><TrashIcon size={13} />{t('documents.deleteYes')}</>
                }
              </button>
            </div>
          ) : (
            <button
              className="btn btn-ghost btn-sm doc-delete-btn"
              onClick={() => setConfirmDelete(true)}
            >
              <TrashIcon size={14} />
              {t('documents.delete')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
