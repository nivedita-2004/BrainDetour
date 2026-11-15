import { useState, useEffect, useRef } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { useAuth } from '../hooks/useAuth'
import { AuthCard } from '../features/auth/AuthCard'
import { validatePasswordResetInput } from '../features/auth/passwordResetUtils'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'

export { validatePasswordResetInput }

export function ResetPasswordPage() {
  usePageTitle('Reset Password')
  const { resetPassword } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [resetToken, setResetToken] = useState(() => location.state?.resetToken || '')
  const [email] = useState(() => location.state?.email || '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submittingRef = useRef(false)
  const redirectTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current)
      }
    }
  }, [])

  // Guard against direct navigation without a valid reset authorization token
  if (!resetToken && !successMessage) {
    return <Navigate to="/forgot-password" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submittingRef.current || isSubmitting || Boolean(successMessage)) return

    setError('')
    const validation = validatePasswordResetInput(newPassword, confirmPassword)
    if (!validation.valid) {
      setError(validation.error)
      return
    }

    submittingRef.current = true
    setIsSubmitting(true)

    try {
      const response = await resetPassword({
        resetToken,
        newPassword,
        email,
      })
      const msg =
        response?.message || 'Password reset successful. Please log in with your new password.'

      // Immediately clear temporary reset authorization from state and history
      setResetToken('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccessMessage(msg)
      try {
        window.history.replaceState({}, '')
      } catch (_) {}

      redirectTimerRef.current = setTimeout(() => {
        navigate('/login', {
          replace: true,
          state: {
            resetSuccessMessage: msg,
          },
        })
      }, 1200)
    } catch (err) {
      setError(err.message || 'Unable to reset password. Please try again.')
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  const lockIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )

  const renderToggleBtn = (visible, setVisible, labelPrefix) => (
    <button
      type="button"
      className="ui-input-toggle-btn"
      onClick={() => setVisible((prev) => !prev)}
      aria-label={visible ? `Hide ${labelPrefix}` : `Show ${labelPrefix}`}
      tabIndex={0}
    >
      {visible ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
          <line x1="2" x2="22" y1="2" y2="22"/>
        </svg>
      )}
    </button>
  )

  return (
    <div className="reset-password-page">
      <AuthCard
        title="Create New Password"
        subtitle="Choose a strong new password to secure your BrainDetour account."
        illustration="/images/character-transparent.png"
        illustrationAlt="Curiosity guide with voluminous brown hair in a bun and lavender sweater"
        illustrationSize="sm"
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

        {successMessage ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div className="auth-status-banner auth-status-banner--success" role="status">
              ✓ {successMessage}
            </div>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() =>
                navigate('/login', {
                  replace: true,
                  state: { resetSuccessMessage: successMessage },
                })
              }
              style={{ width: '100%', height: '44px' }}
            >
              Continue to Log In
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Input
              id="reset-new-password"
              label="New Password"
              type={showNewPassword ? 'text' : 'password'}
              icon={lockIcon}
              rightSlot={renderToggleBtn(showNewPassword, setShowNewPassword, 'new password')}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value)
                if (error) setError('')
              }}
              placeholder="At least 8 characters"
              helperText="Must be at least 8 characters long"
              disabled={isSubmitting}
              autoComplete="new-password"
              required
            />

            <Input
              id="reset-confirm-password"
              label="Confirm Password"
              type={showConfirmPassword ? 'text' : 'password'}
              icon={lockIcon}
              rightSlot={renderToggleBtn(showConfirmPassword, setShowConfirmPassword, 'confirm password')}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                if (error) setError('')
              }}
              placeholder="Re-enter your new password"
              disabled={isSubmitting}
              autoComplete="new-password"
              required
            />

            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={isSubmitting}
              style={{ width: '100%', height: '44px', marginTop: 'var(--space-1)' }}
            >
              {isSubmitting ? 'Updating Password…' : 'Reset Password'}
            </Button>
          </form>
        )}
      </AuthCard>
    </div>
  )
}
