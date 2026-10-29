import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

/**
 * Derives a clean single or double-letter initial from user name or email.
 * Never outputs the entire email inside the avatar circle.
 * @param {string} [name]
 * @param {string} [email]
 * @returns {string}
 */
function getAvatarInitial(name, email) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return parts[0][0].toUpperCase()
  }
  if (email && email.trim()) {
    const username = email.split('@')[0]
    return username.charAt(0).toUpperCase()
  }
  return 'S'
}

/**
 * ProfileMenu Component
 * Displays user avatar with dropdown menu for profile, saved reflections, and logout.
 */
export function ProfileMenu() {
  const { user, logout } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)

  // Close menu on clicks outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  if (!user) return null

  const initial = getAvatarInitial(user.name, user.email)

  return (
    <div className="profile-menu-container" ref={menuRef}>
      <button
        type="button"
        className="profile-avatar-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="User profile menu"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name || 'Scholar Avatar'}
            className="profile-avatar-img"
          />
        ) : (
          <span className="profile-avatar-initial" aria-hidden="true">
            {initial}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="profile-dropdown" role="menu" aria-label="Profile actions">
          <div className="profile-dropdown__header">
            <div className="profile-dropdown__name">{user.name || 'Scholar'}</div>
            <div className="profile-dropdown__email">{user.email}</div>
          </div>

          <div className="profile-dropdown__divider" />

          <Link
            to="/"
            className="profile-dropdown__item"
            role="menuitem"
            onClick={() => setIsOpen(false)}
          >
            <span className="profile-dropdown__icon">✦</span>
            Curiosity Wheel
          </Link>

          <Link
            to="/presentation"
            className="profile-dropdown__item"
            role="menuitem"
            onClick={() => setIsOpen(false)}
          >
            <span className="profile-dropdown__icon">🎙</span>
            Speech Lab
          </Link>

          <div className="profile-dropdown__divider" />

          <button
            type="button"
            className="profile-dropdown__item profile-dropdown__item--danger"
            role="menuitem"
            onClick={async () => {
              setIsOpen(false)
              await logout()
            }}
          >
            <span className="profile-dropdown__icon">⇥</span>
            Log Out
          </button>
        </div>
      )}
    </div>
  )
}
