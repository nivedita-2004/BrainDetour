/**
 * Password Reset Validation & Formatting Utilities
 */

export const OTP_VALIDITY_SECONDS = 60
export const OTP_VALIDITY_MS = 60 * 1000

/**
 * Resolves a server-issued OTP expiration timestamp (epoch ms) from the API response.
 *
 * @param {{ otpExpiresAt?: string | number, expiresInSeconds?: number } | null | undefined} responseData
 * @param {number} [nowMs=Date.now()]
 * @returns {number}
 */
export function resolveOtpExpiresAt(responseData, nowMs = Date.now()) {
  if (responseData?.otpExpiresAt) {
    const parsed = new Date(responseData.otpExpiresAt).getTime()
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  const seconds = Number(responseData?.expiresInSeconds)
  if (Number.isFinite(seconds) && seconds > 0) {
    return nowMs + Math.min(seconds, OTP_VALIDITY_SECONDS) * 1000
  }
  return nowMs + OTP_VALIDITY_MS
}

/**
 * Computes remaining whole seconds before OTP expiry based on the server-issued timestamp.
 * Returns 0 when `otpExpiresAt` is missing, invalid, or `nowMs >= expiryMs` so a page refresh
 * never restarts or fabricates a fresh countdown.
 *
 * @param {string | number | Date | null | undefined} otpExpiresAt
 * @param {number} [nowMs=Date.now()]
 * @returns {number}
 */
export function getRemainingOtpSeconds(otpExpiresAt, nowMs = Date.now()) {
  if (otpExpiresAt === null || otpExpiresAt === undefined || otpExpiresAt === '') {
    return 0
  }
  const expiryMs =
    typeof otpExpiresAt === 'number' ? otpExpiresAt : new Date(otpExpiresAt).getTime()
  if (!Number.isFinite(expiryMs) || nowMs >= expiryMs) {
    return 0
  }
  return Math.max(0, Math.min(OTP_VALIDITY_SECONDS, Math.ceil((expiryMs - nowMs) / 1000)))
}

/**
 * Returns true when the OTP has reached or passed its expiration timestamp.
 *
 * @param {string | number | Date | null | undefined} otpExpiresAt
 * @param {number} [nowMs=Date.now()]
 * @returns {boolean}
 */
export function isOtpExpiredAt(otpExpiresAt, nowMs = Date.now()) {
  return getRemainingOtpSeconds(otpExpiresAt, nowMs) <= 0
}

/**
 * Validates and normalizes an email address for password reset requests.
 * @param {string} rawEmail
 * @returns {{ valid: boolean, normalizedEmail: string, error?: string }}
 */
export function validateResetEmail(rawEmail) {
  const trimmed = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : ''
  if (!trimmed) {
    return { valid: false, normalizedEmail: '', error: 'Please enter your email address.' }
  }
  if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
    return { valid: false, normalizedEmail: trimmed, error: 'Please enter a valid email address.' }
  }
  return { valid: true, normalizedEmail: trimmed }
}

/**
 * Partially masks an email address for safe UI display (e.g. "cu***r@braindetour.edu").
 * @param {string} email
 * @returns {string}
 */
export function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return ''
  const [localPart, domain] = email.trim().split('@')
  if (!localPart || !domain) return email
  if (localPart.length <= 2) {
    return `${localPart[0]}***@${domain}`
  }
  if (localPart.length <= 4) {
    return `${localPart[0]}***${localPart[localPart.length - 1]}@${domain}`
  }
  return `${localPart.slice(0, 2)}***${localPart.slice(-1)}@${domain}`
}

/**
 * Validates a 6-digit numeric OTP string.
 * @param {string} otp
 * @returns {{ valid: boolean, otp: string, error?: string }}
 */
export function validateOtpCode(otp) {
  const cleaned = typeof otp === 'string' ? otp.trim() : ''
  if (!cleaned) {
    return { valid: false, otp: '', error: 'Please enter the 6-digit verification code.' }
  }
  if (!/^\d{6}$/.test(cleaned)) {
    return { valid: false, otp: cleaned, error: 'Verification code must be 6 digits.' }
  }
  return { valid: true, otp: cleaned }
}

/**
 * Validates new password and confirmation password inputs.
 * @param {string} newPassword
 * @param {string} confirmPassword
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePasswordResetInput(newPassword, confirmPassword) {
  if (!newPassword || typeof newPassword !== 'string') {
    return { valid: false, error: 'Please enter a new password.' }
  }
  if (newPassword.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long.' }
  }
  if (!confirmPassword || typeof confirmPassword !== 'string') {
    return { valid: false, error: 'Please confirm your new password.' }
  }
  if (newPassword !== confirmPassword) {
    return { valid: false, error: 'Passwords do not match.' }
  }
  return { valid: true }
}
