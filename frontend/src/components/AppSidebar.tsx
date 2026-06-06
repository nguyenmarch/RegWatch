import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import {
  RegWatchLogoIcon, HomeIcon, SparklesIcon, FileTextIcon,
  ActivityIcon, SunIcon, MoonIcon, GlobeIcon, LogInIcon,
  LogOutIcon, ChevronLeftIcon, MenuIcon, XIcon,
} from './Icons'

interface Props {
  collapsed: boolean
  onToggleCollapse: () => void
  mobileOpen: boolean
  onMobileClose: () => void
  onMobileOpen: () => void
}

const NAV = [
  { to: '/', icon: HomeIcon, labelKey: 'header.home', exact: true, authOnly: false },
  { to: '/chat', icon: SparklesIcon, labelKey: 'header.chat', exact: false, authOnly: true },
  { to: '/documents', icon: FileTextIcon, labelKey: 'header.documents', exact: false, authOnly: true },
  { to: '/phase3', icon: ActivityIcon, labelKey: 'header.phase3', exact: false, authOnly: true },
  { to: '/test', icon: ActivityIcon, labelKey: 'header.apiTest', exact: false, authOnly: false },
] as const

function initials(name: string) {
  return name.slice(0, 2).toUpperCase()
}

export default function AppSidebar({ collapsed, onToggleCollapse, mobileOpen, onMobileClose, onMobileOpen }: Props) {
  const { theme, toggleTheme } = useTheme()
  const { isAuthenticated, user, logout } = useAuth()
  const { pathname } = useLocation()
  const { t, i18n } = useTranslation()

  const isVI = i18n.language === 'vi'

  function toggleLang() {
    const next = isVI ? 'en' : 'vi'
    i18n.changeLanguage(next)
    localStorage.setItem('lang', next)
  }

  function isActive(to: string, exact: boolean) {
    return exact ? pathname === to : pathname.startsWith(to)
  }

  const visibleNav = NAV.filter(n => !n.authOnly || isAuthenticated)

  /* ── Shared nav markup ──────────────────────────────── */
  function NavLinks({ labels }: { labels: boolean }) {
    return (
      <nav className="sb-nav">
        {visibleNav.map(item => {
          const active = isActive(item.to, item.exact)
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onMobileClose}
              className={`sb-link ${active ? 'sb-link--active' : ''}`}
              title={!labels ? t(item.labelKey) : undefined}
            >
              <span className="sb-link-icon"><item.icon size={18} /></span>
              {labels && <span className="sb-link-text">{t(item.labelKey)}</span>}
              {active && labels && <span className="sb-link-dot" />}
            </Link>
          )
        })}
      </nav>
    )
  }

  function BottomUtils({ labels }: { labels: boolean }) {
    return (
      <>
        <div className="sb-utils">
          <button
            className="sb-util"
            onClick={toggleLang}
            title={isVI ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
          >
            <GlobeIcon size={16} />
            {labels && <span>{isVI ? 'VI' : 'EN'}</span>}
          </button>
          <button
            className="sb-util"
            onClick={toggleTheme}
            title={theme === 'dark' ? t('header.lightMode') : t('header.darkMode')}
          >
            {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
            {labels && <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>}
          </button>
        </div>

        <div className="sb-footer">
          <div className="sb-sep" />
          {isAuthenticated && user ? (
            <div className={`sb-user ${!labels ? 'sb-user--icon' : ''}`}>
              <div className="sb-avatar" title={user.username}>{initials(user.username)}</div>
              {labels && (
                <div className="sb-user-info">
                  <span className="sb-user-name">{user.username}</span>
                  <span className="sb-user-role">{user.role}</span>
                </div>
              )}
              <button
                className="sb-logout"
                onClick={() => { logout(); onMobileClose() }}
                title={t('header.signOut')}
              >
                <LogOutIcon size={15} />
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              onClick={onMobileClose}
              className={`sb-signin ${!labels ? 'sb-signin--icon' : ''}`}
              title={!labels ? t('header.signIn') : undefined}
            >
              <LogInIcon size={16} />
              {labels && <span>{t('header.signIn')}</span>}
            </Link>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      {/* ── Mobile topbar ── */}
      <header className="sb-topbar">
        <button className="sb-hamburger" onClick={onMobileOpen} aria-label="Open menu">
          <MenuIcon size={20} />
        </button>
        <Link to="/" className="sb-brand">
          <RegWatchLogoIcon size={26} />
          <span className="sb-brand-text">Reg<span className="sb-brand-accent">Watch</span></span>
        </Link>
      </header>

      {/* ── Desktop sidebar ── */}
      <aside className={`app-sidebar ${collapsed ? 'app-sidebar--sm' : ''}`}>
        {collapsed ? (
          /* Collapsed: chỉ hiện nút expand ở đầu */
          <div className="sb-head sb-head--collapsed">
            <button
              className="sb-toggle"
              onClick={onToggleCollapse}
              title="Expand sidebar"
            >
              <ChevronLeftIcon size={15} className="sb-toggle--flipped" />
            </button>
          </div>
        ) : (
          <div className="sb-head">
            <Link to="/" className="sb-brand">
              <RegWatchLogoIcon size={28} />
              <span className="sb-brand-text">Reg<span className="sb-brand-accent">Watch</span></span>
            </Link>
            <button
              className="sb-toggle"
              onClick={onToggleCollapse}
              title="Collapse sidebar"
            >
              <ChevronLeftIcon size={14} />
            </button>
          </div>
        )}

        <NavLinks labels={!collapsed} />
        <div className="sb-grow" />
        <BottomUtils labels={!collapsed} />
      </aside>

      {/* ── Mobile overlay ── */}
      {mobileOpen && <div className="sb-overlay" onClick={onMobileClose} />}

      {/* ── Mobile drawer ── */}
      <aside className={`app-sidebar app-sidebar--drawer ${mobileOpen ? 'app-sidebar--open' : ''}`}>
        <div className="sb-head sb-head--mobile">
          <Link to="/" className="sb-brand" onClick={onMobileClose}>
            <RegWatchLogoIcon size={26} />
            <span className="sb-brand-text">Reg<span className="sb-brand-accent">Watch</span></span>
          </Link>
          <button className="sb-hamburger" onClick={onMobileClose} aria-label="Close menu">
            <XIcon size={20} />
          </button>
        </div>
        <NavLinks labels={true} />
        <div className="sb-grow" />
        <BottomUtils labels={true} />
      </aside>
    </>
  )
}
