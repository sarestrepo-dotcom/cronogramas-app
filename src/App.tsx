import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './hooks/useAuth'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { EmpresasPage } from './pages/EmpresasPage'
import { ProyectosPage } from './pages/ProyectosPage'
import { ProyectoDetailPage } from './pages/ProyectoDetailPage'
import { SettingsPage } from './pages/SettingsPage'
import { AdminPage } from './pages/AdminPage'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
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
              <Route path="empresas" element={<EmpresasPage />} />
              <Route path="empresa/:empresaId/proyectos" element={<ProyectosPage />} />
              <Route path="empresa/:empresaId/proyecto/:proyectoId" element={<ProyectoDetailPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="admin" element={
                <ProtectedRoute adminOnly>
                  <AdminPage />
                </ProtectedRoute>
              } />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
