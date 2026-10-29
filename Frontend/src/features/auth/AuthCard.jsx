import './AuthCard.css'

/**
 * Reusable AuthCard component
 * Compact, highly proportioned claymorphic card designed around the 3D girl character.
 */
export function AuthCard({
  title,
  subtitle,
  illustration = '/images/character-transparent.png',
  illustrationAlt = 'Curiosity guide with voluminous brown hair in a bun and lavender sweater',
  illustrationSize = 'md',
  children,
  footer,
}) {
  return (
    <div className="auth-clay-container">
      {/* Decorative ambient elements */}
      <div className="auth-clay-decor auth-clay-decor--cloud" aria-hidden="true">
        <svg width="40" height="26" viewBox="0 0 48 32" fill="none">
          <path d="M38 28H10C5.58 28 2 24.42 2 20c0-3.9 2.8-7.14 6.55-7.85C10.1 6.8 15.5 2 22 2c7.18 0 13.08 5.48 13.88 12.5C39.45 15.2 42.5 18.25 42.5 22c0 3.31-2.69 6-6 6z" fill="#D8C4EF" opacity="0.7"/>
          <path d="M40 30H12c-4.42 0-8-3.58-8-8 0-3.9 2.8-7.14 6.55-7.85C12.1 8.8 17.5 4 24 4c7.18 0 13.08 5.48 13.88 12.5C41.45 17.2 44.5 20.25 44.5 24c0 3.31-2.69 6-6 6z" fill="#FFF8F0"/>
        </svg>
      </div>
      <div className="auth-clay-decor auth-clay-decor--star" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="#F2B8C8" opacity="0.8"/>
        </svg>
      </div>

      <div className="auth-clay-panel">
        {/* Compact 3D Character Illustration */}
        {illustration && (
          <div className={`auth-clay-illustration-wrap auth-clay-illustration-wrap--${illustrationSize}`}>
            <img
              src={illustration}
              alt={illustrationAlt}
              className="auth-clay-illustration"
            />
          </div>
        )}

        <div className="auth-clay-header">
          <h1 className="auth-clay-title">{title}</h1>
          {subtitle && <p className="auth-clay-subtitle">{subtitle}</p>}
        </div>

        <div className="auth-clay-body">{children}</div>

        {footer && <div className="auth-clay-footer">{footer}</div>}
      </div>
    </div>
  )
}
