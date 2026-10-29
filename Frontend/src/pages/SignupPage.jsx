import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { useAuth } from '../hooks/useAuth'
import { AuthCard } from '../features/auth/AuthCard'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'

export function SignupPage() {
  usePageTitle('Sign Up')
  const { signup, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  const redirectPath = location.state?.from || '/'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    try {
      await signup(fullName, email, password)
      navigate(redirectPath, { replace: true })
    } catch (err) {
      setError(err.message || 'Unable to create account.')
    }
  }

  const userIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )

  const emailIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2"/>
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  )

  const lockIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )

  // Show/Hide password toggle button
  const togglePasswordBtn = (
    <button
      type="button"
      className="ui-input-toggle-btn"
      onClick={() => setShowPassword((prev) => !prev)}
      aria-label={showPassword ? 'Hide password' : 'Show password'}
      tabIndex={0}
    >
      {showPassword ? (
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
    <div className="signup-page">
      <AuthCard
        title="Join BrainDetour"
        subtitle="Embark on curiosity-driven research and evidence review tracks"
        illustration="/images/character-transparent.png"
        illustrationAlt="Curiosity guide with voluminous brown hair in a bun and lavender sweater"
        illustrationSize="sm"
        footer={
          <span>
            Already have an account?{' '}
            <Link to="/login" state={location.state} style={{ fontWeight: 'var(--font-weight-medium)' }}>
              Log in
            </Link>
          </span>
        }
      >
        {error && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--color-status-insufficient-bg)',
              border: '1px solid var(--color-status-insufficient-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-status-insufficient-text)',
              marginBottom: 'var(--space-3)',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Input
            id="signup-name"
            label="Full Name"
            type="text"
            icon={userIcon}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            required
          />

          <Input
            id="signup-email"
            label="Email Address"
            type="email"
            icon={emailIcon}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="curious.scholar@braindetour.edu"
            required
          />

          <Input
            id="signup-password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            icon={lockIcon}
            rightSlot={togglePasswordBtn}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            helperText="Must be 8+ characters with numbers or symbols"
            required
          />

          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={loading}
            style={{ width: '100%', height: '44px', marginTop: 'var(--space-1)' }}
          >
            {loading ? 'Creating Account…' : 'Create Account'}
          </Button>
        </form>
      </AuthCard>
    </div>
  )
}
