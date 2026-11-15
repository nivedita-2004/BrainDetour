import { useState, useEffect, useRef, useCallback } from 'react'
import { AuthContext } from './AuthContext'
import { api, refreshAccessToken } from '../services/api'

export { refreshAccessToken }

const AUTH_STORAGE_KEY = 'braindetour_auth_session'

// Token configuration lifetimes
export const ACCESS_TOKEN_LIFETIME_MS = 7 * 60 * 1000 // 7 minutes
export const REFRESH_SCHEDULE_DELAY_MS = 6 * 60 * 1000 // Proactively refresh after 6 minutes

/**
 * AuthProvider component supplying real backend authentication state and operations.
 * Enforces genuine session verification, proactive token refresh scheduling, and concurrent refresh safety.
 * @param {{ children: import('react').ReactNode }} props
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshTimerRef = useRef(null)
  const lastRefreshTimestampRef = useRef(Date.now())
  const authActionIdRef = useRef(0)

  // Clears any active scheduled refresh timer
  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
  }, [])

  // Schedules the next proactive token refresh ~6 minutes after issuance
  const scheduleNextRefresh = useCallback(
    (delayMs = REFRESH_SCHEDULE_DELAY_MS) => {
      clearRefreshTimer()
      lastRefreshTimestampRef.current = Date.now()

      refreshTimerRef.current = setTimeout(async () => {
        const actionId = ++authActionIdRef.current
        try {
          const data = await refreshAccessToken()
          if (actionId !== authActionIdRef.current) return

          lastRefreshTimestampRef.current = Date.now()
          if (data?.user) {
            setUser(data.user)
          }
          // Schedule next rotation cycle
          scheduleNextRefresh()
        } catch (err) {
          if (actionId !== authActionIdRef.current) return
          console.warn('Scheduled token refresh failed:', err)
          // If refresh token expired or was revoked, clear state and require user to sign in
          setUser(null)
          clearRefreshTimer()
        }
      }, delayMs)
    },
    [clearRefreshTimer]
  )

  // Verify backend session on mount and establish token refresh schedule
  useEffect(() => {
    let isMounted = true
    const actionId = ++authActionIdRef.current

    // Purge any legacy cached auth session from localStorage
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    } catch (_) {}

    async function checkAuthSession() {
      try {
        const res = await api.get('/auth/me')
        const data = res.data || {}

        // Discard response if unmounted or a newer auth action occurred
        if (!isMounted || actionId !== authActionIdRef.current) return

        if (data.success && data.user) {
          setUser(data.user)
          scheduleNextRefresh()
        } else {
          setUser(null)
          clearRefreshTimer()
        }
      } catch (err) {
        // Discard error handling if unmounted or newer action occurred
        if (!isMounted || actionId !== authActionIdRef.current) return

        // Any failure (401 unauthenticated, 5xx server error, or network error)
        // guarantees user state remains null and cannot authenticate cached profiles
        setUser(null)
        clearRefreshTimer()
      } finally {
        if (isMounted && actionId === authActionIdRef.current) {
          setLoading(false)
        }
      }
    }

    checkAuthSession()

    return () => {
      isMounted = false
      clearRefreshTimer()
    }
  }, [scheduleNextRefresh, clearRefreshTimer])

  // Handle browser tab throttling and background tabs:
  // When user returns to tab, refresh if elapsed time exceeds the proactive threshold
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        const elapsed = Date.now() - lastRefreshTimestampRef.current
        if (elapsed >= REFRESH_SCHEDULE_DELAY_MS) {
          const actionId = ++authActionIdRef.current
          refreshAccessToken()
            .then((data) => {
              if (actionId !== authActionIdRef.current) return
              lastRefreshTimestampRef.current = Date.now()
              if (data?.user) {
                setUser(data.user)
              }
              scheduleNextRefresh()
            })
            .catch(() => {
              if (actionId !== authActionIdRef.current) return
              setUser(null)
              clearRefreshTimer()
            })
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [user, scheduleNextRefresh, clearRefreshTimer])

  const login = async (email, password) => {
    const actionId = ++authActionIdRef.current
    setLoading(true)
    try {
      const res = await api.post('/auth/login', {
        email: email.trim(),
        password,
      })

      const data = res.data || {}

      if (!data.success || !data.user) {
        if (actionId === authActionIdRef.current) {
          setUser(null)
          clearRefreshTimer()
        }
        throw new Error(data.message || 'Invalid email or password')
      }

      if (actionId === authActionIdRef.current) {
        setUser(data.user)
        scheduleNextRefresh()
      }
      return data.user
    } catch (err) {
      if (actionId === authActionIdRef.current) {
        setUser(null)
        clearRefreshTimer()
      }
      const message = err.response?.data?.message || err.message || 'Invalid email or password'
      throw new Error(message)
    } finally {
      if (actionId === authActionIdRef.current) {
        setLoading(false)
      }
    }
  }

  const signup = async (fullName, email, password) => {
    const actionId = ++authActionIdRef.current
    setLoading(true)
    try {
      const res = await api.post('/auth/signup', {
        name: fullName.trim(),
        email: email.trim(),
        password,
      })

      const data = res.data || {}

      if (!data.success || !data.user) {
        if (actionId === authActionIdRef.current) {
          setUser(null)
          clearRefreshTimer()
        }
        throw new Error(data.message || 'Unable to create account')
      }

      if (actionId === authActionIdRef.current) {
        setUser(data.user)
        scheduleNextRefresh()
      }
      return data.user
    } catch (err) {
      if (actionId === authActionIdRef.current) {
        setUser(null)
        clearRefreshTimer()
      }
      const message = err.response?.data?.message || err.message || 'Unable to create account'
      throw new Error(message)
    } finally {
      if (actionId === authActionIdRef.current) {
        setLoading(false)
      }
    }
  }

  const logout = async () => {
    const actionId = ++authActionIdRef.current
    clearRefreshTimer()
    setUser(null)
    setLoading(true)
    try {
      try {
        await api.post('/auth/logout')
      } catch (_) {}
    } finally {
      if (actionId === authActionIdRef.current) {
        setLoading(false)
      }
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        loading,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
