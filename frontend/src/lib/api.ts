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
  file_path: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
}

export interface UploadResponse {
  document_id: number
  message: string
}

export const api = {
  health: () => request<{ status: string }>('/health'),

  documents: {
    list: () =>
      request<Document[]>('/v1/documents'),

    upload: (file: File, onProgress?: (pct: number) => void) =>
      new Promise<UploadResponse>((resolve, reject) => {
        const form = new FormData()
        form.append('file', file)
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
            resolve(JSON.parse(xhr.responseText) as UploadResponse)
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
  },
}
