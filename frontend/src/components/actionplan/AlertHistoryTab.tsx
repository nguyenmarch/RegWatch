import { useTranslation } from 'react-i18next'
import type { Alert } from '../../types/actionplan'
import { LoaderIcon } from '../Icons'

interface AlertHistoryTabProps {
  alerts: Alert[]
  selectedAlert: Alert | null
  onSelectAlert: (alert: Alert) => void
  loading: boolean
}

export default function AlertHistoryTab({
  alerts,
  selectedAlert,
  onSelectAlert,
  loading,
}: AlertHistoryTabProps) {
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
    <div className="alert-history-tab">
      <div className="alert-history-list">
        <div className="alert-list-header">
          <h3>{t('actionPlan.alertHistory') || 'Tất cả cảnh báo'}</h3>
          {loading && <LoaderIcon size={16} className="icon-spin" />}
        </div>

        <div className="alert-items">
          {alerts.map(alert => {
            const severity = normalizeSeverity(alert.severity)
            return (
              <div
                key={alert.id}
                className={`alert-item ${selectedAlert?.id === alert.id ? 'alert-item--selected' : ''}`}
                onClick={() => onSelectAlert(alert)}
              >
                <div className="alert-item-header">
                  <div className={`alert-badge alert-badge--${severity.toLowerCase()}`}>
                    {severity}
                  </div>
                  <span className="alert-code">{alert.alert_code}</span>
                </div>
                <div className="alert-item-title">{alert.title}</div>
                <div className="alert-item-dates">
                  <span className="date-label">{t('actionPlan.issuedDate') || 'Ngày phát hành'}:</span>
                  <span>{formatDate(alert.issued_date)}</span>
                </div>
                <div className="alert-item-dates">
                  <span className="date-label">{t('actionPlan.dueDate') || 'Hạn cuối'}:</span>
                  <span>{formatDate(alert.due_date)}</span>
                </div>
              </div>
            )
          })}
        </div>

        {alerts.length === 0 && !loading && (
          <div className="empty-state">
            <p>{t('actionPlan.noAlerts') || 'Không có cảnh báo nào'}</p>
          </div>
        )}
      </div>

      <style>{`
        .alert-history-tab {
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 20px;
        }

        .alert-history-list {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          overflow: hidden;
        }

        [data-theme="dark"] .alert-history-list {
          background: transparent;
          border-color: rgba(255, 255, 255, 0.10);
        }

        [data-theme="dark"] .alert-list-header {
          border-bottom-color: var(--border);
        }

        [data-theme="dark"] .alert-list-header h3 {
          color: var(--text-1);
        }

        [data-theme="dark"] .alert-item {
          border-bottom-color: rgba(255, 255, 255, 0.06);
          color: var(--text-1);
        }

        [data-theme="dark"] .alert-item:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        [data-theme="dark"] .alert-item--selected {
          background: rgba(37, 99, 235, 0.18);
          border-left-color: #60a5fa;
        }

        [data-theme="dark"] .alert-code,
        [data-theme="dark"] .alert-item-title {
          color: var(--text-1);
        }

        [data-theme="dark"] .alert-item-dates {
          color: #a8b7ca;
        }

        [data-theme="dark"] .date-label {
          color: #cbd5e1;
        }

        [data-theme="dark"] .empty-state {
          color: #94a3b8;
        }

        .alert-list-header {
          padding: 16px;
          border-bottom: 1px solid #e0e0e0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .alert-list-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .alert-badge--critical {
          background-color: #dc2626;
        }

        .alert-badge--high {
          background-color: #ea580c;
        }

        .alert-badge--medium {
          background-color: #f59e0b;
        }

        .alert-badge--low {
          background-color: #10b981;
        }

        .alert-items {
          max-height: 600px;
          overflow-y: auto;
        }

        .alert-item {
          padding: 12px 16px;
          border-bottom: 1px solid #f0f0f0;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .alert-item:hover {
          background: #f9f9f9;
        }

        .alert-item--selected {
          background: #eff6ff;
          border-left: 3px solid #2563eb;
          padding-left: 13px;
        }

        .alert-item-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .alert-badge {
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          color: white;
          text-transform: uppercase;
        }

        .alert-code {
          font-size: 13px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .alert-item-title {
          font-size: 13px;
          font-weight: 500;
          color: #333;
          margin-bottom: 6px;
          line-height: 1.4;
        }

        .alert-item-dates {
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
          .alert-history-tab {
            grid-template-columns: 1fr;
          }

          .alert-history-list {
            max-height: 300px;
          }
        }
      `}</style>
    </div>
  )
}
