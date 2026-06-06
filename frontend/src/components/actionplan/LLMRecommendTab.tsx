import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Document } from '../../lib/api'
import type { Alert } from '../../types/actionplan'
import { SparklesIcon } from '../Icons'
import { api } from '../../lib/api'
import { formatGmt7DateTime } from '../../lib/datetime'

interface LLMRecommendTabProps {
  selectedAlert: Alert | null
  kbDocuments: Document[]
}

export default function LLMRecommendTab({
  selectedAlert,
  kbDocuments,
}: LLMRecommendTabProps) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [recommendations, setRecommendations] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const handleGenerateRecommendations = async () => {
    if (!selectedAlert) return

    setLoading(true)
    try {
      // Intergrate: prompt + CEO knowledge base (kbDocuments)
      // If backend API not ready, we still build the finalPrompt for future integration.
      const kbText = kbDocuments
        .map(d => `- ${d.title}`)
        .join('\n')

      const finalPrompt = [
        'Bạn là trợ lý giúp xây dựng Action Plan cho CEO.',
        '',
        '### Thông tin cảnh báo (Alert)',
        `- Mã cảnh báo: ${selectedAlert.alert_code}`,
        `- Mức độ: ${selectedAlert.severity}`,
        `- Tiêu đề: ${selectedAlert.title}`,
        `- Mô tả: ${selectedAlert.description}`,
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

      const result = await api.actionPlan.generateLLMRecommendations(selectedAlert.id, finalPrompt)
      setRecommendations(result.recommendations)
    } catch (err) {
      console.error('Failed to generate recommendations:', err)
      alert(t('actionPlan.toast.llmError') || 'Failed to generate recommendations')
    } finally {
      setLoading(false)
    }
  }

  if (!selectedAlert) {
    return (
      <div className="empty-alert-state">
        <p>{t('actionPlan.selectAlertFirst') || 'Vui lòng chọn một cảnh báo'}</p>
      </div>
    )
  }

  return (
    <div className="llm-recommend-tab">
      <div className="llm-container">
        {/* Prompt Section */}
        <div className="llm-section">
          <h3>{t('actionPlan.llmPrompt') || 'Prompt cho LLM'}</h3>
          <div className="prompt-area">
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={t('actionPlan.llmPromptPlaceholder') || 'Nhập yêu cầu hoặc câu hỏi cho AI...'}
              className="prompt-input"
              rows={5}
            />
            <button
              className="btn btn-primary btn-generate"
              onClick={handleGenerateRecommendations}
              disabled={loading || !prompt.trim()}
            >
              <SparklesIcon size={16} />
              {loading ? 'Đang xử lý...' : 'Tạo gợi ý'}
            </button>
          </div>
        </div>

        {/* Recommendations Section */}
        {recommendations.length > 0 && (
          <div className="llm-section recommendations">
            <h3>{t('actionPlan.recommendations') || 'Gợi ý từ LLM'}</h3>
            <div className="recommendations-list">
              {recommendations.map((rec, idx) => (
                <div key={idx} className="recommendation-item">
                  <div className="rec-number">{idx + 1}</div>
                  <div className="rec-content">{rec}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Knowledge Base Documents */}
        <div className="llm-section">
          <h3>{t('actionPlan.kbDocuments') || 'Tài liệu tham khảo (Knowledge Base)'}</h3>
          
          {kbDocuments.length > 0 ? (
            <div className="kb-docs-list">
              {kbDocuments.map(doc => (
                <div key={doc.id} className="kb-doc-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: 0, flex: 1 }}>
                    <div className="doc-icon">📄</div>
                    <div className="doc-info" style={{ minWidth: 0 }}>
                      <div className="doc-name">{doc.title}</div>
                      <div className="doc-date">
                        {formatGmt7DateTime(doc.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-docs">
              {t('actionPlan.noKbDocuments') || 'Chưa có tài liệu nào'}
            </p>
          )}
        </div>
      </div>

      <style>{`
        .empty-alert-state {
          padding: 60px 20px;
          text-align: center;
          color: #999;
        }

        .llm-recommend-tab {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 20px;
        }

        [data-theme="dark"] .llm-recommend-tab {
          background: transparent;
          border-color: rgba(255, 255, 255, 0.10);
        }

        [data-theme="dark"] .llm-section h3 {
          color: var(--text-1);
        }

        [data-theme="dark"] .prompt-input {
          background: rgba(2, 18, 32, 0.72);
          border-color: rgba(255, 255, 255, 0.14);
          color: #f8fafc;
        }

        [data-theme="dark"] .prompt-input::placeholder {
          color: var(--text-3);
        }

        [data-theme="dark"] .recommendations {
          background: rgba(37, 99, 235, 0.10);
          border-color: rgba(96, 165, 250, 0.22);
        }

        [data-theme="dark"] .recommendations h3 {
          color: #93c5fd;
        }

        [data-theme="dark"] .recommendation-item {
          background: rgba(255, 255, 255, 0.03);
          border-left-color: rgba(37, 99, 235, 0.9);
        }

        [data-theme="dark"] .rec-content {
          color: var(--text-1);
        }

        [data-theme="dark"] .kb-doc-item {
          background: rgba(255, 255, 255, 0.045);
          border-color: rgba(255, 255, 255, 0.10);
        }

        [data-theme="dark"] .kb-doc-item:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: var(--border-h);
        }

        [data-theme="dark"] .doc-name {
          color: var(--text-1);
        }

        [data-theme="dark"] .doc-date {
          color: var(--text-3);
        }

        [data-theme="dark"] .empty-docs {
          color: #94a3b8;
        }

        [data-theme="dark"] .btn-primary {
          background: #2563eb;
          border-color: #3b82f6;
          color: #ffffff;
        }

        [data-theme="dark"] .btn-primary:hover:not(:disabled) {
          background: #1d4ed8;
          border-color: #60a5fa;
        }

        .llm-container {
          max-width: 1000px;
        }

        .llm-section {
          margin-bottom: 30px;
        }

        .llm-section h3 {
          margin: 0 0 15px 0;
          font-size: 16px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .prompt-area {
          display: flex;
          gap: 15px;
          align-items: flex-start;
        }

        .prompt-input {
          flex: 1;
          padding: 12px;
          border: 1px solid #d0d0d0;
          border-radius: 6px;
          font-family: inherit;
          font-size: 14px;
          resize: vertical;
          min-height: 120px;
        }

        .prompt-input:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
        }

        .btn-generate {
          flex-shrink: 0;
          height: fit-content;
        }

        .recommendations {
          background: #f0f9ff;
          padding: 15px;
          border-radius: 6px;
          border: 1px solid #bfdbfe;
        }

        .recommendations h3 {
          color: #1e40af;
        }

        .recommendations-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .recommendation-item {
          display: flex;
          gap: 12px;
          background: white;
          padding: 12px;
          border-radius: 6px;
          border-left: 3px solid #3b82f6;
        }

        .rec-number {
          flex-shrink: 0;
          width: 28px;
          height: 28px;
          background: #3b82f6;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 13px;
        }

        .rec-content {
          flex: 1;
          font-size: 14px;
          line-height: 1.6;
          color: #333;
        }

        .kb-docs-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .kb-doc-item {
          display: flex;
          gap: 12px;
          padding: 12px;
          background: #f9f9f9;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .kb-doc-item:hover {
          background: #f5f5f5;
          border-color: #d0d0d0;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .doc-icon {
          font-size: 24px;
          flex-shrink: 0;
        }

        .doc-info {
          flex: 1;
          min-width: 0;
        }

        .doc-name {
          font-weight: 500;
          color: #333;
          font-size: 14px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .doc-date {
          font-size: 12px;
          color: #999;
          margin-top: 3px;
        }

        .empty-docs {
          text-align: center;
          color: #999;
          font-size: 14px;
          margin: 20px 0;
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

        .btn-delete-doc {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 14px;
          padding: 6px;
          border-radius: 4px;
          transition: background-color 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-delete-doc:hover:not(:disabled) {
          background-color: rgba(220, 38, 38, 0.1);
        }
      `}</style>
    </div>
  )
}
