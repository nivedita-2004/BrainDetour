import { useState, useEffect, useRef } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { useAuth } from '../hooks/useAuth'
import { AuthCard } from '../features/auth/AuthCard'
import {
  OTP_VALIDITY_SECONDS,
  maskEmail,
  validateOtpCode,
  resolveOtpExpiresAt,
  getRemainingOtpSeconds,
} from '../features/auth/passwordResetUtils'
import { Button } from '../components/ui/Button'

export { maskEmail, validateOtpCode, resolveOtpExpiresAt, getRemainingOtpSeconds }

export function VerifyResetOtpPage() {
  usePageTitle('Verify Reset Code')
  const { verifyResetOtp, forgotPassword } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const email = location.state?.email || ''
  const [otpExpiresAt, setOtpExpiresAt] = useState(() => location.state?.otpExpiresAt ?? null)
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    getRemainingOtpSeconds(location.state?.otpExpiresAt)
  )
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [infoMessage, setInfoMessage] = useState(
    () => location.state?.infoMessage || 'We sent a 6-digit verification code to your email.'
  )
  const [cooldown, setCooldown] = useState(() =>
    getRemainingOtpSeconds(location.state?.otpExpiresAt)
  )
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)

  const inputRefs = useRef([])
  const verifyingRef = useRef(false)
  const resendingRef = useRef(false)

  // Synchronize OTP validity countdown against server-issued otpExpiresAt timestamp
  useEffect(() => {
    const syncRemaining = () => {
      const nextRemaining = getRemainingOtpSeconds(otpExpiresAt, Date.now())
      setRemainingSeconds(nextRemaining)
    }

    syncRemaining()
    if (getRemainingOtpSeconds(otpExpiresAt, Date.now()) <= 0) {
      return undefined
    }

    const timer = setInterval(syncRemaining, 250)
    return () => clearInterval(timer)
  }, [otpExpiresAt])

  // Countdown timer for Resend OTP cooldown
  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  // Focus first digit box on mount
  useEffect(() => {
    if (email && inputRefs.current[0]) {
      inputRefs.current[0].focus()
    }
  }, [email])

  // Guard against direct navigation without an email in state
  if (!email) {
    return <Navigate to="/forgot-password" replace />
  }

  const maskedEmail = maskEmail(email)
  const combinedOtp = digits.join('')
  const isOtpExpired = remainingSeconds <= 0

  const handleDigitChange = (index, rawValue) => {
    const numeric = String(rawValue || '').replace(/\D/g, '')
    if (error) setError('')

    if (!numeric) {
      setDigits((prev) => {
        const next = [...prev]
        next[index] = ''
        return next
      })
      return
    }

    // Handle multi-character input (e.g. mobile autocomplete or fast typing)
    if (numeric.length > 1) {
      const chars = numeric.slice(0, 6).split('')
      setDigits((prev) => {
        const next = [...prev]
        for (let i = 0; i < chars.length && index + i < 6; i++) {
          next[index + i] = chars[i]
        }
        return next
      })
      const focusIdx = Math.min(index + numeric.length, 5)
      inputRefs.current[focusIdx]?.focus()
      return
    }

    setDigits((prev) => {
      const next = [...prev]
      next[index] = numeric
      return next
    })

    if (index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        setDigits((prev) => {
          const next = [...prev]
          next[index] = ''
          return next
        })
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
        setDigits((prev) => {
          const next = [...prev]
          next[index - 1] = ''
          return next
        })
      }
      e.preventDefault()
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
      e.preventDefault()
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus()
      e.preventDefault()
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    if (error) setError('')

    const nextDigits = ['', '', '', '', '', '']
    for (let i = 0; i < pasted.length; i++) {
      nextDigits[i] = pasted[i]
    }
    setDigits(nextDigits)
    const targetIdx = Math.min(pasted.length, 5)
    inputRefs.current[targetIdx]?.focus()
  }

  const handleVerifySubmit = async (e) => {
    e.preventDefault()
    if (verifyingRef.current || isVerifying || isResending) return

    if (isOtpExpired || getRemainingOtpSeconds(otpExpiresAt, Date.now()) <= 0) {
      setRemainingSeconds(0)
      setError('OTP expired. Request a new OTP.')
      return
    }

    setError('')
    const validation = validateOtpCode(combinedOtp)
    if (!validation.valid) {
      setError(validation.error)
      return
    }

    verifyingRef.current = true
    setIsVerifying(true)

    try {
      const data = await verifyResetOtp(email, validation.otp)
      // Carry forward only the temporary single-use reset authorization in memory state
      navigate('/reset-password', {
        replace: true,
        state: {
          resetToken: data.resetToken,
          email,
        },
      })
    } catch (err) {
      const message = err.message || 'Invalid or expired verification code.'
      if (/expired/i.test(message)) {
        setRemainingSeconds(0)
      }
      setError(message)
    } finally {
      verifyingRef.current = false
      setIsVerifying(false)
    }
  }

  const handleResendOtp = async () => {
    if ((cooldown > 0 && !isOtpExpired) || resendingRef.current || isResending || isVerifying) return

    setError('')
    setInfoMessage('')
    resendingRef.current = true
    setIsResending(true)

    try {
      const data = await forgotPassword(email)
      const nextOtpExpiresAt = resolveOtpExpiresAt(data)
      const nextMessage =
        data?.message || 'A new 6-digit verification code has been sent to your email.'
      setDigits(['', '', '', '', '', ''])
      setOtpExpiresAt(nextOtpExpiresAt)
      setRemainingSeconds(getRemainingOtpSeconds(nextOtpExpiresAt))
      setCooldown(OTP_VALIDITY_SECONDS)
      setInfoMessage(nextMessage)
      navigate('/verify-reset-otp', {
        replace: true,
        state: {
          ...location.state,
          email,
          otpExpiresAt: nextOtpExpiresAt,
          infoMessage: nextMessage,
        },
      })
      inputRefs.current[0]?.focus()
    } catch (err) {
      if (err.retryAfterSeconds) {
        setCooldown(err.retryAfterSeconds)
      }
      setError(err.message || 'Unable to resend verification code. Please try again.')
    } finally {
      resendingRef.current = false
      setIsResending(false)
    }
  }

  return (
    <div className="verify-reset-otp-page">
      <AuthCard
        title="Check Your Email"
        subtitle="Enter the 6-digit verification code sent to your email address."
        illustration="/images/character-transparent.png"
        illustrationAlt="Curiosity guide with voluminous brown hair in a bun and lavender sweater"
        illustrationSize="sm"
        footer={
          <span>
            Entered the wrong email?{' '}
            <Link to="/forgot-password" state={{ email }}>
              Change email
            </Link>
            {' • '}
            <Link to="/login">
              Back to Login
            </Link>
          </span>
        }
      >
        <div className="auth-masked-email-wrap">
          <span className="auth-masked-email-pill" title="Target email address">
            ✉ {maskedEmail}
          </span>
        </div>

        {infoMessage && !error && !isOtpExpired && (
          <div className="auth-status-banner auth-status-banner--info" role="status">
            {infoMessage}
          </div>
        )}

        {(error || isOtpExpired) && (
          <div className="auth-status-banner auth-status-banner--error" role="alert">
            {error || 'OTP expired. Request a new OTP.'}
          </div>
        )}

        <form onSubmit={handleVerifySubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div className="auth-otp-group">
            <label className="ui-input-label" htmlFor="otp-digit-0">
              Verification Code<span className="ui-input-required">*</span>
            </label>
            <div className="auth-otp-grid" role="group" aria-label="6-digit verification code">
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  id={`otp-digit-${idx}`}
                  ref={(el) => {
                    inputRefs.current[idx] = el
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                  aria-label={`Verification code digit ${idx + 1}`}
                  value={digit}
                  disabled={isVerifying || isResending}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={handlePaste}
                  className={`auth-otp-digit ${digit ? 'auth-otp-digit--filled' : ''} ${error || isOtpExpired ? 'auth-otp-digit--error' : ''}`}
                />
              ))}
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={isOtpExpired || isVerifying || isResending || combinedOtp.length < 6}
            style={{ width: '100%', height: '44px', marginTop: 'var(--space-1)' }}
          >
            {isVerifying ? 'Verifying Code…' : 'Verify Code'}
          </Button>
        </form>

        <div className="auth-resend-row">
          <span>
            {isOtpExpired
              ? 'OTP expired. Request a new OTP.'
              : `OTP expires in ${remainingSeconds}s`}
          </span>
          <button
            type="button"
            className="auth-resend-btn"
            onClick={handleResendOtp}
            disabled={(cooldown > 0 && !isOtpExpired) || isResending || isVerifying}
          >
            {isResending ? 'Sending…' : 'Resend OTP'}
          </button>
        </div>
      </AuthCard>
    </div>
  )
}
