import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
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

interface Endpoint {
  key: string
  method: string
  label: string
  url: string
  description: string
  external?: boolean
}

const ENDPOINTS: Endpoint[] = [
  {
    key: 'health',
    method: 'GET',
    label: '/health',
    url: '/api/health',
    description: 'Service liveness check — returns {"status":"ok","service":"RegWatch"}',
  },
  {
    key: 'swagger',
    method: 'GET',
    label: '/docs',
    url: 'http://localhost:8000/docs',
    description: 'Swagger UI — interactive OpenAPI documentation for all endpoints',
    external: true,
  },
]

const initialResults: Record<string, EndpointResult> = Object.fromEntries(
  ENDPOINTS.map(e => [e.key, { status: 'idle' }]),
)

function StatusIndicator({ status }: { status: Status }) {
  if (status === 'loading') return <LoaderIcon size={16} className="icon-spin" />
  if (status === 'ok')      return <CheckCircleIcon size={16} />
  if (status === 'error')   return <XCircleIcon size={16} />
  return null
}

function statusColor(s: Status) {
  if (s === 'ok')      return 'var(--emerald)'
  if (s === 'error')   return 'var(--rose)'
  if (s === 'loading') return 'var(--amber)'
  return 'var(--text-3)'
}

export default function TestHealth() {
  const [results, setResults] = useState<Record<string, EndpointResult>>(initialResults)
  const [runningAll, setRunningAll] = useState(false)

  const runEndpoint = useCallback(async (key: string, url: string, external?: boolean) => {
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
        [key]: {
          status: 'error',
          error: err instanceof Error ? err.message : 'Network error - is the backend running?',
        },
      }))
    }
  }, [])

  const runAll = useCallback(async () => {
    setRunningAll(true)
    await Promise.all(
      ENDPOINTS.filter(e => !e.external).map(e => runEndpoint(e.key, e.url)),
    )
    setRunningAll(false)
  }, [runEndpoint])

  const resetAll = () => setResults(initialResults)

  const passCount = ENDPOINTS.filter(e => !e.external && results[e.key].status === 'ok').length
  const totalTestable = ENDPOINTS.filter(e => !e.external).length
  const hasRun = ENDPOINTS.some(e => !e.external && results[e.key].status !== 'idle')

  return (
    <div className="th-page">
      <div className="container">

        {/* ── Page header ── */}
        <div className="th-header">
          <div>
            <Link to="/" className="th-back">
              <ArrowLeftIcon size={14} />
              Back to Home
            </Link>
            <h1 className="th-title">API Health Test</h1>
            <p className="th-subtitle">
              Ping RegWatch backend endpoints and inspect live responses.
              The Vite dev server proxies <code>/api/*</code> to{' '}
              <code>localhost:8000</code>.
            </p>
          </div>

          <div className="th-actions">
            {hasRun && (
              <div className="th-score" style={{ color: passCount === totalTestable ? 'var(--emerald)' : 'var(--rose)' }}>
                <ActivityIcon size={15} />
                {passCount}/{totalTestable} passing
              </div>
            )}
            <button className="btn btn-outline btn-sm" onClick={resetAll} disabled={runningAll}>
              <RefreshIcon size={14} />
              Reset
            </button>
            <button
              className="btn btn-primary"
              onClick={runAll}
              disabled={runningAll}
            >
              {runningAll
                ? <><LoaderIcon size={15} className="icon-spin" /> Running...</>
                : <><PlayIcon size={15} /> Run all tests</>
              }
            </button>
          </div>
        </div>

        {/* ── Endpoint list ── */}
        <div className="th-list">
          {ENDPOINTS.map(ep => {
            const r = results[ep.key]
            const statusCls = r.status === 'ok' ? 'th-card--ok' : r.status === 'error' ? 'th-card--error' : r.status === 'loading' ? 'th-card--loading' : ''
            return (
              <div key={ep.key} className={`th-card ${statusCls}`}>
                <div className="th-card-strip" />
                <div className="th-card-body">
                  <div className="th-card-top">
                    <div className="th-endpoint-info">
                      <span className="th-method">{ep.method}</span>
                      <span className="th-url">{ep.label}</span>
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
                        onClick={() => runEndpoint(ep.key, ep.url, ep.external)}
                        disabled={r.status === 'loading'}
                      >
                        {ep.external
                          ? <><ExternalLinkIcon size={13} />Open</>
                          : r.status === 'loading'
                            ? <><LoaderIcon size={13} className="icon-spin" />Testing...</>
                            : <><PlayIcon size={13} />Test</>
                        }
                      </button>
                    </div>
                  </div>

                  <p className="th-desc">{ep.description}</p>

                  {r.data !== undefined && (
                    <pre className="th-json">
                      <span style={{ color: 'var(--text-3)' }}>// response body{'\n'}</span>
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
          <div className="th-info-icon">
            <InfoIcon size={18} />
          </div>
          <div className="th-info-content">
            <strong>Backend not responding?</strong>
            <p>Start the FastAPI server from the <code>backend/</code> directory:</p>
            <pre className="th-json th-json--cmd">
              <span style={{ color: 'var(--emerald)' }}>$ </span>uvicorn app.main:app --reload --port 8000
            </pre>
            <p style={{ marginTop: 8 }}>Or spin up the full stack with Docker:</p>
            <pre className="th-json th-json--cmd">
              <span style={{ color: 'var(--emerald)' }}>$ </span>docker compose up -d --build
            </pre>
          </div>
        </div>

        {/* ── Quick links ── */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
            <ExternalLinkIcon size={13} />
            Swagger UI
          </a>
          <a href="http://localhost:7474" target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
            <ServerIcon size={13} />
            Neo4j Browser
          </a>
          <a href="http://localhost:6336/dashboard" target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
            <TerminalIcon size={13} />
            Qdrant Dashboard
          </a>
        </div>

      </div>
    </div>
  )
}
