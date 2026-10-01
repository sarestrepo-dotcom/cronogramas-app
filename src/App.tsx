import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './hooks/useAuth'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import { ToastProvider } from './components/ui/Toast'
import { NotFoundPage } from './pages/NotFoundPage'
import { PortalClientePage } from './pages/PortalClientePage'

const LoginPage          = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })))
const DashboardPage      = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const MisTareasPage      = lazy(() => import('./pages/MisTareasPage').then(m => ({ default: m.MisTareasPage })))
const EmpresasPage       = lazy(() => import('./pages/EmpresasPage').then(m => ({ default: m.EmpresasPage })))
const ClientesPage       = lazy(() => import('./pages/ClientesPage').then(m => ({ default: m.ClientesPage })))
const ProyectosPage      = lazy(() => import('./pages/ProyectosPage').then(m => ({ default: m.ProyectosPage })))
const ProyectoDetailPage = lazy(() => import('./pages/ProyectoDetailPage').then(m => ({ default: m.ProyectoDetailPage })))
const SettingsPage       = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const AdminPage          = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })))

const queryClient = new QueryClient()

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Ruta pública — portal del cliente sin autenticación */}
                <Route path="/portal/:token" element={<PortalClientePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="mis-tareas" element={<MisTareasPage />} />
                  <Route path="empresas" element={<EmpresasPage />} />
                  <Route path="empresa/:empresaId/proyectos" element={<ClientesPage />} />
                  <Route path="empresa/:empresaId/cliente/:clienteId/proyectos" element={<ProyectosPage />} />
                  <Route path="empresa/:empresaId/proyecto/:proyectoId" element={<ProyectoDetailPage />} />
                  <Route path="empresa/:empresaId/cliente/:clienteId/proyecto/:proyectoId" element={<ProyectoDetailPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="admin" element={
                    <ProtectedRoute adminOnly>
                      <AdminPage />
                    </ProtectedRoute>
                  } />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
