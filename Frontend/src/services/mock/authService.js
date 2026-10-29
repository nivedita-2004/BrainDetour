/**
 * Mock Authentication Adapter
 * 
 * IMPORTANT: This is a client-side mock adapter designed strictly for demonstrating
 * the frontend authentication lifecycle and profile states in this prototype milestone.
 * 
 * It will be replaced with real backend session / JWT authentication in future milestones.
 * User data is isolated in localStorage under 'braindetour_auth_session'.
 */

const AUTH_STORAGE_KEY = 'braindetour_auth_session'
const USERS_STORAGE_KEY = 'braindetour_registered_users'

function getStoredUsers() {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveStoredUser(email, userData) {
  try {
    const users = getStoredUsers()
    users[email.trim().toLowerCase()] = userData
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users))
  } catch {}
}

export const mockAuthService = {
  /**
   * Retrieves the current mock authenticated user, or null if guest.
   * @returns {{ id: string, name: string, email: string, avatarUrl?: string } | null}
   */
  getCurrentUser() {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY)
      if (!stored) return null
      return JSON.parse(stored)
    } catch {
      return null
    }
  },

  /**
   * Mock login with email and password.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{ id: string, name: string, email: string, avatarUrl?: string }>}
   */
  async login(email, password) {
    // Simulate brief network delay
    await new Promise((resolve) => setTimeout(resolve, 300))

    if (!email || !password) {
      throw new Error('Email and password are required.')
    }

    const normEmail = email.trim().toLowerCase()
    const storedUsers = getStoredUsers()
    const existing = storedUsers[normEmail]

    // Use registered name if user previously signed up
    let realName = existing?.name || ''

    if (!realName) {
      // If no name stored, strip numbers and special characters from email prefix
      const username = normEmail.split('@')[0]
      const cleanPrefix = username.replace(/\d+/g, '')
      if (cleanPrefix.length > 2) {
        realName = cleanPrefix
          .split(/[._-]/)
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join(' ')
      }
    }

    const user = {
      id: existing?.id || `usr_${Date.now()}`,
      name: realName || '',
      email: normEmail,
      avatarUrl: '',
      role: 'scholar',
      joinedDate: existing?.joinedDate || new Date().toISOString(),
    }

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
    return user
  },

  /**
   * Mock signup with full name, email, and password.
   * @param {string} fullName
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{ id: string, name: string, email: string, avatarUrl?: string }>}
   */
  async signup(fullName, email, password) {
    await new Promise((resolve) => setTimeout(resolve, 300))

    if (!fullName || !email || !password) {
      throw new Error('All fields are required.')
    }

    const normEmail = email.trim().toLowerCase()
    const trimmedName = fullName.trim()

    const user = {
      id: `usr_${Date.now()}`,
      name: trimmedName,
      email: normEmail,
      avatarUrl: '',
      role: 'scholar',
      joinedDate: new Date().toISOString(),
    }

    // Persist in mock users registry
    saveStoredUser(normEmail, user)
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
    return user
  },

  /**
   * Logs out the current user and clears session state.
   */
  async logout() {
    await new Promise((resolve) => setTimeout(resolve, 150))
    localStorage.removeItem(AUTH_STORAGE_KEY)
  },
}
