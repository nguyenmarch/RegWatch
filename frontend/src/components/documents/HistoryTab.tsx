import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type Document } from '../../lib/api'
import { FileTextIcon, ScrollTextIcon, LoaderIcon, FolderOpenIcon, CheckCircleIcon, AlertTriangleIcon, ClockIcon } from '../Icons'
import { formatGmt7DateTime } from '../../lib/datetime'
import LogModal from './LogModal'

interface Props {
  docs: Document[]
  loading: boolean
  openLogId: number | null
  onLogClose: () => void
}

function StatusIcon({ status }: { status: Document['status'] }) {
  if (status === 'completed') return <CheckCircleIcon size={14} />
  if (status === 'failed') return <AlertTriangleIcon size={14} />
  if (status === 'processing') return <LoaderIcon size={14} className="icon-spin" />
  return <ClockIcon size={14} />
}

function statusCls(status: Document['status']) {
  return {
    pending: 'doc-status--pending',
    processing: 'doc-status--processing',
    completed: 'doc-status--completed',
    failed: 'doc-status--failed',
  }[status] ?? ''
}

export default function HistoryTab({ docs, loading, openLogId, onLogClose }: Props) {
  const { t } = useTranslation()
  const [viewLogDoc, setViewLogDoc] = useState<Document | null>(null)

  const logDoc = viewLogDoc ?? (openLogId ? docs.find(d => d.id === openLogId) ?? null : null)

  if (loading) return (
    <div className="doc-list">
      {[1, 2, 3].map(i => (
        <div key={i} className="doc-row doc-row--skeleton">
          <div className="sk" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <div style={{ flex: 1 }}>
            <div className="sk sk-title" style={{ marginBottom: 6 }} />
            <div className="sk sk-xs" style={{ width: 100 }} />
          </div>
        </div>
      ))}
    </div>
  )

  if (docs.length === 0) return (
    <div className="docs-empty">
      <div className="docs-empty-icon"><FolderOpenIcon size={36} /></div>
      <h3 className="docs-empty-title">{t('documents.historyEmpty')}</h3>
      <p className="docs-empty-hint">{t('documents.historyEmptyHint')}</p>
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
                <span className={`doc-status ${statusCls(doc.status)}`}>
                  <StatusIcon status={doc.status} />
                  {t(`documents.status.${doc.status}`)}
                </span>
                <span className="doc-row-date">
                  {formatGmt7DateTime(doc.created_at)}
                </span>
              </div>
            </div>
            <div className="doc-row-actions">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setViewLogDoc(doc)}
              >
                <ScrollTextIcon size={13} />
                {t('documents.viewLog')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {logDoc && (
        <LogModal
          doc={logDoc}
          onClose={() => { setViewLogDoc(null); onLogClose() }}
        />
      )}
    </>
  )
}
