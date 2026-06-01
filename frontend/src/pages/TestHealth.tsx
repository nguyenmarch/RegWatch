import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeftIcon, PlayIcon, RefreshIcon, CheckCircleIcon,
  XCircleIcon, LoaderIcon, ExternalLinkIcon, InfoIcon,
  ActivityIcon, ServerIcon, TerminalIcon,
} from '../components/Icons'

type Status = 'idle' | 'loading' | 'ok' | 'error'

interface EndpointResult {
  status: Status
  statusCode?: number
  latency?: number
  data?: unknown
  error?: string
}

const ENDPOINT_KEYS = ['health', 'swagger'] as const
type EndpointKey = typeof ENDPOINT_KEYS[number]

const ENDPOINT_CONFIG: Record<EndpointKey, { method: string; url: string; external?: boolean }> = {
  health:  { method: 'GET', url: '/api/health' },
  swagger: { method: 'GET', url: 'http://localhost:8000/docs', external: true },
}

const initialResults: Record<EndpointKey, EndpointResult> = {
  health:  { status: 'idle' },
  swagger: { status: 'idle' },
}

function statusColor(s: Status) {
  if (s === 'ok')      return 'var(--emerald)'
  if (s === 'error')   return 'var(--rose)'
  if (s === 'loading') return 'var(--amber)'
  return 'var(--text-3)'
}

function StatusIndicator({ status }: { status: Status }) {
  if (status === 'loading') return <LoaderIcon size={15} className="icon-spin" />
  if (status === 'ok')      return <CheckCircleIcon size={15} />
  if (status === 'error')   return <XCircleIcon size={15} />
  return null
}

export default function TestHealth() {
  const { t } = useTranslation()
  const [results, setResults] = useState<Record<EndpointKey, EndpointResult>>(initialResults)
  const [runningAll, setRunningAll] = useState(false)

  const runEndpoint = useCallback(async (key: EndpointKey) => {
    const { url, external } = ENDPOINT_CONFIG[key]
    if (external) { window.open(url, '_blank'); return }

    setResults(prev => ({ ...prev, [key]: { status: 'loading' } }))
    const t0 = performance.now()
    try {
      const res = await fetch(url)
      const latency = Math.round(performance.now() - t0)
      const data = await res.json().catch(() => null)
      setResults(prev => ({
        ...prev,
        [key]: { status: res.ok ? 'ok' : 'error', statusCode: res.status, latency, data },
      }))
    } catch (err) {
      setResults(prev => ({
        ...prev,
        [key]: { status: 'error', error: err instanceof Error ? err.message : 'Network error' },
      }))
    }
  }, [])

  const runAll = useCallback(async () => {
    setRunningAll(true)
    await Promise.all(
      ENDPOINT_KEYS.filter(k => !ENDPOINT_CONFIG[k].external).map(k => runEndpoint(k)),
    )
    setRunningAll(false)
  }, [runEndpoint])

  const passCount = ENDPOINT_KEYS.filter(k => !ENDPOINT_CONFIG[k].external && results[k].status === 'ok').length
  const totalTestable = ENDPOINT_KEYS.filter(k => !ENDPOINT_CONFIG[k].external).length
  const hasRun = ENDPOINT_KEYS.some(k => !ENDPOINT_CONFIG[k].external && results[k].status !== 'idle')

  return (
    <div className="th-page">
      <div className="container">

        {/* ── Page header ── */}
        <div className="th-header">
          <div>
            <Link to="/" className="th-back">
              <ArrowLeftIcon size={14} />
              {t('testHealth.back')}
            </Link>
            <h1 className="th-title">{t('testHealth.title')}</h1>
            <p className="th-subtitle">{t('testHealth.subtitle')}</p>
          </div>

          <div className="th-actions">
            {hasRun && (
              <div className="th-score" style={{ color: passCount === totalTestable ? 'var(--emerald)' : 'var(--rose)' }}>
                <ActivityIcon size={15} />
                {passCount}/{totalTestable} {t('testHealth.passing')}
              </div>
            )}
            <button className="btn btn-outline btn-sm" onClick={() => setResults(initialResults)} disabled={runningAll}>
              <RefreshIcon size={14} />
              {t('testHealth.reset')}
            </button>
            <button className="btn btn-primary" onClick={runAll} disabled={runningAll}>
              {runningAll
                ? <><LoaderIcon size={15} className="icon-spin" />{t('testHealth.running')}</>
                : <><PlayIcon size={15} />{t('testHealth.runAll')}</>
              }
            </button>
          </div>
        </div>

        {/* ── Endpoint list ── */}
        <div className="th-list">
          {ENDPOINT_KEYS.map(key => {
            const r = results[key]
            const cfg = ENDPOINT_CONFIG[key]
            const statusCls =
              r.status === 'ok'      ? 'th-card--ok' :
              r.status === 'error'   ? 'th-card--error' :
              r.status === 'loading' ? 'th-card--loading' : ''

            return (
              <div key={key} className={`th-card ${statusCls}`}>
                <div className="th-card-strip" />
                <div className="th-card-body">
                  <div className="th-card-top">
                    <div className="th-endpoint-info">
                      <span className="th-method">{cfg.method}</span>
                      <span className="th-url">{t(`testHealth.endpoints.${key}.label`)}</span>
                      {r.status !== 'idle' && (
                        <span
                          className={`th-badge badge-${r.status}`}
                          style={{ color: statusColor(r.status), display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        >
                          <StatusIndicator status={r.status} />
                          {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                        </span>
                      )}
                    </div>

                    <div className="th-card-meta">
                      {r.latency !== undefined && (
                        <span className="th-latency">{r.latency} ms</span>
                      )}
                      {r.statusCode !== undefined && (
                        <span className={`th-code ${r.statusCode < 400 ? 'th-code--ok' : 'th-code--err'}`}>
                          {r.statusCode}
                        </span>
                      )}
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => runEndpoint(key)}
                        disabled={r.status === 'loading'}
                      >
                        {cfg.external
                          ? <><ExternalLinkIcon size={13} />{t('testHealth.open')}</>
                          : r.status === 'loading'
                            ? <><LoaderIcon size={13} className="icon-spin" />{t('testHealth.testing')}</>
                            : <><PlayIcon size={13} />{t('testHealth.test')}</>
                        }
                      </button>
                    </div>
                  </div>

                  <p className="th-desc">{t(`testHealth.endpoints.${key}.desc`)}</p>

                  {r.data !== undefined && (
                    <pre className="th-json">
                      <span style={{ color: 'var(--text-3)' }}>{'// response body\n'}</span>
                      {JSON.stringify(r.data, null, 2)}
                    </pre>
                  )}
                  {r.error && (
                    <div className="th-error-msg">
                      <XCircleIcon size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                      {r.error}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Info panel ── */}
        <div className="th-info-box">
          <div className="th-info-icon"><InfoIcon size={18} /></div>
          <div className="th-info-content">
            <strong>{t('testHealth.infoTitle')}</strong>
            <p>{t('testHealth.infoDesc1')}</p>
            <pre className="th-json th-json--cmd">
              <span style={{ color: 'var(--emerald)' }}>$ </span>uvicorn app.main:app --reload --port 8000
            </pre>
            <p style={{ marginTop: 8 }}>{t('testHealth.infoDesc2')}</p>
            <pre className="th-json th-json--cmd">
              <span style={{ color: 'var(--emerald)' }}>$ </span>docker compose up -d --build
            </pre>
          </div>
        </div>

        {/* ── Quick links ── */}
        <div className="th-quick-links">
          <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
            <ExternalLinkIcon size={13} />{t('testHealth.quickSwagger')}
          </a>
          <a href="http://localhost:7474" target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
            <ServerIcon size={13} />{t('testHealth.quickNeo4j')}
          </a>
          <a href="http://localhost:6336/dashboard" target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
            <TerminalIcon size={13} />{t('testHealth.quickQdrant')}
          </a>
        </div>

      </div>
    </div>
  )
}
