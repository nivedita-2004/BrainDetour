import { Link } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { Button } from '../components/ui/Button'
import './Pages.css'

export function NotFoundPage() {
  usePageTitle('404 — Page Not Found')

  return (
    <div className="not-found-page" style={{ textAlign: 'center', padding: 'var(--space-16) 0' }}>
      <span className="page-header__badge" style={{ backgroundColor: 'var(--color-bg-subtle)' }}>
        404 Not Found
      </span>
      <h1 style={{ fontSize: '3rem', margin: 'var(--space-4) 0 var(--space-2)' }}>
        Detour Discovered
      </h1>
      <p style={{ maxWidth: '480px', margin: '0 auto var(--space-8)', color: 'var(--color-text-secondary)' }}>
        The path you are looking for does not exist or has been relocated to another corridor of inquiry.
      </p>
      <Link to="/">
        <Button variant="primary" size="lg">
          Return to Platform Home
        </Button>
      </Link>
    </div>
  )
}
