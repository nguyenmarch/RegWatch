import { useTranslation } from 'react-i18next'
import type { ChatConversation } from '../../lib/api'
import { PlusIcon, TrashIcon, RegWatchLogoIcon, MenuIcon, XIcon } from '../Icons'

interface Props {
  conversations: ChatConversation[]
  activeId: number | null
  loading: boolean
  mobileOpen: boolean
  onToggleMobile: () => void
  onNewChat: () => void
  onSelect: (id: number) => void
  onDelete: (id: number) => void
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value))
}

export default function ConversationSidebar({
  conversations,
  activeId,
  loading,
  mobileOpen,
  onToggleMobile,
  onNewChat,
  onSelect,
  onDelete,
}: Props) {
  const { t } = useTranslation()

  return (
    <>
      <button className="chat-mobile-sidebar-btn" onClick={onToggleMobile} aria-label="Toggle conversations">
        {mobileOpen ? <XIcon size={18} /> : <MenuIcon size={18} />}
      </button>

      {mobileOpen && <button className="chat-sidebar-scrim" onClick={onToggleMobile} aria-label="Close sidebar" />}

      <aside className={`chat-sidebar ${mobileOpen ? 'chat-sidebar--open' : ''}`}>
        <div className="chat-sidebar-head">
          <div className="chat-sidebar-brand">
            <RegWatchLogoIcon size={22} />
            <span>{t('chat.sidebarTitle')}</span>
          </div>
          <button className="chat-new-btn" onClick={onNewChat}>
            <PlusIcon size={16} />
            {t('chat.newChat')}
          </button>
        </div>

        <div className="chat-conv-list">
          {loading && (
            <>
              <div className="chat-conv-skeleton" />
              <div className="chat-conv-skeleton" />
              <div className="chat-conv-skeleton" />
            </>
          )}

          {!loading && conversations.length === 0 && (
            <div className="chat-conv-empty">{t('chat.noConversations')}</div>
          )}

          {!loading && conversations.map(conversation => (
            <button
              key={conversation.id}
              className={`chat-conv-item ${conversation.id === activeId ? 'chat-conv-item--active' : ''}`}
              onClick={() => onSelect(conversation.id)}
            >
              <span className="chat-conv-title">{conversation.title}</span>
              <span className="chat-conv-time">{formatDate(conversation.updated_at)}</span>
              <span
                className="chat-conv-delete"
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(conversation.id)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    onDelete(conversation.id)
                  }
                }}
                aria-label={t('chat.deleteChat')}
              >
                <TrashIcon size={14} />
              </span>
            </button>
          ))}
        </div>
      </aside>
    </>
  )
}
