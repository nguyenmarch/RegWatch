import { useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { LoaderIcon, PaperPlaneIcon } from '../Icons'

interface Props {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  disabled: boolean
  thinking: boolean
}

export default function ChatInput({ value, onChange, onSubmit, disabled, thinking }: Props) {
  const { t } = useTranslation()
  const ref = useRef<HTMLTextAreaElement>(null)

  /* Auto-resize textarea */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [value])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!value.trim() || disabled) return
    onSubmit()
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!value.trim() || disabled) return
      onSubmit()
    }
  }

  return (
    <form className="chat-input-area" onSubmit={handleSubmit}>
      <div className={`chat-input-box ${value.trim() ? 'chat-input-box--active' : ''}`}>
        <textarea
          ref={ref}
          className="chat-input"
          placeholder={t('chat.placeholder')}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKey}
          disabled={disabled}
          rows={1}
        />
        <button
          type="submit"
          className={`chat-send-btn ${value.trim() && !disabled ? 'chat-send-btn--ready' : ''}`}
          disabled={!value.trim() || disabled}
          aria-label="Send"
        >
          {thinking
            ? <LoaderIcon size={18} className="icon-spin" />
            : <PaperPlaneIcon size={18} />
          }
        </button>
      </div>
      <p className="chat-input-hint">{t('chat.hint')}</p>
    </form>
  )
}
