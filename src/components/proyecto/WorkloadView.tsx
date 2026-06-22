import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Clock, TrendingUp } from 'lucide-react'
import { cn, isVencida, isProximaAVencer, ESTADO_COLORS, ESTADO_LABELS } from '@/lib/utils'
import type { Tarea } from '@/types'

function getResponsables(t: Tarea): string[] {
  return t.asignadosA?.length ? t.asignadosA : t.asignadoA ? [t.asignadoA] : []
}

interface Stats {
  nombre: string
  total: number
  completadas: number
  enProgreso: number
  pendientes: number
  bloqueadas: number
  vencidas: number
  proximasAVencer: number
  tareas: Tarea[]
}

export function WorkloadView({ tareas }: { tareas: Tarea[] }) {
  const nonGrupo = tareas.filter((t) => t.tipo !== 'grupo')

  const stats = useMemo<Stats[]>(() => {
    const map = new Map<string, Tarea[]>()
    for (const t of nonGrupo) {
      for (const r of getResponsables(t)) {
        if (!map.has(r)) map.set(r, [])
        map.get(r)!.push(t)
      }
    }
    const sinResponsable = nonGrupo.filter((t) => getResponsables(t).length === 0)
    if (sinResponsable.length > 0) map.set('Sin asignar', sinResponsable)

    return [...map.entries()].map(([nombre, ts]) => ({
      nombre,
      total: ts.length,
      completadas: ts.filter((t) => t.estado === 'completada').length,
      enProgreso: ts.filter((t) => t.estado === 'en_progreso').length,
      pendientes: ts.filter((t) => t.estado === 'pendiente').length,
      bloqueadas: ts.filter((t) => t.estado === 'bloqueada').length,
      vencidas: ts.filter((t) => t.estado !== 'completada' && isVencida(t.fechaFin)).length,
      proximasAVencer: ts.filter((t) => t.estado !== 'completada' && !isVencida(t.fechaFin) && isProximaAVencer(t.fechaFin, 5)).length,
      tareas: ts,
    })).sort((a, b) => b.vencidas - a.vencidas || b.total - a.total)
  }, [nonGrupo])

  if (stats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
        <TrendingUp size={32} className="mb-3 opacity-30" />
        <p className="text-sm font-medium">Sin responsables asignados</p>
        <p className="text-xs mt-1">Asigna responsables a las tareas para ver la carga de trabajo</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 gap-4">
        {stats.map((s) => {
          const pct = s.total > 0 ? Math.round((s.completadas / s.total) * 100) : 0
          const initials = s.nombre === 'Sin asignar'
            ? '?'
            : s.nombre.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()

          return (
            <div key={s.nombre} className={cn(
              'bg-white rounded-2xl border shadow-sm p-5',
              s.vencidas > 0 ? 'border-red-200' : 'border-slate-200'
            )}>
              {/* Header */}
              <div className="flex items-start gap-4 mb-4">
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                  s.nombre === 'Sin asignar' ? 'bg-slate-100 text-slate-400' : 'bg-indigo-100 text-indigo-700'
                )}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-slate-900">{s.nombre}</h3>
                    {s.vencidas > 0 && (
                      <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full font-medium">
                        <AlertTriangle size={11} /> {s.vencidas} vencida{s.vencidas !== 1 ? 's' : ''}
                      </span>
                    )}
                    {s.proximasAVencer > 0 && s.vencidas === 0 && (
                      <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                        <Clock size={11} /> {s.proximasAVencer} vencen pronto
                      </span>
                    )}
                    {pct === 100 && (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                        <CheckCircle2 size={11} /> Al día
                      </span>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-500 w-8 text-right">{pct}%</span>
                  </div>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: 'Total', val: s.total, cls: 'bg-slate-50 text-slate-700' },
                  { label: 'Completadas', val: s.completadas, cls: 'bg-emerald-50 text-emerald-700' },
                  { label: 'En progreso', val: s.enProgreso, cls: 'bg-blue-50 text-blue-700' },
                  { label: 'Pendientes', val: s.pendientes, cls: 'bg-slate-50 text-slate-600' },
                  { label: 'Bloqueadas', val: s.bloqueadas, cls: s.bloqueadas > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-400' },
                ].map(({ label, val, cls }) => (
                  <div key={label} className={cn('rounded-xl px-3 py-2 text-center', cls)}>
                    <p className="text-lg font-bold">{val}</p>
                    <p className="text-[10px] font-medium opacity-80">{label}</p>
                  </div>
                ))}
              </div>

              {/* Task list (collapsed if many) */}
              {s.tareas.length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 select-none">
                    Ver {s.tareas.length} tarea{s.tareas.length !== 1 ? 's' : ''}
                  </summary>
                  <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-slate-100">
                    {s.tareas.map((t) => {
                      const ec = ESTADO_COLORS[t.estado]
                      const vc = t.estado !== 'completada' && isVencida(t.fechaFin)
                      return (
                        <div key={t.id} className={cn('flex items-center gap-2 text-xs py-0.5', vc ? 'text-red-600' : 'text-slate-600')}>
                          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', ec.dot)} />
                          <span className="flex-1 truncate">{t.titulo}</span>
                          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', ec.bg, ec.text)}>
                            {ESTADO_LABELS[t.estado]}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </details>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
