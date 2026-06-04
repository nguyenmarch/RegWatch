import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import {
  ArrowRightIcon,
  DatabaseIcon,
  FileTextIcon,
  GraphNetworkIcon,
  LayersIcon,
  LogInIcon,
  SparklesIcon,
  VectorIcon,
  WorkflowIcon,
} from '../components/Icons'

const ACTIONS = [
  {
    authOnly: true,
    to: '/chat',
    variant: 'primary',
    icon: <SparklesIcon size={22} />,
    titleKey: 'home.navChat',
    descKey: 'home.navChatDesc',
  },
  {
    authOnly: true,
    to: '/documents',
    icon: <FileTextIcon size={22} />,
    titleKey: 'home.navDocs',
    descKey: 'home.navDocsDesc',
  },
] as const

const FEATURES = [
  { key: 'vector', badge: 'Qdrant', icon: <VectorIcon size={22} />, iconClass: 'fi-emerald' },
  { key: 'graph', badge: 'Neo4j', icon: <GraphNetworkIcon size={22} />, iconClass: 'fi-violet' },
  { key: 'ai', badge: 'Gemini', icon: <SparklesIcon size={22} />, iconClass: 'fi-indigo' },
  { key: 'workflow', badge: 'LangGraph', icon: <WorkflowIcon size={22} />, iconClass: 'fi-cyan' },
] as const

const STATS = [
  { value: '3', icon: <DatabaseIcon size={18} />, key: 'db' },
  { value: '2.5F', icon: <SparklesIcon size={18} />, key: 'gemini' },
  { value: 'REST', icon: <LayersIcon size={18} />, key: 'api' },
  { value: '4', icon: <GraphNetworkIcon size={18} />, key: 'graph' },
] as const

export default function Home() {
  const { t } = useTranslation()
  const { isAuthenticated } = useAuth()
  const features = t('home.features.items', { returnObjects: true }) as { title: string; desc: string }[]

  const visibleActions = isAuthenticated
    ? ACTIONS
    : [
      {
        to: '/login',
        icon: <LogInIcon size={22} />,
        titleKey: 'home.navLogin',
        descKey: 'home.navLoginDesc',
      },
    ]

  return (
    <div className="home home-compact">
      <section className="hero home-hero">
        <div className="hero-orbs">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
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

          <div className="hero-nav-cards home-action-grid">
            {visibleActions.map(action => (
              <Link
                key={action.to}
                to={action.to}
                className="hero-nav-card"
              >
                <div className="hero-nav-card-icon">{action.icon}</div>
                <div>
                  <p className="hero-nav-card-title">{t(action.titleKey)}</p>
                  <p className="hero-nav-card-desc">{t(action.descKey)}</p>
                </div>
                <ArrowRightIcon size={16} className="hero-nav-card-arrow" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="home-summary">
        <div className="container home-summary-inner">
          <div className="home-stats-row">
            {STATS.map(item => (
              <div key={item.key} className="home-stat-pill">
                <span className="home-stat-icon">{item.icon}</span>
                <strong>{item.value}</strong>
                <span>{t(`home.stats.${item.key}.label`)}</span>
              </div>
            ))}
          </div>

          <div className="home-feature-panel">
            <div className="home-feature-head">
              <p className="section-eyebrow">{t('home.features.eyebrow')}</p>
              <h2 className="section-title">{t('home.features.title')}</h2>
              <p className="section-subtitle">{t('home.features.subtitle')}</p>
            </div>

            <div className="home-feature-grid">
              {FEATURES.map((meta, index) => (
                <article key={meta.key} className="home-feature-item">
                  <div className={`feature-icon-wrap ${meta.iconClass}`}>{meta.icon}</div>
                  <div>
                    <h3 className="feature-title">{features[index]?.title}</h3>
                    <p className="feature-desc">{features[index]?.desc}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
