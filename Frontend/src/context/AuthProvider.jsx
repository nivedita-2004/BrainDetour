import { useState, useEffect, useRef, useCallback } from 'react'
import { AuthContext } from './AuthContext'

const AUTH_STORAGE_KEY = 'braindetour_auth_session'

// Token configuration lifetimes
export const ACCESS_TOKEN_LIFETIME_MS = 7 * 60 * 1000 // 7 minutes
export const REFRESH_SCHEDULE_DELAY_MS = 6 * 60 * 1000 // Proactively refresh after 6 minutes

// Module-level in-flight promise to coalesce concurrent refresh requests into a single operation
let inFlightRefreshPromise = null

/**
 * Executes a single atomic token refresh request against /api/auth/refresh.
 * Prevents multiple competing refresh requests from firing concurrently.
 * @returns {Promise<{ success: boolean, user?: Object }>}
 */
export async function refreshAccessToken() {
  if (inFlightRefreshPromise) {
    return inFlightRefreshPromise
  }

  inFlightRefreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Token refresh failed')
      }

      return data
    } finally {
      inFlightRefreshPromise = null
    }
  })()

  return inFlightRefreshPromise
}

/**
 * Shared API fetch wrapper that automatically catches access-token expiration (401)
 * on authenticated endpoints, triggers a single atomic token refresh, and retries the request once.
 * Avoids infinite loops on auth endpoints (login, signup, refresh).
 */
export async function fetchWithAuth(url, options = {}) {
  const fetchOptions = {
    ...options,
    credentials: options.credentials || 'include',
  }

  let res = await fetch(url, fetchOptions)

  // Determine if this is an auth endpoint where 401 means invalid credentials, not expired access token
  const urlStr = typeof url === 'string' ? url : url?.url || ''
  const isAuthEndpoint =
    urlStr.includes('/api/auth/login') ||
    urlStr.includes('/api/auth/signup') ||
    urlStr.includes('/api/auth/refresh')

  if (res.status === 401 && !isAuthEndpoint) {
    try {
      await refreshAccessToken()
      // Token refreshed successfully: retry original request once
      res = await fetch(url, fetchOptions)
    } catch (_) {
      // Refresh token is expired, revoked, or invalid: pass through 401 to caller
    }
  }

  return res
}

/**
 * AuthProvider component supplying real backend authentication state and operations.
 * Enforces genuine session verification, proactive token refresh scheduling, and concurrent refresh safety.
 * @param {{ children: import('react').ReactNode }} props
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(true)

  const refreshTimerRef = useRef(null)
  const lastRefreshTimestampRef = useRef(Date.now())

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
        try {
          const data = await refreshAccessToken()
          lastRefreshTimestampRef.current = Date.now()
          if (data?.user) {
            setUser(data.user)
            try {
              localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data.user))
            } catch (_) {}
          }
          // Schedule next rotation cycle
          scheduleNextRefresh()
        } catch (err) {
          console.warn('Scheduled token refresh failed:', err)
          // If refresh token expired or was revoked, clear state and require user to sign in
          setUser(null)
          try {
            localStorage.removeItem(AUTH_STORAGE_KEY)
          } catch (_) {}
        }
      }, delayMs)
    },
    [clearRefreshTimer]
  )

  // Verify backend session on mount and establish token refresh schedule
  useEffect(() => {
    let isMounted = true

    async function checkAuthSession() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          if (data.success && data.user && isMounted) {
            setUser(data.user)
            try {
              localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data.user))
            } catch (_) {}
            scheduleNextRefresh()
            return
          }
        }

        // If access token is missing or expired on initial load, attempt refresh
        if (res.status === 401) {
          try {
            const refreshData = await refreshAccessToken()
            if (isMounted) {
              if (refreshData?.user) {
                setUser(refreshData.user)
                try {
                  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(refreshData.user))
                } catch (_) {}
                scheduleNextRefresh()
                return
              } else {
                // Fetch me profile
                const retryRes = await fetch('/api/auth/me', { credentials: 'include' })
                if (retryRes.ok) {
                  const retryData = await retryRes.json()
                  if (retryData.success && retryData.user && isMounted) {
                    setUser(retryData.user)
                    try {
                      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(retryData.user))
                    } catch (_) {}
                    scheduleNextRefresh()
                    return
                  }
                }
              }
            }
          } catch (_) {
            // Refresh failed (invalid/expired refresh token)
          }

          if (isMounted) {
            setUser(null)
            try {
              localStorage.removeItem(AUTH_STORAGE_KEY)
            } catch (_) {}
            clearRefreshTimer()
          }
        }
      } catch (err) {
        console.warn('Backend authentication check failed:', err)
      } finally {
        if (isMounted) {
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
          refreshAccessToken()
            .then((data) => {
              lastRefreshTimestampRef.current = Date.now()
              if (data?.user) {
                setUser(data.user)
                try {
                  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data.user))
                } catch (_) {}
              }
              scheduleNextRefresh()
            })
            .catch(() => {
              setUser(null)
              try {
                localStorage.removeItem(AUTH_STORAGE_KEY)
              } catch (_) {}
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
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.success) {
        setUser(null)
        try {
          localStorage.removeItem(AUTH_STORAGE_KEY)
        } catch (_) {}
        clearRefreshTimer()
        throw new Error(data.message || 'Invalid email or password')
      }

      setUser(data.user)
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data.user))
      } catch (_) {}

      // Establish token refresh schedule upon successful login
      scheduleNextRefresh()
      return data.user
    } finally {
      setLoading(false)
    }
  }

  const signup = async (fullName, email, password) => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: fullName.trim(), email: email.trim(), password }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.success) {
        setUser(null)
        try {
          localStorage.removeItem(AUTH_STORAGE_KEY)
        } catch (_) {}
        clearRefreshTimer()
        throw new Error(data.message || 'Unable to create account')
      }

      setUser(data.user)
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data.user))
      } catch (_) {}

      // Establish token refresh schedule upon successful signup
      scheduleNextRefresh()
      return data.user
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    setLoading(true)
    clearRefreshTimer()
    try {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      } catch (_) {}
      setUser(null)
      try {
        localStorage.removeItem(AUTH_STORAGE_KEY)
      } catch (_) {}
    } finally {
      setLoading(false)
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
        fetchWithAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
