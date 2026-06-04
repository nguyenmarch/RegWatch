import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { RegWatchLogoIcon, LoaderIcon, ArrowRightIcon, EyeIcon, EyeOffIcon } from '../components/Icons'

export default function Login() {
  const { t } = useTranslation()
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/chat'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (isAuthenticated) {
    navigate(from, { replace: true })
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) return
    setLoading(true)
    setError(null)
    try {
      await login(username.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {/* Orbs */}
      <div className="hero-orbs" style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
      </div>

      <div className="login-card">
        {/* Logo */}
        <Link to="/" className="login-logo">
          <RegWatchLogoIcon size={36} />
          <span className="logo-text" style={{ fontSize: '1.25rem' }}>
            Reg<span className="logo-accent">Watch</span>
          </span>
        </Link>

        <h1 className="login-title">{t('login.title')}</h1>
        <p className="login-subtitle">{t('login.subtitle')}</p>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {/* Username */}
          <div className="login-field">
            <label className="login-label" htmlFor="username">{t('login.username')}</label>
            <input
              id="username"
              type="text"
              className="login-input"
              placeholder="admin"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              disabled={loading}
            />
          </div>

          {/* Password */}
          <div className="login-field">
            <label className="login-label" htmlFor="password">{t('login.password')}</label>
            <div className="login-input-wrap">
              <input
                id="password"
                type={showPwd ? 'text' : 'password'}
                className="login-input login-input--pwd"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                className="login-eye"
                onClick={() => setShowPwd(v => !v)}
                tabIndex={-1}
              >
                {showPwd ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="login-error">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="btn btn-primary login-submit"
            disabled={loading || !username.trim() || !password}
          >
            {loading
              ? <><LoaderIcon size={16} className="icon-spin" />{t('login.submitting')}</>
              : <>{t('login.submit')}<ArrowRightIcon size={15} /></>
            }
          </button>
        </form>

        <p className="login-hint">{t('login.hint')}</p>
      </div>
    </div>
  )
}
