import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type ChatConversation } from '../lib/api'
import { parseBackendDate } from '../lib/datetime'
import { useAuth } from '../context/AuthContext'
import ConversationSidebar from '../components/chat/ConversationSidebar'
import ChatMessage, { type Message } from '../components/chat/ChatMessage'
import ChatInput from '../components/chat/ChatInput'
import ThinkingIndicator from '../components/chat/ThinkingIndicator'
import { SparklesIcon, TrashIcon } from '../components/Icons'

function toUiMessage(message: {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}): Message {
  return {
    id: String(message.id),
    role: message.role,
    content: message.content,
    timestamp: parseBackendDate(message.created_at),
  }
}

export default function Chat() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const activeConversation = conversations.find(c => c.id === activeId) ?? null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  const refreshConversations = useCallback(async () => {
    const list = await api.chat.listConversations()
    setConversations(list)
    return list
  }, [])

  const loadConversation = useCallback(async (id: number) => {
    setActiveId(id)
    setLoadingMessages(true)
    setMobileSidebarOpen(false)
    try {
      const detail = await api.chat.getConversation(id)
      setMessages(detail.messages.map(toUiMessage))
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  const createConversation = useCallback(async () => {
    const conversation = await api.chat.createConversation()
    setConversations(prev => [conversation, ...prev])
    setMessages([])
    setActiveId(conversation.id)
    setMobileSidebarOpen(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      setLoadingConversations(true)
      try {
        const list = await refreshConversations()
        if (cancelled) return
        if (list.length > 0) {
          await loadConversation(list[0].id)
        } else {
          await createConversation()
        }
      } finally {
        if (!cancelled) setLoadingConversations(false)
      }
    }
    void boot()
    return () => { cancelled = true }
  }, [createConversation, loadConversation, refreshConversations])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || thinking || activeId === null) return

    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, optimistic])
    setInput('')
    setThinking(true)

    try {
      const result = await api.chat.sendMessage(activeId, text)
      setMessages(prev => [
        ...prev.filter(m => m.id !== optimistic.id),
        toUiMessage(result.user_message),
        toUiMessage(result.assistant_message),
      ])
      const list = await refreshConversations()
      const updated = list.find(c => c.id === activeId)
      if (updated) setActiveId(updated.id)
    } catch (err) {
      setMessages(prev => [
        ...prev.filter(m => m.id !== optimistic.id),
        {
          ...optimistic,
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: err instanceof Error ? err.message : t('chat.errorGeneric'),
          error: true,
        },
      ])
    } finally {
      setThinking(false)
    }
  }, [activeId, input, refreshConversations, thinking, t])

  async function deleteConversation(id: number) {
    await api.chat.deleteConversation(id)
    const next = conversations.filter(c => c.id !== id)
    setConversations(next)
    if (activeId === id) {
      if (next.length > 0) {
        await loadConversation(next[0].id)
      } else {
        await createConversation()
      }
    }
  }

  const empty = messages.length === 0 && !loadingMessages

  return (
    <div className="chat-shell">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        loading={loadingConversations}
        mobileOpen={mobileSidebarOpen}
        onToggleMobile={() => setMobileSidebarOpen(open => !open)}
        onNewChat={createConversation}
        onSelect={loadConversation}
        onDelete={deleteConversation}
      />

      <section className="chat-page">
        <div className="chat-topbar">
          <div className="chat-topbar-info">
            <div className="chat-topbar-icon">
              <SparklesIcon size={16} />
            </div>
            <div>
              <p className="chat-topbar-name">{activeConversation?.title ?? t('chat.newChat')}</p>
              <p className="chat-topbar-status">
                <span className="chat-status-dot" />
                {thinking ? t('chat.thinking') : t('chat.online')}
              </p>
            </div>
          </div>
          <button
            className="chat-clear-btn"
            onClick={() => activeId !== null && deleteConversation(activeId)}
            disabled={activeId === null}
            title={t('chat.deleteChat')}
          >
            <TrashIcon size={15} />
            <span>{t('chat.deleteChat')}</span>
          </button>
        </div>

        <div className="chat-messages">
          <div className="chat-messages-inner">
            {loadingMessages && (
              <div className="chat-loading-state">
                <ThinkingIndicator />
              </div>
            )}

            {empty && (
              <div className="chat-empty">
                <div className="chat-empty-icon">
                  <SparklesIcon size={28} />
                </div>
                <h2 className="chat-empty-title">{t('chat.emptyTitle')}</h2>
                <p className="chat-empty-text">{t('chat.emptyHint', { name: user?.username ?? '' })}</p>
              </div>
            )}

            {!loadingMessages && messages.map((msg, i) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                isLatest={i === messages.length - 1}
              />
            ))}

            {thinking && <ThinkingIndicator />}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="chat-input-wrapper">
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={send}
            disabled={thinking || activeId === null}
            thinking={thinking}
          />
        </div>
      </section>
    </div>
  )
}
