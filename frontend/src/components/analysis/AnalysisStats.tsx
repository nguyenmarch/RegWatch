import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AnalysisSeverity } from '../../lib/analyses'
import { AlertTriangleIcon, ChartIcon, ClockIcon, EyeIcon } from '../Icons'

export type AnalysisStatKey = AnalysisSeverity | 'total'

interface StatConfig {
  key: AnalysisStatKey
  labelKey: string
  cls: string
  gradient: string
  icon: ReactNode
}

const STAT_CONFIGS: StatConfig[] = [
  {
    key: 'urgent',
    labelKey: 'analyses.stats.urgent',
    cls: 'astat--urgent',
    gradient: 'linear-gradient(135deg, rgba(244,63,94,0.18) 0%, rgba(244,63,94,0.05) 100%)',
    icon: <AlertTriangleIcon size={20} />,
  },
  {
    key: 'review',
    labelKey: 'analyses.stats.review',
    cls: 'astat--review',
    gradient: 'linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(245,158,11,0.05) 100%)',
    icon: <ClockIcon size={20} />,
  },
  {
    key: 'monitor',
    labelKey: 'analyses.stats.monitor',
    cls: 'astat--monitor',
    gradient: 'linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0.05) 100%)',
    icon: <EyeIcon size={20} />,
  },
  {
    key: 'total',
    labelKey: 'analyses.stats.total',
    cls: 'astat--total',
    gradient: 'linear-gradient(135deg, rgba(20,105,173,0.18) 0%, rgba(20,105,173,0.05) 100%)',
    icon: <ChartIcon size={20} />,
  },
]

interface Props {
  counts: Record<AnalysisStatKey, number>
  active?: AnalysisStatKey | null
  loading?: boolean
  onSelect?: (key: AnalysisStatKey) => void
}

export default function AnalysisStats({ counts, active, loading = false, onSelect }: Props) {
  const { t } = useTranslation()

  return (
    <div className="astat-grid">
      {STAT_CONFIGS.map(({ key, labelKey, cls, gradient, icon }, index) => (
        <button
          key={key}
          className={`astat-card ${cls} ${active === key ? 'astat-card--active' : ''}`}
          style={{ '--astat-gradient': gradient, '--anim-delay': `${index * 60}ms` } as CSSProperties}
          onClick={() => onSelect?.(key)}
          type="button"
        >
          <div className="astat-icon">{icon}</div>
          <div className="astat-value">
            {loading ? <span className="astat-skeleton" /> : counts[key]}
          </div>
          <div className="astat-label">{t(labelKey)}</div>
          {active === key && <span className="astat-active-dot" />}
        </button>
      ))}
    </div>
  )
}
