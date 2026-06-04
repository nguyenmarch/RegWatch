import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import {
  RegWatchLogoIcon, SunIcon, MoonIcon, GlobeIcon,
  ActivityIcon, HomeIcon, FileTextIcon, MenuIcon, XIcon,
  UserIcon, LogInIcon,
} from './Icons'

export default function Header() {
  const { theme, toggleTheme } = useTheme()
  const { isAuthenticated, user, logout } = useAuth()
  const { pathname } = useLocation()
  const { t, i18n } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)

  function closeMenu() { setMenuOpen(false) }

  function toggleLang() {
    const next = i18n.language === 'vi' ? 'en' : 'vi'
    i18n.changeLanguage(next)
    localStorage.setItem('lang', next)
  }

  const isVI = i18n.language === 'vi'

  return (
    <header className="header">

      {/* ── Main bar ── */}
      <div className="header-inner container">

        <Link to="/" className="logo" onClick={closeMenu}>
          <RegWatchLogoIcon size={28} />
          <span className="logo-text">
            Reg<span className="logo-accent">Watch</span>
          </span>
        </Link>

        {/* Desktop nav — chỉ hiển thị khi đã đăng nhập */}
        {isAuthenticated && (
          <nav className="nav">
            <Link to="/" className={`nav-link ${pathname === '/' ? 'active' : ''}`}>
              {t('header.home')}
            </Link>
            <Link to="/documents" className={`nav-link ${pathname === '/documents' ? 'active' : ''}`}>
              {t('header.documents')}
            </Link>
            <Link to="/test" className={`nav-link ${pathname === '/test' ? 'active' : ''}`}>
              {t('header.apiTest')}
            </Link>
          </nav>
        )}

        {/* Desktop actions */}
        <div className="header-actions">
          <button className="lang-toggle" onClick={toggleLang} title={isVI ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}>
            <GlobeIcon size={14} />
            {isVI ? 'VI' : 'EN'}
          </button>

          <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
          </button>

          <div className="auth-buttons">
            {isAuthenticated ? (
              <>
                <span className="user-badge">
                  <UserIcon size={13} />
                  {user?.username}
                </span>
                <button className="btn btn-outline btn-sm" onClick={logout}>
                  {t('header.signOut')}
                </button>
              </>
            ) : (
              <Link to="/login" className="btn btn-primary btn-sm">
                <LogInIcon size={14} />
                {t('header.signIn')}
              </Link>
            )}
          </div>

          {/* Hamburger - mobile only */}
          <button
            className={`hamburger ${menuOpen ? 'hamburger--open' : ''}`}
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <XIcon size={19} /> : <MenuIcon size={19} />}
          </button>
        </div>

      </div>

      {/* ── Mobile menu ── */}
      {menuOpen && (
        <nav className="mobile-menu container" aria-label="Mobile navigation">

          {isAuthenticated && (
            <div className="mobile-nav-group">
              <Link
                to="/"
                className={`mobile-nav-link ${pathname === '/' ? 'active' : ''}`}
                onClick={closeMenu}
              >
                <span className="mobile-nav-icon"><HomeIcon size={17} /></span>
                {t('header.home')}
              </Link>
              <Link
                to="/documents"
                className={`mobile-nav-link ${pathname === '/documents' ? 'active' : ''}`}
                onClick={closeMenu}
              >
                <span className="mobile-nav-icon"><FileTextIcon size={17} /></span>
                {t('header.documents')}
              </Link>
              <Link
                to="/test"
                className={`mobile-nav-link ${pathname === '/test' ? 'active' : ''}`}
                onClick={closeMenu}
              >
                <span className="mobile-nav-icon"><ActivityIcon size={17} /></span>
                {t('header.apiTest')}
              </Link>
            </div>
          )}

          <div className="mobile-nav-footer">
            {/* Language toggle row */}
            <button className="mobile-theme-row" onClick={toggleLang}>
              <span className="mobile-theme-label">
                <GlobeIcon size={16} />
                {isVI ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
              </span>
              <span className="mobile-theme-pill">{isVI ? 'VI' : 'EN'}</span>
            </button>

            {/* Theme toggle row */}
            <button className="mobile-theme-row" onClick={() => { toggleTheme(); closeMenu() }}>
              <span className="mobile-theme-label">
                {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
                {t(`header.${theme === 'dark' ? 'lightMode' : 'darkMode'}`)}
              </span>
              <span className="mobile-theme-pill">
                {theme === 'dark' ? 'Dark' : 'Light'}
              </span>
            </button>

            {!isAuthenticated && (
              <button className="btn btn-primary mobile-cta">{t('header.getStarted')}</button>
            )}
          </div>

        </nav>
      )}

    </header>
  )
}
