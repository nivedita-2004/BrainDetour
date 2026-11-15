import { useState, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { useAuth } from '../hooks/useAuth'
import { AuthCard } from '../features/auth/AuthCard'
import { validateResetEmail, resolveOtpExpiresAt } from '../features/auth/passwordResetUtils'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'

export { validateResetEmail }

export function ForgotPasswordPage() {
  usePageTitle('Forgot Password')
  const { forgotPassword } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [email, setEmail] = useState(() => location.state?.email || '')
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submittingRef.current || isSubmitting) return

    setError('')
    setStatusMessage('')

    const validation = validateResetEmail(email)
    if (!validation.valid) {
      setError(validation.error)
      return
    }

    submittingRef.current = true
    setIsSubmitting(true)

    try {
      const response = await forgotPassword(validation.normalizedEmail)
      const message =
        response?.message ||
        'If an account exists with this email, a reset verification code has been sent.'
      const otpExpiresAt = resolveOtpExpiresAt(response)
      setStatusMessage(message)

      navigate('/verify-reset-otp', {
        state: {
          email: validation.normalizedEmail,
          otpExpiresAt,
          infoMessage: message,
        },
      })
    } catch (err) {
      setError(err.message || 'Unable to send verification code. Please try again.')
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  const emailIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2"/>
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  )

  return (
    <div className="forgot-password-page">
      <AuthCard
        title="Forgot your password?"
        subtitle="Enter the email address associated with your account and we'll send you a 6-digit verification code to reset your password."
        illustration="/images/character-transparent.png"
        illustrationAlt="Curiosity guide with voluminous brown hair in a bun and lavender sweater"
        illustrationSize="md"
        footer={
          <span>
            Remember your password?{' '}
            <Link to="/login">
              Back to Login
            </Link>
          </span>
        }
      >
        {error && (
          <div className="auth-status-banner auth-status-banner--error" role="alert">
            {error}
          </div>
        )}

        {statusMessage && (
          <div className="auth-status-banner auth-status-banner--success" role="status">
            {statusMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Input
            id="forgot-password-email"
            label="Email Address"
            type="email"
            icon={emailIcon}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (error) setError('')
            }}
            placeholder="curious.scholar@braindetour.edu"
            disabled={isSubmitting}
            autoComplete="email"
            required
          />

          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={isSubmitting}
            style={{ width: '100%', height: '44px', marginTop: 'var(--space-1)' }}
          >
            {isSubmitting ? 'Sending OTP…' : 'Send OTP'}
          </Button>
        </form>
      </AuthCard>
    </div>
  )
}
