import { useEffect } from 'react'
import { APP_CONFIG } from '../lib/constants'

/**
 * Reusable hook to synchronize document title across different views.
 * @param {string} title - Page specific title segment
 */
export function usePageTitle(title) {
  useEffect(() => {
    const previousTitle = document.title
    if (title) {
      document.title = `${title} | ${APP_CONFIG.name}`
    } else {
      document.title = `${APP_CONFIG.name} — ${APP_CONFIG.tagline}`
    }

    return () => {
      document.title = previousTitle
    }
  }, [title])
}
