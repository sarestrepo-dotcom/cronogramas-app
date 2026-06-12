import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function ProtectedRoute({ children, adminOnly = false }: {
  children: React.ReactNode
  adminOnly?: boolean
}) {
  const { user, permiso, isAdmin, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Verificando acceso...</p>
        </div>
      </div>
    )
  }

  if (!user || !permiso) return <Navigate to="/login" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}
