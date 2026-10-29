/**
 * General-purpose utility helpers.
 */

/**
 * Conditionally joins CSS class names into a single string.
 * @param  {...(string|boolean|null|undefined)} classes
 * @returns {string}
 */
export function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

/**
 * Formats a duration in minutes into a human-readable string.
 * @param {number} minutes
 * @returns {string}
 */
export function formatMinutes(minutes) {
  if (!minutes || minutes <= 0) return '0 min'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

/**
 * Truncates text cleanly to a maximum length with an ellipsis.
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
export function truncateText(text, maxLength = 120) {
  if (!text || text.length <= maxLength) return text
  return text.slice(0, maxLength).trim() + '…'
}
