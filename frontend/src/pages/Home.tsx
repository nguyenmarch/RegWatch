import { Link } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import {
  VectorIcon, GraphNetworkIcon, SparklesIcon,
  WorkflowIcon, ArrowRightIcon, ExternalLinkIcon, GithubIcon,
  DatabaseIcon, LayersIcon, ActivityIcon, FileTextIcon, LogInIcon,
} from '../components/Icons'

const FEATURE_META = [
  { iconClass: 'fi-emerald', badge: 'Qdrant', icon: <VectorIcon size={24} /> },
  { iconClass: 'fi-violet', badge: 'Neo4j', icon: <GraphNetworkIcon size={24} /> },
  { iconClass: 'fi-indigo', badge: 'Gemini 2.5F', icon: <SparklesIcon size={24} /> },
  { iconClass: 'fi-cyan', badge: 'LangGraph', icon: <WorkflowIcon size={24} /> },
]

const STAT_META = [
  { value: '3', icon: <DatabaseIcon size={18} />, key: 'db' },
  { value: '2.5F', icon: <SparklesIcon size={18} />, key: 'gemini' },
  { value: 'REST', icon: <LayersIcon size={18} />, key: 'api' },
  { value: '4', icon: <GraphNetworkIcon size={18} />, key: 'graph' },
]

const PIPE_NODES = [
  { cls: 'pipe-node--start', label: 'START', sub: '' },
  { cls: 'pipe-node--vector', label: 'retrieve_vector_node', sub: 'Qdrant' },
  { cls: 'pipe-node--graph', label: 'retrieve_graph_node', sub: 'Neo4j' },
  { cls: 'pipe-node--gen', label: 'generate_answer_node', sub: 'Gemini 2.5F' },
  { cls: 'pipe-node--end', label: 'END', sub: '' },
]

export default function Home() {
  const { t } = useTranslation()
  const { isAuthenticated } = useAuth()

  const features = t('home.features.items', { returnObjects: true }) as { title: string; desc: string }[]
  const steps = t('home.arch.steps', { returnObjects: true }) as { title: string; desc: string }[]

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
            {t('home.badge')}
          </div>

          <h1 className="hero-title">
            {t('home.title1')}<br />
            <span className="gradient-text">{t('home.title2')}</span>
          </h1>

          <p className="hero-subtitle">{t('home.subtitle')}</p>

          {/* Nav cards */}
          <div className="hero-nav-cards">
            {isAuthenticated ? (
              <>
                <Link to="/chat" className="hero-nav-card hero-nav-card--primary">
                  <div className="hero-nav-card-icon"><SparklesIcon size={22} /></div>
                  <div>
                    <p className="hero-nav-card-title">{t('home.navChat')}</p>
                    <p className="hero-nav-card-desc">{t('home.navChatDesc')}</p>
                  </div>
                  <ArrowRightIcon size={16} className="hero-nav-card-arrow" />
                </Link>
                <Link to="/documents" className="hero-nav-card">
                  <div className="hero-nav-card-icon"><FileTextIcon size={22} /></div>
                  <div>
                    <p className="hero-nav-card-title">{t('home.navDocs')}</p>
                    <p className="hero-nav-card-desc">{t('home.navDocsDesc')}</p>
                  </div>
                  <ArrowRightIcon size={16} className="hero-nav-card-arrow" />
                </Link>
              </>
            ) : (
              <Link to="/login" className="hero-nav-card hero-nav-card--primary">
                <div className="hero-nav-card-icon"><LogInIcon size={22} /></div>
                <div>
                  <p className="hero-nav-card-title">{t('home.navLogin')}</p>
                  <p className="hero-nav-card-desc">{t('home.navLoginDesc')}</p>
                </div>
                <ArrowRightIcon size={16} className="hero-nav-card-arrow" />
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ━━━ STATS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="stats-section">
        <div className="container">
          <div className="stats-divider" />
          <div className="stats-grid">
            {STAT_META.map(s => (
              <div key={s.key} className="stat-card">
                <div className="stat-icon">{s.icon}</div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{t(`home.stats.${s.key}.label`)}</div>
                <div className="stat-sub">{t(`home.stats.${s.key}.sub`)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ FEATURES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="features-section" id="features">
        <div className="container">
          <div className="section-header">
            <p className="section-eyebrow">{t('home.features.eyebrow')}</p>
            <h2 className="section-title">{t('home.features.title')}</h2>
            <p className="section-subtitle">{t('home.features.subtitle')}</p>
          </div>

          <div className="features-grid">
            {FEATURE_META.map((meta, i) => (
              <div key={meta.badge} className="feature-card">
                <div className={`feature-icon-wrap ${meta.iconClass}`}>{meta.icon}</div>
                <span className="feature-badge">{meta.badge}</span>
                <h3 className="feature-title">{features[i]?.title}</h3>
                <p className="feature-desc">{features[i]?.desc}</p>
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
            <p className="section-eyebrow">{t('home.arch.eyebrow')}</p>
            <h2 className="section-title">{t('home.arch.title')}</h2>
            <p className="section-subtitle" style={{ marginInline: 0, marginTop: 14 }}>
              <Trans i18nKey="home.arch.subtitle" components={{ code: <code /> }} />
            </p>

            <ul className="arch-steps">
              {steps.map((step, i) => (
                <li key={i} className="arch-step">
                  <span className="step-num">{i + 1}</span>
                  <div className="step-content">
                    <strong>{step.title}</strong>
                    <span>{step.desc}</span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="arch-links">
              <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" className="btn btn-outline">
                <ExternalLinkIcon size={15} />
                {t('home.arch.swaggerBtn')}
              </a>
              <a href="http://localhost:7474" target="_blank" rel="noreferrer" className="btn btn-outline">
                {t('home.arch.neo4jBtn')}
              </a>
            </div>
          </div>

          <div className="pipeline">
            {PIPE_NODES.map((node, i) => (
              <div key={node.label}>
                <div className={`pipe-node ${node.cls}`}>
                  <span className="pipe-node-label">{node.label}</span>
                  {node.sub && <span className="pipe-node-sub">{node.sub}</span>}
                </div>
                {i < PIPE_NODES.length - 1 && (
                  <div className="pipe-arrow"><div className="pipe-arrow-dot" /></div>
                )}
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ━━━ CTA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="cta-section">
        <div className="container cta-inner">
          <p className="section-eyebrow">{t('home.cta.eyebrow')}</p>
          <h2 className="cta-title">
            {t('home.cta.title1')}<br />
            <span className="gradient-text">{t('home.cta.title2')}</span>
          </h2>
          <p className="cta-sub">{t('home.cta.subtitle')}</p>

          <div className="terminal">
            <div className="terminal-bar">
              <span className="term-dot term-dot-red" />
              <span className="term-dot term-dot-yellow" />
              <span className="term-dot term-dot-green" />
              <span className="terminal-title">bash</span>
            </div>
            <div className="terminal-body">
              <div><span className="term-prompt">$ </span><span className="term-cmd">cp backend/.env.example backend/.env</span></div>
              <div className="term-out"># fill in GEMINI_API_KEY and SECRET_KEY</div>
              <div style={{ marginTop: 8 }}><span className="term-prompt">$ </span><span className="term-cmd">docker compose up --build -d</span></div>
              <div className="term-out">[+] Running 5/5</div>
              <div className="term-ok">  ✓ regwatch_mysql     started</div>
              <div className="term-ok">  ✓ regwatch_qdrant    started</div>
              <div className="term-ok">  ✓ regwatch_neo4j     started</div>
              <div className="term-ok">  ✓ regwatch_app       started</div>
              <div className="term-ok">  ✓ regwatch_frontend  started</div>
              <div style={{ marginTop: 8 }}><span className="term-prompt">$ </span><span className="term-cursor" /></div>
            </div>
          </div>

          <div className="cta-actions">
            <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" className="btn btn-primary">
              <ExternalLinkIcon size={15} />
              {t('home.cta.openApiBtn')}
            </a>
            <Link to="/test" className="btn btn-outline">
              <ActivityIcon size={15} />
              {t('home.cta.testHealthBtn')}
            </Link>
            <a href="https://github.com/nguyenmarch/RegWatch" target="_blank" rel="noreferrer" className="btn btn-outline">
              <GithubIcon size={15} />
              {t('home.cta.githubBtn')}
            </a>
          </div>
        </div>
      </section>

    </div>
  )
}
