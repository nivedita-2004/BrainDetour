import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

/**
 * ProtectedRoute Guard
 * 
 * Ensures only authenticated users can access the route.
 * Redirects guests to the /login page while saving the intended location in router state.
 * 
 * Note: Real authorization will be verified server-side in future milestones.
 */
export function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="page-state" style={{ minHeight: '50vh' }}>
        <p className="page-state__text">Verifying scholar session…</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    )
  }

  return children
}
