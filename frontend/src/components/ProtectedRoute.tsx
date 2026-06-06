import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LoaderIcon } from './Icons'
import { hasRole } from '../lib/permissions'
import Unauthorized from '../pages/Unauthorized'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: readonly string[]
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, loading, user } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 64px)' }}>
        <LoaderIcon size={28} className="icon-spin" style={{ color: 'var(--indigo)' } as React.CSSProperties} />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!hasRole(user, allowedRoles)) {
    return <Unauthorized />
  }

  return <>{children}</>
}
