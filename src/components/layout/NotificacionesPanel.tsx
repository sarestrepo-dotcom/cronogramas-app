import { useRef, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, AlertTriangle, Clock, Calendar, ArrowRight, MessageSquarePlus } from 'lucide-react'
import type { NotificacionApp } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { useNotificaciones, type Notificacion, type NivelNotif } from '@/hooks/useNotificaciones'

const NIVEL_CONFIG: Record<NivelNotif, { label: string; color: string; dot: string; icon: React.ReactNode }> = {
  vencida: { label: 'Vencida',       color: 'text-red-600',    dot: 'bg-red-500',    icon: <AlertTriangle size={12} /> },
  hoy:     { label: 'Vence hoy',     color: 'text-amber-600',  dot: 'bg-amber-500',  icon: <Clock size={12} /> },
  manana:  { label: 'Vence mañana',  color: 'text-orange-500', dot: 'bg-orange-400', icon: <Clock size={12} /> },
  semana:  { label: 'Esta semana',   color: 'text-slate-600',  dot: 'bg-slate-400',  icon: <Calendar size={12} /> },
}

interface Props {
  onClose: () => void
}

export function NotificacionesPanel({ onClose }: Props) {
  const { notificaciones, noLeidas, marcarLeida, marcarTodasLeidas, solicitudes, marcarSolicitudLeida, totalNoLeidas } = useNotificaciones()
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const ir = (n: Notificacion) => {
    marcarLeida(n.tareaId)
    navigate(`/empresa/${n.empresaId}/proyecto/${n.proyectoId}?tarea=${n.tareaId}`)
    onClose()
  }

  const irSolicitud = (s: NotificacionApp) => {
    if (!s.leida) marcarSolicitudLeida(s.id)
    navigate(`/empresa/${s.empresaId}/proyecto/${s.proyectoId}${s.portalToken ? `?portal=${s.portalToken}` : ''}`)
    onClose()
  }
  // Solo se muestran las últimas 10 solicitudes (las no leídas siempre primero)
  const solicitudesVisibles = [...solicitudes].sort((a, b) => Number(a.leida) - Number(b.leida)).slice(0, 10)

  const NIVELES: NivelNotif[] = ['vencida', 'hoy', 'manana', 'semana']
  const grupos = NIVELES.map(nivel => ({
    nivel,
    items: notificaciones.filter(n => n.nivel === nivel),
  })).filter(g => g.items.length > 0)

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full left-0 mb-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[480px] z-50"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Bell size={14} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-800">Notificaciones</span>
          {totalNoLeidas > 0 && (
            <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">
              {totalNoLeidas}
            </span>
          )}
        </div>
        {totalNoLeidas > 0 && (
          <button
            onClick={marcarTodasLeidas}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <CheckCheck size={12} /> Marcar todas
          </button>
        )}
      </div>

      {/* Lista */}
      <div className="overflow-y-auto flex-1">
        {solicitudesVisibles.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600">
              <MessageSquarePlus size={12} /> Solicitudes de cambio
            </div>
            {solicitudesVisibles.map(s => (
              <button
                key={s.id}
                onClick={() => irSolicitud(s)}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-100',
                  s.leida && 'opacity-50'
                )}
              >
                <div className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-1', s.leida ? 'bg-slate-200' : 'bg-indigo-500')} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 leading-snug truncate">{s.titulo}</p>
                  <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">{s.mensaje}</p>
                </div>
                <ArrowRight size={11} className="text-slate-300 flex-shrink-0 mt-1" />
              </button>
            ))}
          </div>
        )}
        {grupos.length === 0 && solicitudesVisibles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-3">
              <CheckCheck size={20} className="text-emerald-500" />
            </div>
            <p className="text-sm font-medium text-slate-700">Todo al día</p>
            <p className="text-xs text-slate-400 mt-1">No tienes tareas urgentes esta semana</p>
          </div>
        ) : (
          grupos.map(({ nivel, items }) => {
            const cfg = NIVEL_CONFIG[nivel]
            return (
              <div key={nivel}>
                <div className={cn('flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold uppercase tracking-wider', cfg.color)}>
                  {cfg.icon} {cfg.label}
                  <span className="ml-1 opacity-60">({items.length})</span>
                </div>
                {items.map(n => {
                  const leida = !noLeidas.find(x => x.tareaId === n.tareaId)
                  return (
                    <button
                      key={n.tareaId}
                      onClick={() => ir(n)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0',
                        leida && 'opacity-50'
                      )}
                    >
                      <div className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-0.5', leida ? 'bg-slate-200' : cfg.dot)} />
                      <span className="flex-1 text-xs text-slate-700 leading-snug line-clamp-2">{n.titulo}</span>
                      <ArrowRight size={11} className="text-slate-300 flex-shrink-0" />
                    </button>
                  )
                })}
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      {notificaciones.length > 0 && (
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
          <p className="text-[10px] text-slate-400 text-center">
            Solo muestra tus tareas asignadas · <button onClick={() => { navigate('/mis-tareas'); onClose() }} className="text-indigo-500 hover:underline">Ver todas</button>
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Bell button ─────────────────────────────────────────────────────────────

export function NotificacionesBell() {
  const { totalNoLeidas } = useNotificaciones()
  const [open, setOpen] = useState(false)
  const count = totalNoLeidas

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
          open ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
        )}
        title="Notificaciones"
      >
        <Bell size={15} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && <NotificacionesPanel onClose={() => setOpen(false)} />}
    </div>
  )
}

