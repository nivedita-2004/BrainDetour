import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import './Navbar.css'
import { NAV_LINKS, AUTH_LINKS, APP_CONFIG } from '../../lib/constants'
import { useTheme } from '../../hooks/useTheme'
import { useAuth } from '../../hooks/useAuth'
import { ProfileMenu } from './ProfileMenu'
import { Button } from '../ui/Button'

/**
 * Shared application navigation header with floating claymorphic bar,
 * accessible theme mode toggle, scholar profile menu, and responsive mobile drawer.
 */
export function Navbar() {
  const { theme, toggleTheme } = useTheme()
  const { user, isAuthenticated, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLinkClick = () => {
    setMobileMenuOpen(false)
  }

  return (
    <header className="app-navbar">
      <div className="app-navbar__container">
        <Link to="/" className="app-navbar__brand" onClick={handleLinkClick}>
          <span className="app-navbar__logo-badge" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/>
            </svg>
          </span>
          <span className="app-navbar__brand-name">{APP_CONFIG.name}</span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="app-navbar__nav" aria-label="Main Navigation">
          {NAV_LINKS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `app-navbar__link ${isActive ? 'app-navbar__link--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Action Controls & Theme Toggle */}
        <div className="app-navbar__actions">
          <button
            type="button"
            className="app-navbar__theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </button>

          <div className="app-navbar__auth-desktop">
            {isAuthenticated ? (
              <ProfileMenu />
            ) : (
              <Link to={AUTH_LINKS.login.path}>
                <Button variant="primary" size="sm">
                  {AUTH_LINKS.login.label}
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile Menu Hamburger Button */}
          <button
            type="button"
            className={`app-navbar__mobile-toggle ${mobileMenuOpen ? 'app-navbar__mobile-toggle--open' : ''}`}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            <span className="app-navbar__burger-bar" />
            <span className="app-navbar__burger-bar" />
            <span className="app-navbar__burger-bar" />
          </button>
        </div>
      </div>

      {/* Responsive Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="app-navbar__mobile-drawer" role="dialog" aria-modal="true" aria-label="Mobile Navigation">
          <nav className="app-navbar__mobile-nav">
            {NAV_LINKS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={handleLinkClick}
                className={({ isActive }) =>
                  `app-navbar__mobile-link ${isActive ? 'app-navbar__mobile-link--active' : ''}`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <div className="app-navbar__mobile-divider" />
            <div className="app-navbar__mobile-auth">
              {isAuthenticated ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ padding: '6px 12px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    Signed in as <strong>{user?.name || user?.email}</strong>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={async () => {
                      handleLinkClick()
                      await logout()
                    }}
                  >
                    Log Out
                  </Button>
                </div>
              ) : (
                <>
                  <Link to={AUTH_LINKS.login.path} onClick={handleLinkClick} className="app-navbar__mobile-auth-link">
                    <Button variant="primary" size="sm" className="w-full">
                      {AUTH_LINKS.login.label}
                    </Button>
                  </Link>
                  <Link to={AUTH_LINKS.signup.path} onClick={handleLinkClick} className="app-navbar__mobile-auth-link">
                    <Button variant="ghost" size="sm" className="w-full">
                      {AUTH_LINKS.signup.label}
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}

