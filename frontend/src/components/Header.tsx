import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import {
  RegWatchLogoIcon, SunIcon, MoonIcon,
  ActivityIcon, MenuIcon, XIcon,
} from './Icons'

export default function Header() {
  const { theme, toggleTheme } = useTheme()
  const { isAuthenticated, user, logout } = useAuth()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  function closeMenu() { setMenuOpen(false) }

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

        {/* Desktop nav */}
        <nav className="nav">
          <Link to="/" className={`nav-link ${pathname === '/' ? 'active' : ''}`}>
            Home
          </Link>
          <Link to="/test" className={`nav-link ${pathname === '/test' ? 'active' : ''}`}>
            API Test
          </Link>
        </nav>

        {/* Desktop actions */}
        <div className="header-actions">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
          </button>

          {isAuthenticated ? (
            <div className="auth-buttons">
              <span className="user-name">{user?.username}</span>
              <button className="btn btn-outline btn-sm" onClick={logout}>Sign out</button>
            </div>
          ) : (
            <div className="auth-buttons">
              <Link to="/test" className="btn btn-outline btn-sm">
                <ActivityIcon size={14} />
                Health check
              </Link>
              <button className="btn btn-primary btn-sm">Get started</button>
            </div>
          )}

          {/* Hamburger — mobile only */}
          <button
            className="hamburger"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
          </button>
        </div>
      </div>

      {/* ── Mobile menu ── */}
      {menuOpen && (
        <div className="mobile-menu container">
          <Link
            to="/"
            className={`mobile-nav-link ${pathname === '/' ? 'active' : ''}`}
            onClick={closeMenu}
          >
            Home
          </Link>
          <Link
            to="/test"
            className={`mobile-nav-link ${pathname === '/test' ? 'active' : ''}`}
            onClick={closeMenu}
          >
            <ActivityIcon size={16} />
            API Test
          </Link>

          <div className="mobile-nav-divider" />

          <div className="mobile-nav-actions">
            <button
              className="theme-toggle"
              onClick={() => { toggleTheme(); closeMenu() }}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            {!isAuthenticated && (
              <button className="btn btn-primary" style={{ flex: 1 }}>
                Get started
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
