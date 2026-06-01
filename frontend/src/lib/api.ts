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

  return res.json() as Promise<T>
}

export interface Document {
  id: number
  title: string
  file_path: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
}

export interface QueryResult {
  answer: string
  vector_context: string[]
  graph_context: string[]
}

export interface IngestPayload {
  title: string
  content: string
}

export const api = {
  health: () => request<{ status: string }>('/health'),

  ingestDocument: (payload: IngestPayload) =>
    request<{ document_id: number; message: string }>('/documents/ingest', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  query: (question: string) =>
    request<QueryResult>('/rag/query', {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),
}
