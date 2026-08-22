import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, demo, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="loading">Opening Ryfields Gym…</div>
  if (!user && !demo) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  return children
}
