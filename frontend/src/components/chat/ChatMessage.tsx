import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { UserIcon } from '../Icons'
import { formatGmt7Time } from '../../lib/datetime'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  error?: boolean
}

interface Props {
  message: Message
  isLatest: boolean
  isStreaming?: boolean
}

export default function ChatMessage({ message, isLatest, isStreaming }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={`chat-message ${isUser ? 'chat-message--user' : 'chat-message--bot'} ${isLatest ? 'chat-message--latest' : ''} ${isStreaming ? 'chat-message--streaming' : ''}`}>
      {!isUser && (
        <div className="chat-avatar chat-avatar--bot">
          <img src="/regwatch-logo.svg" width={22} height={22} alt="RegWatch" />
        </div>
      )}

      <div className="chat-bubble-wrap">
        <div className={`chat-bubble ${isUser ? 'chat-bubble--user' : 'chat-bubble--bot'} ${message.error ? 'chat-bubble--error' : ''}`}>
          {isUser ? (
            <p className="chat-bubble-text">{message.content}</p>
          ) : (
            <div className="chat-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        <span className="chat-timestamp">{formatGmt7Time(message.timestamp)}</span>
      </div>

      {isUser && (
        <div className="chat-avatar chat-avatar--user">
          <UserIcon size={16} />
        </div>
      )}
    </div>
  )
}
