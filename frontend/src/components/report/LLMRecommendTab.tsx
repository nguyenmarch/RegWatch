import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Document } from '../../lib/api'
import type { Analyses, ReportItem } from '../../types/report'
import { SparklesIcon, CheckIcon } from '../Icons'
import { api } from '../../lib/api'
import { formatGmt7DateTime } from '../../lib/datetime'

interface LLMRecommendTabProps {
  selectedAnalyses: Analyses | null
  kbDocuments: Document[]
  onPush?: (items: ReportItem[]) => Promise<void>
  reportLocked?: boolean
}

export default function LLMRecommendTab({
  selectedAnalyses,
  kbDocuments,
  onPush,
  reportLocked,
}: LLMRecommendTabProps) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [recommendations, setRecommendations] = useState<ReportItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [pushing, setPushing] = useState(false)
  const [pushedCount, setPushedCount] = useState(0)

  const formatDate = (value: string) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString('vi-VN')
  }

  const handleGenerate = async () => {
    if (!selectedAnalyses) return
    setLoading(true)
    setSelectedIndices(new Set())
    setPushedCount(0)
    try {
      const kbText = kbDocuments.map(d => `- ${d.title}`).join('\n')
      const finalPrompt = [
        t('report.llm.systemRole') || 'Bạn là trợ lý giúp xây dựng Report cho CEO.',
        '',
        `### ${t('report.llm.analysisInfo') || 'Thông tin Analyses'}`,
        `- ${t('report.llm.analysisCode') || 'Mã Analyses'}: ${selectedAnalyses.analyses_code}`,
        `- ${t('report.llm.severity') || 'Mức độ'}: ${selectedAnalyses.severity}`,
        `- ${t('report.llm.title') || 'Tiêu đề'}: ${selectedAnalyses.title}`,
        `- ${t('report.llm.description') || 'Mô tả'}: ${selectedAnalyses.description}`,
        '',
        `### ${t('report.llm.ceoKb') || 'Knowledge Base của CEO'}`,
        kbDocuments.length ? kbText : `- (${t('report.llm.noReferenceDocs') || 'Chưa có tài liệu tham khảo'})`,
        '',
        `### ${t('report.llm.userPrompt') || 'Prompt người dùng'}`,
        prompt.trim() ? prompt.trim() : `(${t('report.llm.noPrompt') || 'không có'})`,
        '',
        `### ${t('report.llm.outputRequirements') || 'Yêu cầu đầu ra'}`,
        t('report.llm.actionPlanInstruction') || 'Hãy đề xuất bảng action plan để bộ phận phụ trách tham khảo.',
        t('report.llm.requiredFields') || 'Mỗi dòng phải có: report_description, responsible_department, target_date, estimated_budget, estimated_risk, code, status, deliverable_type, owner_role, co_owner_role, dependency, evidence_document.',
        t('report.llm.departmentConstraint') || 'responsible_department chỉ được dùng đúng một trong các giá trị: Khối Công nghệ, Khối Vận hành, Khối Pháp chế, Khối BoD, Khối Marketing.',
        t('report.llm.riskConstraint') || 'estimated_risk chỉ được dùng đúng một trong các giá trị: Cao, Trung bình, Thấp.',
      ].join('\n')
      const result = await api.report.generateLLMRecommendations(selectedAnalyses.id, finalPrompt)
      setRecommendations(result.recommendations)
    } catch (err) {
      console.error('Failed to generate recommendations:', err)
      window.alert(t('report.toast.llmError') || 'Failed to generate recommendations')
    } finally {
      setLoading(false)
    }
  }

  const toggleSelect = (idx: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const allSelected = recommendations.length > 0 && selectedIndices.size === recommendations.length
  const someSelected = selectedIndices.size > 0

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIndices(new Set())
    else setSelectedIndices(new Set(recommendations.map((_, i) => i)))
  }

  const handlePush = async () => {
    if (!onPush || !someSelected || pushing) return
    const selected = recommendations.filter((_, i) => selectedIndices.has(i))
    setPushing(true)
    try {
      await onPush(selected)
      const count = selected.length
      setSelectedIndices(new Set())
      setPushedCount(count)
      setTimeout(() => setPushedCount(0), 3500)
    } catch {
      // parent handles alert
    } finally {
      setPushing(false)
    }
  }

  if (!selectedAnalyses) {
    return (
      <div className="rpt-ai-empty">
        <SparklesIcon size={28} />
        <p>{t('report.selectAnalysesFirst') || 'Chọn một Analyses để tạo gợi ý AI'}</p>
      </div>
    )
  }

  return (
    <div className="rpt-ai-body">
      {/* Prompt */}
      <div>
        <p className="rpt-section-label">{t('report.llmPrompt') || 'Prompt cho AI'}</p>
        <textarea
          className="rpt-textarea"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={t('report.llmPromptPlaceholder') || 'Nhập yêu cầu hoặc câu hỏi...'}
          rows={5}
        />
        <button
          className="rpt-btn rpt-gen-btn"
          onClick={handleGenerate}
          disabled={loading}
        >
          <SparklesIcon size={15} />
          {loading ? t('report.processing') || 'Đang xử lý...' : t('report.generateRecommendations') || 'Tạo gợi ý'}
        </button>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div>
          <div className="rpt-rec-header">
            <p className="rpt-section-label" style={{ margin: 0 }}>
              {t('report.recommendations') || 'Gợi ý từ AI'}
              <span className="rpt-rec-count">{recommendations.length}</span>
            </p>
            {someSelected && (
              <span className="rpt-sel-badge">{selectedIndices.size} đã chọn</span>
            )}
          </div>

          <div className="rpt-table-scroll rpt-ai-table-wrap" style={{ marginTop: 8 }}>
            <table className="rpt-table rpt-ai-table">
              <thead>
                <tr>
                  <th className="rpt-check-col">
                    <label className="rpt-check-wrap">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                      />
                      <span className="rpt-check-box" />
                    </label>
                  </th>
                  <th>{t('report.reportDescription') || 'Mô tả'}</th>
                  <th>{t('report.department') || 'Bộ phận'}</th>
                  <th>{t('report.targetDate') || 'Ngày'}</th>
                  <th>{t('report.budget') || 'Ngân sách'}</th>
                  <th>{t('report.riskLevel') || 'Rủi ro'}</th>
                  <th>{t('report.code') || 'Mã'}</th>
                  <th>{t('report.status') || 'Trạng thái'}</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((rec, idx) => (
                  <tr
                    key={rec.code || idx}
                    className={selectedIndices.has(idx) ? 'rpt-ai-row-selected' : ''}
                    style={{ '--d': `${idx * 60}ms` } as React.CSSProperties}
                    onClick={() => toggleSelect(idx)}
                  >
                    <td className="rpt-check-col" onClick={e => e.stopPropagation()}>
                      <label className="rpt-check-wrap">
                        <input
                          type="checkbox"
                          checked={selectedIndices.has(idx)}
                          onChange={() => toggleSelect(idx)}
                        />
                        <span className="rpt-check-box" />
                      </label>
                    </td>
                    <td>
                      <div className="rpt-desc-scroll">
                        {rec.report_description || <span className="rpt-text-muted">—</span>}
                      </div>
                    </td>
                    <td><span className="rpt-dept">{rec.responsible_department || '—'}</span></td>
                    <td>{formatDate(rec.target_date)}</td>
                    <td><span className="rpt-budget">{Number(rec.estimated_budget || 0).toLocaleString()} VND</span></td>
                    <td><span className="rpt-risk">{rec.estimated_risk || '—'}</span></td>
                    <td>{rec.code || '—'}</td>
                    <td><span className="rpt-status">{rec.status || t('report.defaultItemStatus') || 'Cần xử lý'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Push bar */}
          <div className="rpt-push-bar">
            {pushedCount > 0 && (
              <span className="rpt-push-success">
                <CheckIcon size={12} />
                Đã thêm {pushedCount} mục vào Report
              </span>
            )}
            <div style={{ flex: 1 }} />
            <button
              className="rpt-btn rpt-push-btn"
              onClick={handlePush}
              disabled={!someSelected || pushing || reportLocked || !onPush}
              title={reportLocked ? 'Report đã chốt' : undefined}
            >
              {pushing
                ? 'Đang thêm...'
                : someSelected
                  ? `Áp dụng ${selectedIndices.size} gợi ý vào Report`
                  : 'Chọn gợi ý để áp dụng'}
            </button>
          </div>
        </div>
      )}

      {/* KB Documents */}
      <div>
        <p className="rpt-section-label">{t('report.kbDocuments') || 'Tài liệu tham khảo'}</p>
        {kbDocuments.length > 0 ? (
          <div className="rpt-kb-list">
            {kbDocuments.map(doc => (
              <div key={doc.id} className="rpt-kb-doc">
                <svg
                  className="rpt-kb-doc-icon"
                  width={14} height={14}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="rpt-kb-doc-name">{doc.title}</span>
                <span className="rpt-kb-doc-date">{formatGmt7DateTime(doc.created_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="rpt-ai-empty" style={{ padding: '20px 0' }}>
            {t('report.noKbDocuments') || 'Chưa có tài liệu'}
          </p>
        )}
      </div>
    </div>
  )
}
