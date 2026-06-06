import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Document } from '../../lib/api'
import type { Analyses } from '../../types/report'
import { SparklesIcon } from '../Icons'
import { api } from '../../lib/api'
import { formatGmt7DateTime } from '../../lib/datetime'

interface LLMRecommendTabProps {
  selectedAnalyses: Analyses | null
  kbDocuments: Document[]
}

export default function LLMRecommendTab({ selectedAnalyses, kbDocuments }: LLMRecommendTabProps) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [recommendations, setRecommendations] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const handleGenerate = async () => {
    if (!selectedAnalyses) return
    setLoading(true)
    try {
      const kbText = kbDocuments.map(d => `- ${d.title}`).join('\n')
      const finalPrompt = [
        'Bạn là trợ lý giúp xây dựng Report cho CEO.',
        '',
        '### Thông tin Analyses',
        `- Mã Analyses: ${selectedAnalyses.analyses_code}`,
        `- Mức độ: ${selectedAnalyses.severity}`,
        `- Tiêu đề: ${selectedAnalyses.title}`,
        `- Mô tả: ${selectedAnalyses.description}`,
        '',
        '### Knowledge Base của CEO',
        kbDocuments.length ? kbText : '- (Chưa có tài liệu tham khảo)',
        '',
        '### Prompt người dùng',
        prompt.trim() ? prompt.trim() : '(không có)',
        '',
        '### Yêu cầu đầu ra',
        'Hãy đề xuất các gợi ý/chương hành động cụ thể, ưu tiên tính khả thi và tuân thủ.',
      ].join('\n')
      const result = await api.analyses.generateLLMRecommendations(selectedAnalyses.id, finalPrompt)
      setRecommendations(result.recommendations)
    } catch (err) {
      console.error('Failed to generate recommendations:', err)
      window.alert(t('report.toast.llmError') || 'Failed to generate recommendations')
    } finally {
      setLoading(false)
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
          disabled={loading || !prompt.trim()}
        >
          <SparklesIcon size={15} />
          {loading ? 'Đang xử lý...' : 'Tạo gợi ý'}
        </button>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div>
          <p className="rpt-section-label">{t('report.recommendations') || 'Gợi ý từ AI'}</p>
          <div className="rpt-rec-list">
            {recommendations.map((rec, idx) => (
              <div
                key={idx}
                className="rpt-rec"
                style={{ '--d': `${idx * 60}ms` } as React.CSSProperties}
              >
                <div className="rpt-rec-n">{idx + 1}</div>
                <div className="rpt-rec-t">{rec}</div>
              </div>
            ))}
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
