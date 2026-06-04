import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Document } from '../../lib/api'
import { XIcon, LoaderIcon, CheckCircleIcon, AlertTriangleIcon, InfoIcon } from '../Icons'

interface LogEntry {
  level: 'info' | 'success' | 'error' | 'warn'
  message: string
  ts: string
}

interface Props {
  doc: Document
  onClose: () => void
}

function LevelIcon({ level }: { level: string }) {
  if (level === 'success') return <CheckCircleIcon size={13} />
  if (level === 'error')   return <AlertTriangleIcon size={13} />
  return <InfoIcon size={13} />
}

function levelCls(level: string) {
  if (level === 'success') return 'log-entry--success'
  if (level === 'error')   return 'log-entry--error'
  if (level === 'warn')    return 'log-entry--warn'
  return 'log-entry--info'
}

function formatTs(iso: string) {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
  catch { return iso }
}

export default function LogModal({ doc, onClose }: Props) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isActive = doc.status === 'pending' || doc.status === 'processing'

  async function fetchLog() {
    try {
      const data = await api.documents.getLog(doc.id)
      setEntries(data as LogEntry[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLog()
    if (!isActive) return
    const timer = setInterval(fetchLog, 2000)
    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, isActive])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog dialog--log" onClick={e => e.stopPropagation()}>

        <div className="dialog-header">
          <div className="dialog-header-info">
            <p className="dialog-header-title">{t('documents.logTitle')}</p>
            <p className="dialog-header-sub">{doc.title}</p>
          </div>
          <div className="dialog-header-actions">
            {isActive && <span className="log-live-badge"><LoaderIcon size={12} className="icon-spin" /> Live</span>}
            <button className="dialog-close" onClick={onClose}><XIcon size={18} /></button>
          </div>
        </div>

        <div className="log-body">
          {loading ? (
            <div className="log-loading"><LoaderIcon size={20} className="icon-spin" /></div>
          ) : entries.length === 0 ? (
            <p className="log-empty">{t('documents.logEmpty')}</p>
          ) : (
            entries.map((e, i) => (
              <div key={i} className={`log-entry ${levelCls(e.level)}`}>
                <span className="log-icon"><LevelIcon level={e.level} /></span>
                <span className="log-ts">{formatTs(e.ts)}</span>
                <span className="log-msg">{e.message}</span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

      </div>
    </div>
  )
}
