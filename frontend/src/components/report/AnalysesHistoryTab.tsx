import { useTranslation } from 'react-i18next'
import type { Analyses } from '../../types/report'
import { LoaderIcon } from '../Icons'

interface AnalysesHistoryTabProps {
  analyses: Analyses[]
  selectedAnalyses: Analyses | null
  onSelectAnalyses: (analyses: Analyses) => void
  loading: boolean
}

export default function AnalysesHistoryTab({
  analyses,
  selectedAnalyses,
  onSelectAnalyses,
  loading,
}: AnalysesHistoryTabProps) {
  const { t } = useTranslation()

  const normalizeSeverity = (severity: string) => {
    const value = (severity || '').trim().toUpperCase()
    if (['CRITICAL', 'URGENT'].includes(value)) return 'CRITICAL'
    if (value === 'HIGH') return 'HIGH'
    if (['MEDIUM', 'REVIEW'].includes(value)) return 'MEDIUM'
    if (['LOW', 'MONITOR'].includes(value)) return 'LOW'
    return 'MEDIUM'
  }

  const formatDate = (value: string) => {
    if (!value) return 'Chưa có'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Chưa có'
    return date.toLocaleDateString()
  }

  return (
    <div className="analyses-history-tab">
      <div className="analyses-history-list">
        <div className="analyses-list-header">
          <h3>{t('report.analysesHistory') || 'Tất cả Analyses'}</h3>
          {loading && <LoaderIcon size={16} className="icon-spin" />}
        </div>

        <div className="analyses-items">
          {analyses.map(analyses => {
            const severity = normalizeSeverity(analyses.severity)
            return (
              <div
                key={analyses.id}
                className={`analyses-item ${selectedAnalyses?.id === analyses.id ? 'analyses-item--selected' : ''}`}
                onClick={() => onSelectAnalyses(analyses)}
              >
                <div className="analyses-item-header">
                  <div className={`analyses-badge analyses-badge--${severity.toLowerCase()}`}>
                    {severity}
                  </div>
                  <span className="analyses-code">{analyses.analyses_code}</span>
                </div>
                <div className="analyses-item-title">{analyses.title}</div>
                <div className="analyses-item-dates">
                  <span className="date-label">{t('report.issuedDate') || 'Ngày phát hành'}:</span>
                  <span>{formatDate(analyses.issued_date)}</span>
                </div>
                <div className="analyses-item-dates">
                  <span className="date-label">{t('report.dueDate') || 'Hạn cuối'}:</span>
                  <span>{formatDate(analyses.due_date)}</span>
                </div>
              </div>
            )
          })}
        </div>

        {analyses.length === 0 && !loading && (
          <div className="empty-state">
            <p>{t('report.noAnalyses') || 'Không có Analyses nào'}</p>
          </div>
        )}
      </div>

      <style>{`
        .analyses-history-tab {
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 20px;
        }

        .analyses-history-list {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          overflow: hidden;
        }

        [data-theme="dark"] .analyses-history-list {
          background: transparent;
          border-color: rgba(255, 255, 255, 0.10);
        }

        [data-theme="dark"] .analyses-list-header {
          border-bottom-color: var(--border);
        }

        [data-theme="dark"] .analyses-list-header h3 {
          color: var(--text-1);
        }

        [data-theme="dark"] .analyses-item {
          border-bottom-color: rgba(255, 255, 255, 0.06);
          color: var(--text-1);
        }

        [data-theme="dark"] .analyses-item:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        [data-theme="dark"] .analyses-item--selected {
          background: rgba(37, 99, 235, 0.18);
          border-left-color: #60a5fa;
        }

        [data-theme="dark"] .analyses-code,
        [data-theme="dark"] .analyses-item-title {
          color: var(--text-1);
        }

        [data-theme="dark"] .analyses-item-dates {
          color: #a8b7ca;
        }

        [data-theme="dark"] .date-label {
          color: #cbd5e1;
        }

        [data-theme="dark"] .empty-state {
          color: #94a3b8;
        }

        .analyses-list-header {
          padding: 16px;
          border-bottom: 1px solid #e0e0e0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .analyses-list-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .analyses-badge--critical {
          background-color: #dc2626;
        }

        .analyses-badge--high {
          background-color: #ea580c;
        }

        .analyses-badge--medium {
          background-color: #f59e0b;
        }

        .analyses-badge--low {
          background-color: #10b981;
        }

        .analyses-items {
          max-height: 600px;
          overflow-y: auto;
        }

        .analyses-item {
          padding: 12px 16px;
          border-bottom: 1px solid #f0f0f0;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .analyses-item:hover {
          background: #f9f9f9;
        }

        .analyses-item--selected {
          background: #eff6ff;
          border-left: 3px solid #2563eb;
          padding-left: 13px;
        }

        .analyses-item-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .analyses-badge {
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          color: white;
          text-transform: uppercase;
        }

        .analyses-code {
          font-size: 13px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .analyses-item-title {
          font-size: 13px;
          font-weight: 500;
          color: #333;
          margin-bottom: 6px;
          line-height: 1.4;
        }

        .analyses-item-dates {
          font-size: 12px;
          color: #666;
          margin-bottom: 3px;
        }

        .date-label {
          font-weight: 500;
          margin-right: 4px;
        }

        .empty-state {
          padding: 40px 20px;
          text-align: center;
          color: #999;
          font-size: 14px;
        }

        @media (max-width: 1024px) {
          .analyses-history-tab {
            grid-template-columns: 1fr;
          }

          .analyses-history-list {
            max-height: 300px;
          }
        }
      `}</style>
    </div>
  )
}
