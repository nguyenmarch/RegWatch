import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Analyses, ReportItem } from '../../types/report'
import { TrashIcon, PlusIcon, SaveIcon, CheckIcon, DownloadIcon, FileTextIcon } from '../Icons'

interface ReportTabProps {
  selectedAnalyses: Analyses | null
  items: ReportItem[]
  onSave: (items: ReportItem[]) => Promise<void>
  onFinalize: () => Promise<void>
  saving: boolean
}

const DEPARTMENTS = [
  'Khối Công nghệ', 'Khối Vận hành', 'Khối Pháp chế',
  'Khối BoD (HR)', 'Khối Marketing',
]
const RISK_LEVELS = ['Cao', 'Trung bình', 'Thấp']

const riskClass = (r?: string): string => {
  if (!r) return ''
  try {
    const k = r.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
    if (k === 'cao') return 'rpt-risk--cao'
    if (k === 'trung binh') return 'rpt-risk--tb'
    if (k === 'thap') return 'rpt-risk--thap'
  } catch {
    const k = r.toLowerCase()
    if (k === 'cao') return 'rpt-risk--cao'
    if (k.includes('trung')) return 'rpt-risk--tb'
    if (k.includes('th')) return 'rpt-risk--thap'
  }
  return ''
}

const normSevClass = (severity?: string): string => {
  const v = (severity || '').toUpperCase()
  if (['CRITICAL', 'URGENT'].includes(v)) return 'rpt-sev--critical'
  if (v === 'HIGH') return 'rpt-sev--high'
  if (['MEDIUM', 'REVIEW'].includes(v)) return 'rpt-sev--medium'
  if (['LOW', 'MONITOR'].includes(v)) return 'rpt-sev--low'
  return 'rpt-sev--medium'
}

const formatDate = (value: string) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('vi-VN')
}

export default function ReportTab({
  selectedAnalyses,
  items,
  onSave,
  onFinalize,
  saving,
}: ReportTabProps) {
  const { t } = useTranslation()
  const [editedItems, setEditedItems] = useState<ReportItem[]>(items)
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => { setEditedItems(items) }, [items])

  const handleAddRow = () => {
    const newItem: ReportItem = {
      id: Math.max(0, ...editedItems.map(i => i.id), 0) + 1,
      analyses_id: selectedAnalyses?.id || 0,
      report_description: '',
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
    setEditedItems(prev => [...prev, newItem])
  }

  const handleDeleteRow = (id: number) =>
    setEditedItems(prev => prev.filter(item => item.id !== id))

  const handleFieldChange = (
    id: number,
    field: keyof ReportItem,
    value: ReportItem[keyof ReportItem],
  ) =>
    setEditedItems(prev =>
      prev.map(item => (item.id === id ? { ...item, [field]: value } : item))
    )

  const handleSave = async () => {
    await onSave(editedItems)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditedItems(items)
    setIsEditing(false)
  }

  const handleExportCSV = () => {
    try {
      const header = [
        'Report Description', 'Department', 'Target Date',
        'Estimated Budget', 'Risk Level', 'Code', 'Status',
      ]
      const rows = editedItems.map(it => [
        it.report_description, it.responsible_department, it.target_date,
        it.estimated_budget, it.estimated_risk, it.code, it.status,
      ])
      const esc = (v: string | number) => {
        const s = (v ?? '').toString()
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const csv = [header.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = selectedAnalyses?.analyses_code
        ? `${selectedAnalyses.analyses_code}_report.csv`
        : 'report.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export CSV failed:', e)
      window.alert('Không xuất được CSV')
    }
  }

  return (
    <>
      {/* Panel head — sticky inside rpt-panel */}
      <div className="rpt-panel-head">
        <div className="rpt-panel-icon"><FileTextIcon size={14} /></div>
        <span className="rpt-panel-title">
          {selectedAnalyses ? selectedAnalyses.title : 'Report'}
        </span>
        {selectedAnalyses && (
          <span className={`rpt-sev ${normSevClass(selectedAnalyses.severity)}`} style={{ fontSize: '0.65rem', marginLeft: 'auto' }}>
            {selectedAnalyses.severity}
          </span>
        )}
      </div>

      {!selectedAnalyses ? (
        <div className="rpt-editor-empty">
          <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <p>{t('report.selectAnalysesFirst') || 'Chọn một Analyses để xem Report'}</p>
        </div>
      ) : (
        <>
          {/* Action toolbar — outside scroll area so it stays visible */}
          <div className={`rpt-toolbar${isEditing ? ' rpt-toolbar--edit' : ''}`}>
            {!isEditing ? (
              <>
                <button className="rpt-btn rpt-btn--primary" onClick={() => setIsEditing(true)}>
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Chỉnh sửa
                </button>
                <div className="rpt-toolbar-spacer" />
                <button className="rpt-btn rpt-btn--success" onClick={onFinalize} disabled={saving}>
                  <CheckIcon size={13} />
                  {saving ? 'Đang xử lý...' : 'Chốt Report'}
                </button>
                <button className="rpt-btn rpt-btn--teal" onClick={handleExportCSV}>
                  <DownloadIcon size={13} />
                  Export CSV
                </button>
              </>
            ) : (
              <>
                <button className="rpt-btn" onClick={handleAddRow}>
                  <PlusIcon size={13} />
                  Thêm hàng
                </button>
                <div className="rpt-toolbar-spacer" />
                <button className="rpt-btn rpt-btn--primary" onClick={handleSave} disabled={saving}>
                  <SaveIcon size={13} />
                  {saving ? 'Đang lưu...' : 'Lưu'}
                </button>
                <button className="rpt-btn rpt-btn--ghost" onClick={handleCancel} disabled={saving}>
                  Hủy
                </button>
                <button className="rpt-btn rpt-btn--teal" onClick={handleExportCSV} disabled={saving}>
                  <DownloadIcon size={13} />
                  CSV
                </button>
              </>
            )}
          </div>

          {/* Info strip */}
          <div className="rpt-editor-info">
            <div className="rpt-info-row">
              <span className="rpt-info-code">{selectedAnalyses.analyses_code}</span>
            </div>
            {selectedAnalyses.description && (
              <p className="rpt-info-desc">{selectedAnalyses.description}</p>
            )}
          </div>

          {/* Scrollable table */}
          <div className="rpt-center-wrap">
            <div className="rpt-table-scroll">
              <table className="rpt-table">
                <thead>
                  <tr>
                    <th>{t('report.reportDescription') || 'Mô tả'}</th>
                    <th>{t('report.department') || 'Bộ phận'}</th>
                    <th>{t('report.targetDate') || 'Ngày'}</th>
                    <th>{t('report.budget') || 'Ngân sách'}</th>
                    <th>{t('report.riskLevel') || 'Rủi ro'}</th>
                    <th>{t('report.code') || 'Mã'}</th>
                    <th>{t('report.status') || 'Trạng thái'}</th>
                    {isEditing && <th />}
                  </tr>
                </thead>
                <tbody>
                  {editedItems.map(item => (
                    <tr key={item.id}>
                      <td>
                        {isEditing ? (
                          <input
                            className="rpt-input"
                            type="text"
                            value={item.report_description}
                            onChange={e => handleFieldChange(item.id, 'report_description', e.target.value)}
                            placeholder="Mô tả hành động"
                          />
                        ) : (
                          <span>{item.report_description || <span className="rpt-text-muted">—</span>}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <select
                            className="rpt-input rpt-select"
                            value={item.responsible_department}
                            onChange={e => handleFieldChange(item.id, 'responsible_department', e.target.value)}
                            aria-label="Chọn bộ phận"
                          >
                            <option value="">Chọn...</option>
                            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        ) : (
                          <span className="rpt-dept">{item.responsible_department || '—'}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="rpt-input"
                            type="date"
                            value={item.target_date}
                            onChange={e => handleFieldChange(item.id, 'target_date', e.target.value)}
                            aria-label="Ngày mục tiêu"
                          />
                        ) : (
                          <span>{formatDate(item.target_date)}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="rpt-input"
                            type="number"
                            value={item.estimated_budget}
                            onChange={e => handleFieldChange(item.id, 'estimated_budget', Number(e.target.value))}
                            placeholder="0"
                          />
                        ) : (
                          <span className="rpt-budget">
                            {item.estimated_budget.toLocaleString()} VND
                          </span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <select
                            className={`rpt-input rpt-select ${riskClass(item.estimated_risk)}`}
                            value={item.estimated_risk}
                            onChange={e => handleFieldChange(item.id, 'estimated_risk', e.target.value)}
                            aria-label="Chọn mức rủi ro"
                          >
                            <option value="">Chọn...</option>
                            {RISK_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        ) : (
                          <span className={`rpt-risk ${riskClass(item.estimated_risk)}`}>
                            {item.estimated_risk || '—'}
                          </span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="rpt-input"
                            type="text"
                            value={item.code}
                            onChange={e => handleFieldChange(item.id, 'code', e.target.value)}
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
                            className="rpt-input"
                            type="text"
                            value={item.status}
                            onChange={e => handleFieldChange(item.id, 'status', e.target.value)}
                            placeholder="Trạng thái"
                          />
                        ) : (
                          <span className="rpt-status">{item.status}</span>
                        )}
                      </td>
                      {isEditing && (
                        <td>
                          <button
                            className="rpt-btn rpt-btn--ghost"
                            onClick={() => handleDeleteRow(item.id)}
                            title="Xóa hàng"
                          >
                            <TrashIcon size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
