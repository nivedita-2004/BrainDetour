import { useState, useEffect } from 'react'
import { THEME_MODES } from '../lib/constants'
import { ThemeContext } from './ThemeContext'

/**
 * ThemeProvider component providing shared theme context to all descendant components.
 * @param {{ children: import('react').ReactNode }} props
 */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('braindetour_theme') || THEME_MODES.DARK
    } catch {
      return THEME_MODES.DARK
    }
  })

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme)
      localStorage.setItem('braindetour_theme', theme)
    } catch {
      // Safe fallback if localStorage is unavailable
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === THEME_MODES.LIGHT ? THEME_MODES.DARK : THEME_MODES.LIGHT))
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

