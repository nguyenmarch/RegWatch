import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import {
  RegWatchLogoIcon, SunIcon, MoonIcon,
  ActivityIcon, HomeIcon, MenuIcon, XIcon,
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
          <Link to="/" className={`nav-link ${pathname === '/' ? 'active' : ''}`}>Home</Link>
          <Link to="/test" className={`nav-link ${pathname === '/test' ? 'active' : ''}`}>API Test</Link>
        </nav>

        {/* Desktop actions */}
        <div className="header-actions">
          <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
          </button>

          <div className="auth-buttons">
            {isAuthenticated ? (
              <>
                <span className="user-name">{user?.username}</span>
                <button className="btn btn-outline btn-sm" onClick={logout}>Sign out</button>
              </>
            ) : (
              <>
                <Link to="/test" className="btn btn-outline btn-sm">
                  <ActivityIcon size={14} />
                  Health check
                </Link>
                <button className="btn btn-primary btn-sm">Get started</button>
              </>
            )}
          </div>

          {/* Hamburger — mobile only */}
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

          {/* Nav links */}
          <div className="mobile-nav-group">
            <Link
              to="/"
              className={`mobile-nav-link ${pathname === '/' ? 'active' : ''}`}
              onClick={closeMenu}
            >
              <span className="mobile-nav-icon"><HomeIcon size={17} /></span>
              Home
            </Link>
            <Link
              to="/test"
              className={`mobile-nav-link ${pathname === '/test' ? 'active' : ''}`}
              onClick={closeMenu}
            >
              <span className="mobile-nav-icon"><ActivityIcon size={17} /></span>
              API Test
            </Link>
          </div>

          {/* Bottom actions */}
          <div className="mobile-nav-footer">
            <button className="mobile-theme-row" onClick={() => { toggleTheme(); closeMenu() }}>
              <span className="mobile-theme-label">
                {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
                {theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
              </span>
              <span className="mobile-theme-pill">
                {theme === 'dark' ? 'Dark' : 'Light'}
              </span>
            </button>

            {!isAuthenticated && (
              <button className="btn btn-primary mobile-cta">Get started</button>
            )}
          </div>

        </nav>
      )}

    </header>
  )
}
