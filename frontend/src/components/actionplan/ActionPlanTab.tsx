import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Alert, ActionPlanItem } from '../../types/actionplan'
import { TrashIcon, PlusIcon, SaveIcon, CheckIcon, DownloadIcon } from '../Icons'

interface ActionPlanTabProps {
  selectedAlert: Alert | null
  items: ActionPlanItem[]
  onSave: (items: ActionPlanItem[]) => Promise<void>
  onFinalize: () => Promise<void>
  saving: boolean
}

const DEPARTMENTS = [
  'Khối Công nghệ',
  'Khối Vận hành',
  'Khối Pháp chế',
  'Khối BoD (HR)',
  'Khối Marketing',
]

const RISK_LEVELS = ['Cao', 'Trung bình', 'Thấp']

export default function ActionPlanTab({
  selectedAlert,
  items,
  onSave,
  onFinalize,
  saving,
}: ActionPlanTabProps) {
  const { t } = useTranslation()
  const [editedItems, setEditedItems] = useState<ActionPlanItem[]>(items)
  const [isEditing, setIsEditing] = useState(false)

  const handleAddRow = () => {
    const newItem: ActionPlanItem = {
      id: Math.max(0, ...editedItems.map(i => i.id), 0) + 1,
      alert_id: selectedAlert?.id || 0,
      action_description: '',
      responsible_department: '',
      target_date: '',
      estimated_budget: 0,
      estimated_risk: '',
      code: '',
      status: 'Cần xử lý',
      deliverable_type: 'process_update',
      owner_role: 'Compliance Department / Risk Manager',
      co_owner_role: 'Product / IT / PO',
      dependency: '',
      evidence_document: '',
    }
    setEditedItems([...editedItems, newItem])
  }

  const handleDeleteRow = (id: number) => {
    setEditedItems(editedItems.filter(item => item.id !== id))
  }

  const handleFieldChange = (
    id: number,
    field: keyof ActionPlanItem,
    value: ActionPlanItem[keyof ActionPlanItem],
  ) => {
    setEditedItems(
      editedItems.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    )
  }

  const handleSave = async () => {
    await onSave(editedItems)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditedItems(items)
    setIsEditing(false)
  }

  useEffect(() => {
    setEditedItems(items)
  }, [items])

  const handleExportCSV = () => {
    try {
      const header = [
        'Action Description',
        'Department',
        'Target Date',
        'Estimated Budget',
        'Risk Level',
        'Code',
        'Status',
      ]

      const rows = editedItems.map(it => [
        it.action_description,
        it.responsible_department,
        it.target_date,
        it.estimated_budget,
        it.estimated_risk,
        it.code,
        it.status,
      ])

      const esc = (v: string | number) => {
        const s = (v ?? '').toString()
        const needs = /[",\n]/.test(s)
        const out = s.replace(/"/g, '""')
        return needs ? `"${out}"` : out
      }

      const csv = [
        header.join(','),
        ...rows.map(r => r.map(esc).join(',')),
      ].join('\n')

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const name = selectedAlert?.alert_code
        ? `${selectedAlert.alert_code}_action_plan.csv`
        : 'action_plan.csv'
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export CSV failed:', e)
      alert('Không xuất được CSV')
    }
  }

  // Normalize risk text into a safe CSS class key, e.g. "Trung bình" -> "trung-binh"
  const riskKey = (r?: string) => {
    if (!r) return ''
    try {
      // remove diacritics, to lower, replace spaces with dashes, strip unsafe chars
      const normalized = r
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '')
      return normalized
    } catch (e) {
      return r.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '')
    }
  }

  const formatDate = (value: string) => {
    if (!value) return 'Chưa có'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Chưa có'
    return date.toLocaleDateString()
  }

  return (
    <div className="actionplan-tab">
      {!selectedAlert ? (
        <div className="empty-alert-state">
          <p>{t('actionPlan.selectAlertFirst') || 'Vui lòng chọn một cảnh báo'}</p>
        </div>
      ) : (
        <>
          <div className="actionplan-alert-info">
            <h3>{selectedAlert.title}</h3>
            <p className="alert-code">{selectedAlert.alert_code}</p>
            <p className="alert-desc">{selectedAlert.description}</p>
          </div>

          <div className="actionplan-table-wrapper">
            <table className="actionplan-table">
              <thead>
                <tr>
                  <th className="col-action">{t('actionPlan.actionDescription') || 'Hàng mui bản hành động'}</th>
                  <th className="col-dept">{t('actionPlan.department') || 'Chọn bộ phận'}</th>
                  <th className="col-date">{t('actionPlan.targetDate') || 'Ngày'}</th>
                  <th className="col-budget">{t('actionPlan.budget') || 'Hạn bảo hành'}</th>
                  <th className="col-risk">{t('actionPlan.riskLevel') || 'Ước tính rủi ro'}</th>
                  <th className="col-code">{t('actionPlan.code') || 'Mã tiêu'}</th>
                  <th className="col-status">{t('actionPlan.status') || 'Trạng thái'}</th>
                </tr>
              </thead>
              <tbody>
                {editedItems.map((item, idx) => (
                  <tr key={item.id} className={idx % 2 === 0 ? 'row-alt' : ''}>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={item.action_description}
                          onChange={e => handleFieldChange(item.id, 'action_description', e.target.value)}
                          className="input-field"
                          placeholder="Mô tả hành động"
                        />
                      ) : (
                        <span>{item.action_description}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select
                          value={item.responsible_department}
                          onChange={e => handleFieldChange(item.id, 'responsible_department', e.target.value)}
                          className="select-field"
                          aria-label="Chọn bộ phận"
                        >
                          <option value="">Chọn...</option>
                          {DEPARTMENTS.map(dept => (
                            <option key={dept} value={dept}>
                              {dept}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="dept-badge">{item.responsible_department}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="date"
                          value={item.target_date}
                          onChange={e => handleFieldChange(item.id, 'target_date', e.target.value)}
                          className="input-field"
                          aria-label="Ngày mục tiêu"
                        />
                      ) : (
                        <span>{formatDate(item.target_date)}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="number"
                          value={item.estimated_budget}
                          onChange={e => handleFieldChange(item.id, 'estimated_budget', Number(e.target.value))}
                          className="input-field"
                          placeholder="0"
                        />
                      ) : (
                        <span className="budget">
                          {item.estimated_budget.toLocaleString()} VND
                        </span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select
                          value={item.estimated_risk}
                          onChange={e => handleFieldChange(item.id, 'estimated_risk', e.target.value)}
                          className={`select-field risk-select ${riskKey(item.estimated_risk) ? `risk-${riskKey(item.estimated_risk)}` : ''}`}
                          aria-label="Chọn mức rủi ro"
                        >

                          <option value="">Chọn...</option>
                          {RISK_LEVELS.map(level => (
                            <option key={level} value={level}>
                              {level}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`risk-badge ${riskKey(item.estimated_risk) ? `risk-${riskKey(item.estimated_risk)}` : ''}`}>
                          {item.estimated_risk}
                        </span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={item.code}
                          onChange={e => handleFieldChange(item.id, 'code', e.target.value)}
                          className="input-field"
                          placeholder="Mã"
                          aria-label="Mã"
                        />
                      ) : (
                        <span>{item.code || '—'}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={item.status}
                          onChange={e => handleFieldChange(item.id, 'status', e.target.value)}
                          className="input-field"
                          placeholder="Trạng thái"
                          aria-label="Trạng thái"
                        />
                      ) : (
                        <span
                          className={`status-badge ${item.status === 'Cần xử lý' ? 'status-badge--need-action' : ''}`}
                        >
                          {item.status}
                        </span>
                      )}
                    </td>

                    <td className="action-cell">
                      {isEditing && (
                        <button
                          className="btn-delete"
                          onClick={() => handleDeleteRow(item.id)}
                          title="Delete"
                        >
                          <TrashIcon size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="actionplan-actions">
            {!isEditing ? (
              <>
                <button
                  className="btn btn-primary"
                  onClick={() => setIsEditing(true)}
                >
                  Chỉnh sửa
                </button>
                <button
                  className="btn btn-success"
                  onClick={onFinalize}
                  disabled={saving}
                >
                  <CheckIcon size={16} />
                  {saving ? 'Đang xử lý...' : 'Chốt Action Plan'}
                </button>
                <button
                  className="btn btn-export"
                  onClick={handleExportCSV}
                >
                  <DownloadIcon size={16} />
                  Export CSV
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn-outline"
                  onClick={handleAddRow}
                >
                  <PlusIcon size={16} />
                  Thêm hàng
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <SaveIcon size={16} />
                  {saving ? 'Đang lưu...' : 'Lưu'}
                </button>
                <button
                  className="btn btn-outline"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  Hủy
                </button>
                <button
                  className="btn btn-export"
                  onClick={handleExportCSV}
                  disabled={saving}
                >
                  <DownloadIcon size={16} />
                  Export CSV
                </button>
              </>
            )}
          </div>
        </>
      )}

      <style>{`
        .empty-alert-state {
          padding: 60px 20px;
          text-align: center;
          color: #999;
        }

        .actionplan-tab {
          background: var(--bg-glass);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 20px;
        }

        /* Dark-mode readability tweaks */
        [data-theme="dark"] .actionplan-tab {
          background: transparent;
          border-color: rgba(255, 255, 255, 0.08);
        }

        [data-theme="dark"] .actionplan-alert-info {
          border-bottom: 1px solid var(--border);
        }

        [data-theme="dark"] .actionplan-alert-info h3 {
          color: var(--text-1);
        }

        [data-theme="dark"] .alert-code,
        [data-theme="dark"] .alert-desc {
          color: #a8b7ca;
        }

        [data-theme="dark"] .actionplan-alert-info {
          border-bottom-color: var(--border);
        }

        [data-theme="dark"] .actionplan-alert-info h3,
        [data-theme="dark"] .alert-code,
        [data-theme="dark"] .alert-desc {
          color: #cbd5e1;
        }

        [data-theme="dark"] .actionplan-alert-info h3 {
          color: #f8fafc;
        }

        .actionplan-alert-info {
          margin-bottom: 20px;
          padding-bottom: 20px;
          border-bottom: 1px solid #e0e0e0;
        }

        .actionplan-alert-info h3 {
          margin: 0 0 8px 0;
          font-size: 18px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .alert-code {
          margin: 0 0 8px 0;
          font-size: 14px;
          font-weight: 500;
          color: #666;
        }

        .alert-desc {
          margin: 0;
          font-size: 14px;
          color: #666;
          line-height: 1.6;
        }

        .actionplan-table-wrapper {
          overflow-x: auto;
          margin-bottom: 20px;
        }

        .actionplan-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          table-layout: fixed;
          min-width: 1020px;
        }

        .actionplan-table thead {
          background: #f5f5f5;
        }

        [data-theme="dark"] .actionplan-table thead {
          background: rgba(255, 255, 255, 0.06);
        }

        [data-theme="dark"] .actionplan-table th {
          color: #cbd5e1;
          border-bottom-color: rgba(255, 255, 255, 0.12);
        }

        [data-theme="dark"] .actionplan-table td {
          border-bottom-color: rgba(255, 255, 255, 0.06);
          color: #e5edf6;
        }

        [data-theme="dark"] .actionplan-table .row-alt {
          background: rgba(255, 255, 255, 0.025);
        }

        /* Fix bug: sọc trắng dọc khi di chuột (table hover/banding) */
        .actionplan-table tbody td {
          background-color: transparent;
        }

        .actionplan-table tbody tr:hover {
          background-color: rgba(255, 255, 255, 0.04);
        }

        [data-theme="dark"] .actionplan-table tbody tr:hover {
          background-color: rgba(255, 255, 255, 0.055);
        }


        .actionplan-table th,
        .actionplan-table td {
          padding: 12px 10px;
          text-align: center;
        }

        .actionplan-table th {
          font-weight: 600;
          color: #333;
          border-bottom: 2px solid #e0e0e0;
        }

        .actionplan-table .col-action {
          width: 18%;
          min-width: 140px;
        }

        .actionplan-table .col-dept {
          width: 18%;
          min-width: 150px;
        }

        .actionplan-table .col-date {
          width: 15%;
          min-width: 150px;
        }

        .actionplan-table .col-budget {
          width: 15%;
          min-width: 160px;
        }

        .actionplan-table .col-risk {
          width: 14%;
          min-width: 140px;
        }

        .actionplan-table .col-code {
          width: 8%;
          min-width: 90px;
        }

        .actionplan-table .col-status {
          width: 13%;
          min-width: 145px;
        }

        .actionplan-table td {
          padding: 12px 10px;
          border-bottom: 1px solid #f0f0f0;
          word-break: break-word;
          overflow-wrap: anywhere;
        }

        .actionplan-table .row-alt {
          background: #fafafa;
        }

        .input-field,
        .select-field {
          width: 100%;
          min-width: 0;
          padding: 6px 8px;
          border: 1px solid #d0d0d0;
          border-radius: 4px;
          font-size: 13px;
          font-family: inherit;
          box-sizing: border-box;
          text-align: center;
        }

        [data-theme="dark"] .input-field,
        [data-theme="dark"] .select-field {
          background: rgba(2, 18, 32, 0.70);
          border-color: rgba(255, 255, 255, 0.14);
          color: #f8fafc;
        }

        [data-theme="dark"] .input-field::placeholder {
          color: #64748b;
        }

        .input-field:focus,
        .select-field:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
        }

        .dept-badge {
          display: inline-block;
          padding: 4px 8px;
          background: #dbeafe;
          color: #1e40af;
          border-radius: 4px;
          font-size: 12px;
        }

        [data-theme="dark"] .dept-badge {
          background: rgba(96, 165, 250, 0.18);
          color: #bfdbfe;
          border: 1px solid rgba(96, 165, 250, 0.28);
        }

        .budget {
          font-weight: 500;
          color: #059669;
        }

        .risk-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          border: 1px solid transparent;
        }

        .risk-badge.risk-cao {
          background: rgba(239, 68, 68, 0.14);
          color: #b91c1c;
          border-color: rgba(239, 68, 68, 0.70);
          font-weight: 700;
          box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.55) inset;
        }

        .risk-badge.risk-trung-binh {
          background: rgba(245, 158, 11, 0.14);
          color: #92400e;
          border-color: rgba(245, 158, 11, 0.70);
          font-weight: 700;
          box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.55) inset;
        }

        .risk-badge.risk-thap,
        .risk-badge.risk-thấp {
          background: #d1fae5;
          color: #065f46;
          border-color: rgba(16, 185, 129, 0.55);
          box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.35) inset;
          font-weight: 700;
        }

        [data-theme="dark"] .risk-badge.risk-thap,
        [data-theme="dark"] .risk-badge.risk-thấp {
          background: rgba(16, 185, 129, 0.18);
          color: #34d399;
          border-color: rgba(16, 185, 129, 0.75);
          box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.28) inset;
          font-weight: 700;
        }
        /* Cao (editing) */
        .risk-select.risk-cao {
          background: rgba(239, 68, 68, 0.14);
          color: #b91c1c;
          border-color: rgba(239, 68, 68, 0.85);
          box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.35) inset;
          font-weight: 900;
        }


      /* Backward compatibility (nếu còn dùng class cũ) */
      .risk-cấp {
        background: rgba(220, 38, 38, 0.14);
        color: #b91c1c;
        border-color: rgba(220, 38, 38, 0.45);
        font-weight: 800;
        box-shadow: 0 0 0 1px rgba(220, 38, 38, 0.25) inset;
      }



        /* Dark mode frame for "Cấp" */
        [data-theme="dark"] .risk-cấp {
          background: rgba(239, 68, 68, 0.18);
          color: #ffb4b4;
          border-color: rgba(239, 68, 68, 0.85);
          box-shadow:
            0 0 0 3px rgba(239, 68, 68, 0.22),
            0 10px 30px rgba(239, 68, 68, 0.14);
          font-weight: 900;
        }

        /* Risk select (editing) */
        .risk-select {
          border-width: 2px;
          font-weight: 800;
        }

        .risk-select.risk-cấp {
          background: rgba(220, 38, 38, 0.14);
          color: #b91c1c;
          border-color: rgba(220, 38, 38, 0.55);
          box-shadow: 0 0 0 1px rgba(220, 38, 38, 0.25) inset;
        }

        /* Trung bình (editing) - luôn giữ tông vàng */
        .risk-select.risk-trung-binh {
          background: rgba(245, 158, 11, 0.14) !important;
          color: #92400e !important;
          border-color: rgba(245, 158, 11, 0.95) !important;
          box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.70) inset !important;
          font-weight: 900 !important;
        }

        /* Fix bug: override bị ghi đè (đặc biệt lúc hover/focus/chọn option) */
        .risk-select.risk-trung-binh,
        .risk-select.risk-trung-binh:focus,
        .risk-select.risk-trung-binh:hover,
        .risk-select.risk-trung-binh:active {
          background: rgba(245, 158, 11, 0.14) !important;
          color: #92400e !important;
          border-color: rgba(245, 158, 11, 0.95) !important;
          box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.70) inset !important;
          font-weight: 900 !important;
        }

        /* Option list (để option hiển thị không bị xanh biển) */
        .risk-select.risk-trung-binh option {
          background: rgba(245, 158, 11, 0.14) !important;
          color: #92400e !important;
        }






        .risk-select.risk-thấp,
        .risk-select.risk-thap {
          background: rgba(16, 185, 129, 0.14);
          color: #065f46;
          border-color: rgba(16, 185, 129, 0.55);
          box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.25) inset;
        }

        /* Status badge */
        .status-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 700;
          border: 1px solid transparent;
          background: #f3f4f6;
          color: #111827;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.03) inset;
        }

        /* Cần xử lý (OPEN khởi tạo) */
        .status-badge--need-action {
          background: #f3f4f6;
          color: #374151;
          border-color: rgba(107, 114, 128, 0.35);
          box-shadow: 0 0 0 1px rgba(107, 114, 128, 0.18) inset;
        }

        [data-theme="dark"] .status-badge--need-action {
          background: rgba(255, 255, 255, 0.06);
          color: #e5e7eb;
          border-color: rgba(229, 231, 235, 0.18);
          box-shadow: 0 0 0 1px rgba(229, 231, 235, 0.10) inset;
        }


        [data-theme="dark"] .risk-select.risk-cấp {
          background: rgba(239, 68, 68, 0.18);
          color: #ffb4b4;
          border-color: rgba(239, 68, 68, 0.95);
          box-shadow:
            0 0 0 3px rgba(239, 68, 68, 0.22),
            0 10px 30px rgba(239, 68, 68, 0.14);
        }

        [data-theme="dark"] .risk-select.risk-thấp,
        [data-theme="dark"] .risk-select.risk-thap {
          background: rgba(16, 185, 129, 0.18);
          color: #34d399;
          border-color: rgba(16, 185, 129, 0.95);
          box-shadow:
            0 0 0 3px rgba(16, 185, 129, 0.18);
        }

        [data-theme="dark"] .risk-select.risk-trung-binh {
          background: rgba(245, 158, 11, 0.18);
          color: #fbbf24;
          border-color: rgba(245, 158, 11, 0.95);
          box-shadow:
            0 0 0 3px rgba(245, 158, 11, 0.18);
        }


        /* Trung bình (fallback nếu còn dùng class risk-trung) */
        .risk-trung {
          background: rgba(245, 158, 11, 0.12);
          color: #92400e;
          border-color: rgba(245, 158, 11, 0.70);
          box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.55) inset;
          font-weight: 900;
        }


        .risk-thấp,
        .risk-thap {
          background: #d1fae5;
          color: #065f46;
        }

        .action-cell {
          text-align: center;
        }

        .btn-delete {
          background: none;
          border: none;
          color: #dc2626;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          transition: color 0.2s;
        }

        .btn-delete:hover {
          color: #991b1b;
        }

        .actionplan-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .btn {
          padding: 8px 16px;
          border: 1px solid #d0d0d0;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-primary {
          background: #2563eb;
          color: white;
          border-color: #2563eb;
        }

        .btn-primary:hover:not(:disabled) {
          background: #1d4ed8;
          border-color: #1d4ed8;
        }

        .btn-success {
          background: #16a34a;
          color: white;
          border-color: #16a34a;
        }

        .btn-success:hover:not(:disabled) {
          background: #15803d;
          border-color: #15803d;
        }

        .btn-outline {
          background: white;
          color: #333;
        }

        [data-theme="dark"] .btn-outline {
          background: transparent;
          color: var(--text-2);
          border-color: var(--border-h);
        }

        [data-theme="dark"] .btn-outline:hover:not(:disabled) {
          background: var(--bg-glass);
          color: var(--text-1);
        }


        .btn-outline:hover:not(:disabled) {
          background: #f9f9f9;
        }

        .btn-export {
          background: linear-gradient(135deg, #0d9488, #0f766e);
          color: white;
          border-color: #0f766e;
          box-shadow: 0 2px 4px rgba(13, 148, 136, 0.15);
        }

        .btn-export:hover:not(:disabled) {
          background: linear-gradient(135deg, #0f766e, #115e59);
          border-color: #115e59;
          box-shadow: 0 4px 6px rgba(13, 148, 136, 0.25);
          transform: translateY(-1px);
        }

        .btn-export:active:not(:disabled) {
          transform: translateY(0);
        }

        [data-theme="dark"] .btn-export {
          background: linear-gradient(135deg, #0f766e, #115e59);
          border-color: rgba(20, 184, 166, 0.3);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        [data-theme="dark"] .btn-export:hover:not(:disabled) {
          background: linear-gradient(135deg, #115e59, #134e4a);
          border-color: rgba(20, 184, 166, 0.5);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </div>
  )
}
