import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Document } from '../../lib/api'
import { UploadCloudIcon, TrashIcon, DownloadIcon, RefreshIcon, LoaderIcon } from '../Icons'
import { api } from '../../lib/api'

interface KnowledgeBaseTabProps {
  documents: Document[]
  onRefresh: () => Promise<void>
}

export default function KnowledgeBaseTab({
  documents,
  onRefresh,
}: KnowledgeBaseTabProps) {
  const { t } = useTranslation()
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    await handleUpload(files)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      handleUpload(files)
    }
  }

  const handleUpload = async (files: File[]) => {
    if (files.length === 0) return

    setUploading(true)
    try {
      for (const file of files) {
        await api.documents.upload(file, 'report')
      }
      window.alert(t('report.toast.uploadSuccess') || 'Upload thành công')
      await onRefresh()
    } catch (err) {
      console.error('Upload failed:', err)
      window.alert(t('report.toast.uploadError') || 'Upload thất bại')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (docId: number) => {
    if (!window.confirm(t('report.confirmDelete') || 'Bạn có chắc chắn muốn xóa?')) {
      return
    }

    try {
      await api.documents.delete(docId)
      window.alert(t('report.toast.deleteSuccess') || 'Xóa thành công')
      await onRefresh()
    } catch (err) {
      console.error('Delete failed:', err)
      window.alert(t('report.toast.deleteError') || 'Xóa thất bại')
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="kb-tab">
      {/* Upload Section */}
      <div className="kb-section">
        <h3>{t('report.uploadDocuments') || 'Upload Tài Liệu'}</h3>

        <div
          className={`upload-zone ${isDragOver ? 'upload-zone--dragover' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="upload-zone-content">
            <UploadCloudIcon size={40} className="upload-icon" />
            <h4>{t('report.dragDropFiles') || 'Kéo thả tệp vào đây'}</h4>
            <p>{t('report.dragDropDesc') || 'hoặc'}</p>
            <label className="file-input-label">
              {uploading ? (
                <>
                  <LoaderIcon size={16} className="icon-spin" />
                  Đang tải lên...
                </>
              ) : (
                <>
                  <UploadCloudIcon size={16} />
                  Chọn tệp
                </>
              )}
              <input
                type="file"
                multiple
                onChange={handleFileSelect}
                disabled={uploading}
                className="file-input"
              />
            </label>
            <p className="file-types">
              {t('report.supportedFormats') || 'PDF, Word, Excel được hỗ trợ'}
            </p>
          </div>
        </div>
      </div>

      {/* Documents List */}
      <div className="kb-section">
        <div className="kb-section-header">
          <h3>{t('report.uploadedDocuments') || 'Tài Liệu Đã Upload'}</h3>
          <button
            className="btn btn-outline btn-sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshIcon size={14} className={refreshing ? 'icon-spin' : ''} />
            {refreshing ? 'Đang cập nhật...' : t('report.refresh') || 'Làm mới'}
          </button>
        </div>

        {documents.length > 0 ? (
          <div className="documents-table">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>{t('report.filename') || 'Tên tệp'}</th>
                  <th style={{ width: '20%' }}>{t('report.uploadedDate') || 'Ngày upload'}</th>
                  <th style={{ width: '30%' }}>{t('report.actions') || 'Hành động'}</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc, idx) => (
                  <tr key={doc.id} className={idx % 2 === 0 ? 'row-alt' : ''}>
                    <td>
                      <div className="doc-name-cell">
                        <span className="doc-icon">📄</span>
                        <span>{doc.title}</span>
                      </div>
                    </td>
                    <td>{new Date(doc.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="doc-actions">
                        <button
                          className="action-btn action-download"
                          title={t('report.download') || 'Download'}
                          onClick={() => api.documents.download(doc.id, doc.title)}
                        >
                          <DownloadIcon size={16} />
                        </button>
                        <button
                          className="action-btn action-delete"
                          title={t('report.delete') || 'Delete'}
                          onClick={() => handleDelete(doc.id)}
                        >
                          <TrashIcon size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-documents">
            <p>{t('report.noDocumentsUploaded') || 'Chưa có tài liệu nào được upload'}</p>
          </div>
        )}
      </div>

      <style>{`
        .kb-tab {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 20px;
        }

        .kb-section {
          margin-bottom: 30px;
        }

        .kb-section:last-child {
          margin-bottom: 0;
        }

        .kb-section h3 {
          margin: 0 0 15px 0;
          font-size: 16px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .kb-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }

        .kb-section-header h3 {
          margin: 0;
        }

        .upload-zone {
          border: 2px dashed #d0d0d0;
          border-radius: 8px;
          padding: 40px 20px;
          text-align: center;
          transition: all 0.2s;
          cursor: pointer;
        }

        .upload-zone--dragover {
          border-color: #2563eb;
          background: #f0f9ff;
        }

        .upload-zone-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }

        .upload-icon {
          color: #999;
          margin-bottom: 5px;
        }

        .upload-zone h4 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .upload-zone p {
          margin: 5px 0;
          font-size: 14px;
          color: #666;
        }

        .file-input-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: #2563eb;
          color: white;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: background 0.2s;
        }

        .file-input-label:hover {
          background: #1d4ed8;
        }

        .file-input {
          display: none;
        }

        .file-types {
          font-size: 12px;
          color: #999;
          margin-top: 10px;
        }

        .documents-table {
          overflow-x: auto;
        }

        .documents-table table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        .documents-table thead {
          background: #f5f5f5;
        }

        .documents-table th {
          padding: 12px;
          text-align: left;
          font-weight: 600;
          color: #333;
          border-bottom: 2px solid #e0e0e0;
        }

        .documents-table td {
          padding: 12px;
          border-bottom: 1px solid #f0f0f0;
        }

        .documents-table .row-alt {
          background: #fafafa;
        }

        .doc-name-cell {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .doc-icon {
          font-size: 18px;
          flex-shrink: 0;
        }

        .doc-actions {
          display: flex;
          gap: 8px;
        }

        .action-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px;
          border-radius: 4px;
          transition: all 0.2s;
          display: flex;
          align-items: center;
        }

        .action-download {
          color: #2563eb;
        }

        .action-download:hover {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .action-delete {
          color: #dc2626;
        }

        .action-delete:hover {
          background: #fee2e2;
          color: #991b1b;
        }

        .empty-documents {
          text-align: center;
          padding: 40px 20px;
          color: #999;
          font-size: 14px;
        }

        .btn {
          padding: 8px 12px;
          border: 1px solid #d0d0d0;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
          background: white;
          color: #333;
        }

        .btn:hover {
          background: #f9f9f9;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-sm {
          padding: 6px 10px;
          font-size: 12px;
        }

        .btn-outline {
          border-color: #d0d0d0;
        }

        .icon-spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}
