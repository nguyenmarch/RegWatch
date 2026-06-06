import type {
  ReportItem,
  ReportItemsSaveResponse,
  ReportDossier,
  ReportUpdate,
  Analyses,
  FinalizedReport,
  RecommendationResponse,
} from '../types/report'
import type { AnalysisSummary, AnalysisDetail, AnalysisUpdate } from './analyses'

const BASE_URL = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('access_token')
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options?.headers,
  }
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(error.detail ?? 'Request failed')
  }
  if (res.status === 204) {
    return undefined as T
  }

  return res.json() as Promise<T>
}

export interface User {
  id: number
  username: string
  email: string
  role: string
  is_active: boolean
  created_at: string
}

export type KbType = 'law' | 'report' | 'internal'

export interface Document {
  id: number
  title: string
  file_path: string | null
  status: 'pending' | 'processing' | 'pending_graph' | 'completed' | 'failed'
  kb_type: KbType
  created_at: string
  processing_log?: string | null
  staged_cypher?: string | null
}

export interface UploadResponse {
  document_id: number
  message: string
}

export interface ChatConversation {
  id: number
  title: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface ChatConversationDetail extends ChatConversation {
  messages: ChatMessage[]
}

export interface SendMessageResponse {
  user_message: ChatMessage
  assistant_message: ChatMessage
}

export const api = {
  health: () => request<{ status: string }>('/health'),

  auth: {
    login: async (username: string, password: string): Promise<{ access_token: string; user: User }> => {
      const form = new URLSearchParams()
      form.append('username', username)
      form.append('password', password)
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: 'Login failed' }))
        throw new Error(error.detail ?? 'Login failed')
      }
      return res.json()
    },

    me: () => request<User>('/users/me'),
  },

  chat: {
    listConversations: () =>
      request<ChatConversation[]>('/chat/conversations'),

    createConversation: (title?: string) =>
      request<ChatConversation>('/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({ title }),
      }),

    getConversation: (id: number) =>
      request<ChatConversationDetail>(`/chat/conversations/${id}`),

    sendMessage: (conversationId: number, content: string) =>
      request<SendMessageResponse>(`/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),

    async *streamMessage(conversationId: number, content: string) {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`${BASE_URL}/chat/conversations/${conversationId}/messages/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail ?? 'Stream failed')
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          try { yield JSON.parse(raw) as { token?: string; done?: boolean; error?: string; message_id?: number } }
          catch { /* ignore malformed */ }
        }
      }
    },

    deleteConversation: (id: number) =>
      request<void>(`/chat/conversations/${id}`, { method: 'DELETE' }),
  },

  documents: {
    list: (kbType?: KbType) =>
      request<Document[]>(kbType ? `/v1/documents?kb_type=${kbType}` : '/v1/documents'),

    upload: (file: File, kbType: KbType = 'law', onProgress?: (pct: number) => void) =>
      new Promise<Document>((resolve, reject) => {
        const form = new FormData()
        form.append('file', file)
        form.append('kb_type', kbType)
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${BASE_URL}/v1/documents/upload`)
        const token = localStorage.getItem('access_token')
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress)
            onProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText) as Document)
          } else {
            const detail = JSON.parse(xhr.responseText)?.detail ?? 'Upload failed'
            reject(new Error(detail))
          }
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(form)
      }),

    delete: (id: number) =>
      request<{ message: string }>(`/v1/documents/${id}`, { method: 'DELETE' }),

    downloadUrl: (id: number) =>
      `${BASE_URL}/v1/documents/${id}/download`,

    download: async (id: number, fallbackName = 'document') => {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`${BASE_URL}/v1/documents/${id}/download`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(error.detail ?? 'Download failed')
      }

      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition') || ''
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1]
      const filename = encodedName ? decodeURIComponent(encodedName) : fallbackName
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    },

    getLog: (id: number) =>
      request<{ level: string; message: string; ts: string }[]>(`/v1/documents/${id}/log`),

    getById: (id: number) =>
      request<Document>(`/v1/documents/${id}`),

    getCypherPreview: (id: number) =>
      request<{ doc_id: number; title: string; cypher: string }>(`/v1/documents/${id}/cypher-preview`),

    commitCypher: (id: number, cypher: string) =>
      request<Document>(`/v1/documents/${id}/cypher-commit`, {
        method: 'POST',
        body: JSON.stringify({ cypher }),
      }),
  },

  remediation: {
    getActionPlans: () => request<any[]>('/remediation/action-plans'),

    deleteActionPlan: (id: number) =>
      request<{ message: string }>(`/remediation/action-plans/${id}`, { method: 'DELETE' }),

    generateDocument: (task_id: number, refinement_prompt?: string, generation_type: string = 'document') =>
      request<any>('/remediation/generate', {
        method: 'POST',
        body: JSON.stringify({ task_id, refinement_prompt, generation_type }),
      }),

    generateGroupDocument: (plan_id: string, task_ids: (string|number)[], refinement_prompt?: string, generation_type: string = 'document') =>
      request<any[]>('/remediation/generate-group', {
        method: 'POST',
        body: JSON.stringify({ tasks: task_ids.map(id => ({ plan_id, task_id: String(id) })), refinement_prompt, generation_type }),
      }),

    updateDocument: (doc_id: number, content: string) =>
      request<any>(`/remediation/documents/${doc_id}`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),

    approveDocument: (doc_id: number, role: string) =>
      request<any>(`/remediation/documents/${doc_id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ role }),
      }),

    saveDraft: (doc_id: number, content: string, saved_by?: string) =>
      request<any[]>(`/remediation/documents/${doc_id}/save-draft`, {
        method: 'POST',
        body: JSON.stringify({ content, saved_by }),
      }),

    getDrafts: (doc_id: number) =>
      request<any[]>(`/remediation/documents/${doc_id}/drafts`),

    restoreDraft: (doc_id: number, draft_id: number) =>
      request<any>(`/remediation/documents/${doc_id}/drafts/${draft_id}/restore`, {
        method: 'POST',
      }),

    uploadActionPlan: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return fetch(`${BASE_URL}/remediation/upload-action-plan`, {
        method: 'POST',
        body: form,
        headers: localStorage.getItem('access_token')
          ? { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
          : {},
      }).then(async (res) => {
        if (!res.ok) throw new Error(await res.text())
        return res.json()
      })
    },
  },

  report: {
    listAnalyses: () =>
      request<Analyses[]>('/report/analyses'),

    getReportItems: (analysesId: number) =>
      request<ReportItem[]>(`/report/analyses/${analysesId}/items`),

    getReport: (analysesId: number) =>
      request<ReportDossier>(`/report/analyses/${analysesId}/report`),

    updateReport: (analysesId: number, data: ReportUpdate) =>
      request<ReportDossier>(`/report/analyses/${analysesId}/report`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    saveReportItems: (analysesId: number, items: ReportItem[]) =>
      request<ReportItemsSaveResponse>(`/report/analyses/${analysesId}/items`, {
        method: 'POST',
        body: JSON.stringify({ items }),
      }),

    finalizeReport: (analysesId: number) =>
      request<FinalizedReport>(`/report/analyses/${analysesId}/finalize`, {
        method: 'POST',
      }),

    generateLLMRecommendations: (analysesId: number, prompt: string) =>
      request<RecommendationResponse>(`/report/analyses/${analysesId}/recommendations`, {
        method: 'POST',
        body: JSON.stringify({ prompt }),
      }),
  },
  analyses: {
    list: () =>
      request<AnalysisSummary[]>('/v1/analyses'),

    get: (id: number) =>
      request<AnalysisDetail>(`/v1/analyses/${id}`),

    pending: () =>
      request<{ pending: number }>('/v1/analyses/pending'),

    patch: (id: number, data: AnalysisUpdate) =>
      request<AnalysisDetail>(`/v1/analyses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    publish: (id: number) =>
      request<AnalysisDetail>(`/v1/analyses/${id}/publish`, { method: 'POST' }),

    delete: (id: number) =>
      request<void>(`/v1/analyses/${id}`, { method: 'DELETE' }),
  },
}
