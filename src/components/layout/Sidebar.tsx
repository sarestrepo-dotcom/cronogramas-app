import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  FolderKanban,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  LogOut,
  Settings,
  ShieldCheck,
  Plus,
  Menu,
  X,
} from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useEmpresas } from '@/hooks/useEmpresas'
import type { Empresa } from '@/types'

interface SidebarProps {
  empresaActiva: Empresa | null
  onEmpresaChange: (empresa: Empresa) => void
}

export function Sidebar({ empresaActiva, onEmpresaChange }: SidebarProps) {
  const { user, logout, isAdmin } = useAuth()
  const { empresas } = useEmpresas()
  const location = useLocation()
  const navigate = useNavigate()
  const [expandEmpresas, setExpandEmpresas] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/')

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-300">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-700/50">
        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
          <CalendarRange size={16} className="text-white" />
        </div>
        <span className="font-semibold text-white text-sm">Cronogramas</span>
        <button
          className="ml-auto lg:hidden text-slate-400 hover:text-white"
          onClick={() => setMobileOpen(false)}
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav principal */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        <NavItem to="/dashboard" icon={<LayoutDashboard size={16} />} label="Dashboard" active={isActive('/dashboard')} />
        <NavItem to="/empresas" icon={<Building2 size={16} />} label="Empresas" active={isActive('/empresas')} />

        {/* Empresa activa + proyectos */}
        {empresas.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setExpandEmpresas(!expandEmpresas)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-400"
            >
              {expandEmpresas ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Mis empresas
            </button>
            {expandEmpresas && (
              <div className="mt-1 space-y-0.5">
                {empresas.map((empresa) => (
                  <button
                    key={empresa.id}
                    onClick={() => { onEmpresaChange(empresa); navigate(`/empresa/${empresa.id}/proyectos`) }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                      empresaActiva?.id === empresa.id
                        ? 'bg-slate-700/70 text-white'
                        : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                    )}
                  >
                    <div
                      className={cn('w-5 h-5 rounded text-xs font-bold flex items-center justify-center flex-shrink-0 text-white', `bg-${empresa.color}-500`)}
                    >
                      {empresa.nombre[0]}
                    </div>
                    <span className="truncate">{empresa.nombre}</span>
                    {empresaActiva?.id === empresa.id && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                    )}
                  </button>
                ))}
                <Link
                  to="/empresas"
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  <Plus size={14} />
                  Nueva empresa
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Links de empresa activa */}
        {empresaActiva && (
          <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-0.5">
            <p className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
              {empresaActiva.nombre}
            </p>
            <NavItem
              to={`/empresa/${empresaActiva.id}/proyectos`}
              icon={<FolderKanban size={16} />}
              label="Proyectos"
              active={isActive(`/empresa/${empresaActiva.id}/proyectos`)}
            />
          </div>
        )}
      </nav>

      {/* Footer usuario */}
      <div className="px-3 py-4 border-t border-slate-700/50 space-y-1">
        {isAdmin && (
          <NavItem to="/admin" icon={<ShieldCheck size={15} />} label="Control de acceso" active={isActive('/admin')} />
        )}
        <NavItem to="/settings" icon={<Settings size={15} />} label="Configuración" active={isActive('/settings')} />
        <div className="flex items-center gap-3 px-3 py-2">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-semibold text-white">
              {getInitials(user?.displayName ?? user?.email ?? 'U')}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-200 truncate">{user?.displayName ?? 'Usuario'}</p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
          <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 transition-colors">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile toggle button */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 bg-slate-900 text-white p-2 rounded-lg shadow-lg"
        onClick={() => setMobileOpen(true)}
      >
        <Menu size={18} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div className={cn(
        'lg:hidden fixed left-0 top-0 bottom-0 w-64 z-50 transition-transform duration-300',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {sidebarContent}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-60 flex-shrink-0 flex-col h-screen sticky top-0">
        {sidebarContent}
      </div>
    </>
  )
}

function NavItem({ to, icon, label, active }: { to: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
        active
          ? 'bg-indigo-600 text-white'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
      )}
    >
      {icon}
      {label}
    </Link>
  )
}
