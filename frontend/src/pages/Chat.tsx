import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import ChatMessage, { type Message } from '../components/chat/ChatMessage'
import ChatInput from '../components/chat/ChatInput'
import ThinkingIndicator from '../components/chat/ThinkingIndicator'
import { SparklesIcon, TrashIcon } from '../components/Icons'

let msgId = 0
function id() { return String(++msgId) }

function buildWelcome(t: (k: string) => string): Message {
  return { id: id(), role: 'assistant', content: t('chat.welcome'), timestamp: new Date() }
}

export default function Chat() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>(() => [buildWelcome(t)])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)

  /* Scroll to bottom on new message */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || thinking) return

    const userMsg: Message = { id: id(), role: 'user', content: text, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setThinking(true)

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const { reply } = await api.chat.send(text, history)
      const botMsg: Message = { id: id(), role: 'assistant', content: reply, timestamp: new Date() }
      setMessages(prev => [...prev, botMsg])
    } catch (err) {
      const errMsg: Message = {
        id: id(),
        role: 'assistant',
        content: err instanceof Error ? err.message : t('chat.errorGeneric'),
        timestamp: new Date(),
        error: true,
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setThinking(false)
    }
  }, [input, thinking, messages, t])

  function clearChat() {
    setMessages([buildWelcome(t)])
    setInput('')
  }

  const onlyWelcome = messages.length === 1

  return (
    <div className="chat-page">

      {/* ── Topbar ── */}
      <div className="chat-topbar container">
        <div className="chat-topbar-info">
          <div className="chat-topbar-icon">
            <SparklesIcon size={16} />
          </div>
          <div>
            <p className="chat-topbar-name">RegWatch AI</p>
            <p className="chat-topbar-status">
              <span className="chat-status-dot" />
              {thinking ? t('chat.thinking') : t('chat.online')}
            </p>
          </div>
        </div>
        <button className="chat-clear-btn" onClick={clearChat} title={t('chat.clear')}>
          <TrashIcon size={15} />
          <span>{t('chat.clear')}</span>
        </button>
      </div>

      {/* ── Messages ── */}
      <div className="chat-messages" ref={messagesRef}>
        <div className="container chat-messages-inner">

          {/* Welcome / empty state */}
          {onlyWelcome && (
            <div className="chat-empty">
              <div className="chat-empty-icon">
                <SparklesIcon size={28} />
              </div>
              <p className="chat-empty-text">{t('chat.emptyHint', { name: user?.username ?? '' })}</p>
            </div>
          )}

          {messages.map((msg, i) => (
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

      {/* ── Input ── */}
      <div className="chat-input-wrapper">
        <div className="container">
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={send}
            disabled={thinking}
            thinking={thinking}
          />
        </div>
      </div>

    </div>
  )
}
