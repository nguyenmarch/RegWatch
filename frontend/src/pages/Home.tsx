import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  SearchIcon, VectorIcon, GraphNetworkIcon, SparklesIcon,
  WorkflowIcon, ArrowRightIcon, ExternalLinkIcon, GithubIcon,
  DatabaseIcon, LayersIcon, ActivityIcon,
} from '../components/Icons'

const FEATURES = [
  {
    icon: <VectorIcon size={24} />,
    iconClass: 'fi-emerald',
    badge: 'Qdrant',
    title: 'Vector Semantic Search',
    desc: 'Qdrant-powered dense vector search using Google text-embedding-004 (768-dim). Retrieve the most relevant legal clauses across your entire corpus in milliseconds.',
  },
  {
    icon: <GraphNetworkIcon size={24} />,
    iconClass: 'fi-violet',
    badge: 'Neo4j',
    title: 'Knowledge Graph',
    desc: 'Neo4j maps relationships between laws - REFERENCES, AMENDS, SUPERSEDES, IMPLEMENTS. Multi-hop traversal surfaces indirect dependencies humans miss.',
  },
  {
    icon: <SparklesIcon size={24} />,
    iconClass: 'fi-indigo',
    badge: 'Gemini 2.5F',
    title: 'AI Answer Synthesis',
    desc: 'Gemini 2.5 Flash receives both vector context and graph context, then synthesises a precise, grounded answer with inline citations to the source regulations.',
  },
  {
    icon: <WorkflowIcon size={24} />,
    iconClass: 'fi-cyan',
    badge: 'LangGraph',
    title: 'Stateful RAG Pipeline',
    desc: 'A deterministic LangGraph state machine orchestrates every query step. Each node is observable, retryable, and independently testable.',
  },
]

const STATS = [
  { icon: <DatabaseIcon size={18} />, value: '3', label: 'Database layers', sub: 'MySQL · Qdrant · Neo4j' },
  { icon: <SparklesIcon size={18} />, value: '2.5F', label: 'Gemini model', sub: 'Flash - fast & accurate' },
  { icon: <LayersIcon size={18} />, value: 'REST', label: 'API standard', sub: 'FastAPI + OpenAPI docs' },
  { icon: <GraphNetworkIcon size={18} />, value: '4', label: 'Graph relations', sub: 'Legal cross-references' },
]

const SAMPLES = [
  'Capital adequacy requirements under Circular 41/2016/TT-NHNN?',
  'How does Decree 13/2023 amend data protection for banks?',
  'AML regulations in Vietnamese fintech?',
]

const PIPE_NODES = [
  { cls: 'pipe-node--start', label: 'START', sub: '' },
  { cls: 'pipe-node--vector', label: 'retrieve_vector_node', sub: 'Qdrant semantic search' },
  { cls: 'pipe-node--graph', label: 'retrieve_graph_node', sub: 'Neo4j cross-references' },
  { cls: 'pipe-node--gen', label: 'generate_answer_node', sub: 'Gemini 2.5 Flash' },
  { cls: 'pipe-node--end', label: 'END', sub: '' },
]

export default function Home() {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setTimeout(() => setSearching(false), 1400)
  }

  return (
    <div className="home">

      {/* ━━━ HERO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="hero">
        <div className="hero-orbs">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-orb hero-orb-3" />
        </div>
        <div className="hero-grid" />

        <div className="container hero-inner">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            Hybrid Graph-RAG &nbsp;·&nbsp; Fintech &amp; Banking
          </div>

          <h1 className="hero-title">
            Legal Intelligence<br />
            <span className="gradient-text">for Compliance Teams</span>
          </h1>

          <p className="hero-subtitle">
            RegWatch combines dense vector search, a Neo4j knowledge graph, and
            Gemini AI to surface precise, cited answers from Vietnamese banking
            and fintech regulations.
          </p>

          <form className="search-form" onSubmit={handleSearch}>
            <div className="search-box">
              <span className="search-icon">
                <SearchIcon size={18} />
              </span>
              <input
                type="text"
                className="search-input"
                placeholder="Ask a legal question - capital requirements, AML, data protection..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              <button
                type="submit"
                className="btn btn-primary search-btn"
                disabled={searching}
              >
                {searching ? 'Searching...' : 'Ask RegWatch'}
                {!searching && <ArrowRightIcon size={15} />}
              </button>
            </div>
          </form>

          <div className="sample-queries">
            <span className="sample-label">Try:</span>
            {SAMPLES.map(q => (
              <button key={q} className="sample-chip" onClick={() => setQuery(q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ STATS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="stats-section">
        <div className="container">
          <div className="stats-divider" />
          <div className="stats-grid">
            {STATS.map(s => (
              <div key={s.label} className="stat-card">
                <div className="stat-icon">{s.icon}</div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-sub">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ FEATURES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="features-section" id="features">
        <div className="container">
          <div className="section-header">
            <p className="section-eyebrow">How it works</p>
            <h2 className="section-title">Four layers of legal intelligence</h2>
            <p className="section-subtitle">
              RegWatch goes beyond keyword search — it understands the structure
              and relationships within regulatory text.
            </p>
          </div>

          <div className="features-grid">
            {FEATURES.map(f => (
              <div key={f.title} className="feature-card">
                <div className={`feature-icon-wrap ${f.iconClass}`}>{f.icon}</div>
                <span className="feature-badge">{f.badge}</span>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
                <div className="feature-bar" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ ARCHITECTURE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="arch-section" id="docs">
        <div className="container arch-inner">

          <div className="arch-text">
            <p className="section-eyebrow">Pipeline</p>
            <h2 className="section-title">Deterministic RAG orchestration</h2>
            <p className="section-subtitle" style={{ marginInline: 0, marginTop: 14 }}>
              Every query flows through a typed LangGraph state machine.
              Each node receives a <code>GraphState</code> dict and returns
              only the keys it owns — making failures easy to isolate.
            </p>

            <ul className="arch-steps">
              <li className="arch-step">
                <span className="step-num">1</span>
                <div className="step-content">
                  <strong>User question enters GraphState</strong>
                  <span>Typed dict with question, contexts, and final_answer slots</span>
                </div>
              </li>
              <li className="arch-step">
                <span className="step-num">2</span>
                <div className="step-content">
                  <strong>retrieve_vector_node</strong>
                  <span>Embeds question with text-embedding-004, top-k from Qdrant</span>
                </div>
              </li>
              <li className="arch-step">
                <span className="step-num">3</span>
                <div className="step-content">
                  <strong>retrieve_graph_node</strong>
                  <span>Traverses Neo4j for referenced, amending, and related articles</span>
                </div>
              </li>
              <li className="arch-step">
                <span className="step-num">4</span>
                <div className="step-content">
                  <strong>generate_answer_node</strong>
                  <span>Gemini 2.5 Flash synthesises both contexts into a cited answer</span>
                </div>
              </li>
            </ul>

            <div className="arch-links">
              <a
                href="http://localhost:8000/docs"
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline"
              >
                <ExternalLinkIcon size={15} />
                Swagger UI
              </a>
              <a
                href="http://localhost:7474"
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
              >
                Neo4j Browser
              </a>
            </div>
          </div>

          {/* Pipeline diagram */}
          <div className="pipeline">
            {PIPE_NODES.map((node, i) => (
              <div key={node.label}>
                <div className={`pipe-node ${node.cls}`}>
                  <span className="pipe-node-label">{node.label}</span>
                  {node.sub && <span className="pipe-node-sub">{node.sub}</span>}
                </div>
                {i < PIPE_NODES.length - 1 && (
                  <div className="pipe-arrow">
                    <div className="pipe-arrow-dot" />
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ━━━ CTA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="cta-section">
        <div className="container cta-inner">
          <p className="section-eyebrow">Deploy</p>
          <h2 className="cta-title">
            One command to start<br />
            <span className="gradient-text">the entire stack</span>
          </h2>
          <p className="cta-sub">
            Docker Compose brings up MySQL, Qdrant, Neo4j, the FastAPI
            backend, and the React frontend simultaneously.
          </p>

          <div className="terminal">
            <div className="terminal-bar">
              <span className="term-dot term-dot-red" />
              <span className="term-dot term-dot-yellow" />
              <span className="term-dot term-dot-green" />
              <span className="terminal-title">bash</span>
            </div>
            <div className="terminal-body">
              <div>
                <span className="term-prompt">$ </span>
                <span className="term-cmd">cp backend/.env.example backend/.env</span>
              </div>
              <div className="term-out"># fill in GEMINI_API_KEY and SECRET_KEY</div>
              <div style={{ marginTop: 8 }}>
                <span className="term-prompt">$ </span>
                <span className="term-cmd">docker compose up --build -d</span>
              </div>
              <div className="term-out">[+] Running 5/5</div>
              <div className="term-ok">  ✓ regwatch_mysql     started</div>
              <div className="term-ok">  ✓ regwatch_qdrant    started</div>
              <div className="term-ok">  ✓ regwatch_neo4j     started</div>
              <div className="term-ok">  ✓ regwatch_app       started</div>
              <div className="term-ok">  ✓ regwatch_frontend  started</div>
              <div style={{ marginTop: 8 }}>
                <span className="term-prompt">$ </span>
                <span className="term-cursor" />
              </div>
            </div>
          </div>

          <div className="cta-actions">
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
            >
              <ExternalLinkIcon size={15} />
              Open API Docs
            </a>
            <Link to="/test" className="btn btn-outline">
              <ActivityIcon size={15} />
              Test Health
            </Link>
            <a
              href="https://github.com/nguyenmarch/RegWatch"
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost"
            >
              <GithubIcon size={15} />
              GitHub
            </a>
          </div>
        </div>
      </section>

    </div>
  )
}
