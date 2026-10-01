import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckSquare, Clock, AlertTriangle, CalendarDays, Inbox, ChevronDown, ChevronRight, ExternalLink, Filter } from 'lucide-react'
import { useMisTareas } from '@/hooks/useMisTareas'
import { useEmpresas } from '@/hooks/useEmpresas'
import { useTodosProyectos } from '@/hooks/useProyectos'
import { actualizarTarea } from '@/lib/firestore'
import { cn, tsToDate, formatFecha } from '@/lib/utils'
import type { EstadoTarea, Tarea } from '@/types'

// ─── Helpers de agrupación temporal ──────────────────────────────────────────

function getGrupoFecha(tarea: Tarea): 'vencida' | 'hoy' | 'semana' | 'proxima' | 'sin_fecha' {
  if (!tarea.fechaFin) return 'sin_fecha'
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const fin = tsToDate(tarea.fechaFin); fin.setHours(0, 0, 0, 0)
  const diff = Math.round((fin.getTime() - hoy.getTime()) / 86400000)
  if (tarea.estado === 'completada') return 'proxima'
  if (diff < 0) return 'vencida'
  if (diff === 0) return 'hoy'
  if (diff <= 7) return 'semana'
  return 'proxima'
}

function labelFecha(tarea: Tarea): string {
  if (!tarea.fechaFin) return 'Sin fecha'
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const fin = tsToDate(tarea.fechaFin); fin.setHours(0, 0, 0, 0)
  const diff = Math.round((fin.getTime() - hoy.getTime()) / 86400000)
  if (diff < 0) return `Venció hace ${Math.abs(diff)} día${Math.abs(diff) !== 1 ? 's' : ''}`
  if (diff === 0) return 'Vence hoy'
  if (diff === 1) return 'Vence mañana'
  return `Vence en ${diff} días · ${formatFecha(tarea.fechaFin, 'dd MMM')}`
}

const ESTADO_OPTS: { value: EstadoTarea; label: string }[] = [
  { value: 'pendiente',   label: 'Pendiente' },
  { value: 'en_progreso', label: 'En progreso' },
  { value: 'completada',  label: 'Completada' },
  { value: 'bloqueada',   label: 'Bloqueada' },
]

const ESTADO_COLORS: Record<EstadoTarea, string> = {
  pendiente:   'bg-slate-100 text-slate-600',
  en_progreso: 'bg-blue-100 text-blue-700',
  completada:  'bg-emerald-100 text-emerald-700',
  bloqueada:   'bg-red-100 text-red-700',
}

const PRIORIDAD_COLORS: Record<string, string> = {
  critica: 'bg-red-100 text-red-700',
  alta:    'bg-orange-100 text-orange-700',
  media:   'bg-yellow-100 text-yellow-700',
  baja:    'bg-slate-100 text-slate-500',
}

const GRUPOS_CONFIG = [
  { key: 'vencida',   label: 'Vencidas',     icon: AlertTriangle, color: 'text-red-500',    bg: 'bg-red-50',     border: 'border-red-200' },
  { key: 'hoy',       label: 'Vence hoy',    icon: Clock,         color: 'text-amber-500',  bg: 'bg-amber-50',   border: 'border-amber-200' },
  { key: 'semana',    label: 'Esta semana',   icon: CalendarDays,  color: 'text-indigo-500', bg: 'bg-indigo-50',  border: 'border-indigo-200' },
  { key: 'proxima',   label: 'Próximas',      icon: CheckSquare,   color: 'text-slate-500',  bg: 'bg-slate-50',   border: 'border-slate-200' },
  { key: 'sin_fecha', label: 'Sin fecha',     icon: Inbox,         color: 'text-slate-400',  bg: 'bg-white',      border: 'border-slate-200' },
] as const

// ─── Componente principal ─────────────────────────────────────────────────────

export function MisTareasPage() {
  const navigate = useNavigate()
  const { tareas, loading } = useMisTareas()
  const { empresas } = useEmpresas()
  const empresaIds = empresas.map(e => e.id)
  const { proyectos } = useTodosProyectos(empresaIds)

  const [filtroEstado, setFiltroEstado]     = useState<EstadoTarea | ''>('')
  const [filtroEmpresa, setFiltroEmpresa]   = useState('')
  const [collapsed, setCollapsed]           = useState<Set<string>>(new Set())

  const proyectoMap = useMemo(() => new Map(proyectos.map(p => [p.id, p])), [proyectos])
  const empresaMap  = useMemo(() => new Map(empresas.map(e => [e.id, e])), [empresas])

  const tareasFiltradas = useMemo(() => {
    return tareas.filter(t => {
      if (filtroEstado  && t.estado    !== filtroEstado)  return false
      if (filtroEmpresa && t.empresaId !== filtroEmpresa) return false
      return true
    })
  }, [tareas, filtroEstado, filtroEmpresa])

  const grupos = useMemo(() => {
    const map = new Map<string, Tarea[]>()
    for (const cfg of GRUPOS_CONFIG) map.set(cfg.key, [])
    for (const t of tareasFiltradas) {
      const g = getGrupoFecha(t)
      map.get(g)!.push(t)
    }
    // Sort within each grupo by fechaFin asc
    for (const [, list] of map) list.sort((a, b) => (a.fechaFin?.seconds ?? 0) - (b.fechaFin?.seconds ?? 0))
    return map
  }, [tareasFiltradas])

  const toggleCollapse = (key: string) =>
    setCollapsed(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  const handleStatusChange = async (tarea: Tarea, estado: EstadoTarea) => {
    const progresoActual = tarea.progreso ?? 0
    const progreso = estado === 'completada' ? 100
      : estado === 'pendiente' ? 0
      : estado === 'en_progreso' && progresoActual === 0 ? 50
      : progresoActual
    await actualizarTarea(tarea.id, { estado, progreso })
  }

  const navigateToTask = (tarea: Tarea) => {
    const proyecto = proyectoMap.get(tarea.proyectoId)
    if (!proyecto) return
    navigate(`/empresa/${tarea.empresaId}/proyecto/${tarea.proyectoId}`)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const totalActivas = tareas.filter(t => t.estado !== 'completada').length

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Mis tareas</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {totalActivas} tarea{totalActivas !== 1 ? 's' : ''} activa{totalActivas !== 1 ? 's' : ''} asignadas a ti
        </p>
      </div>

      {/* Filtros */}
      {(empresas.length > 1 || true) && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <Filter size={14} className="text-slate-400" />
          <select
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 focus:outline-none focus:border-indigo-400"
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value as EstadoTarea | '')}
          >
            <option value="">Todos los estados</option>
            {ESTADO_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {empresas.length > 1 && (
            <select
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 focus:outline-none focus:border-indigo-400"
              value={filtroEmpresa}
              onChange={e => setFiltroEmpresa(e.target.value)}
            >
              <option value="">Todas las empresas</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Grupos */}
      <div className="space-y-6">
        {GRUPOS_CONFIG.map(({ key, label, icon: Icon, color, bg, border }) => {
          const lista = grupos.get(key) ?? []
          if (lista.length === 0) return null
          const isCollapsed = collapsed.has(key)

          return (
            <div key={key}>
              {/* Grupo header */}
              <button
                onClick={() => toggleCollapse(key)}
                className="w-full flex items-center gap-2 mb-2 group"
              >
                <Icon size={15} className={color} />
                <span className="text-sm font-semibold text-slate-700">{label}</span>
                <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', bg, border, color)}>
                  {lista.length}
                </span>
                <div className="flex-1 h-px bg-slate-200 ml-2" />
                {isCollapsed ? <ChevronRight size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
              </button>

              {/* Tareas del grupo */}
              {!isCollapsed && (
                <div className="space-y-2">
                  {lista.map(tarea => {
                    const proyecto = proyectoMap.get(tarea.proyectoId)
                    const empresa  = empresaMap.get(tarea.empresaId)
                    const fechaLabel = labelFecha(tarea)
                    const esVencida = key === 'vencida'

                    return (
                      <div
                        key={tarea.id}
                        className={cn(
                          'flex items-start gap-3 p-3.5 rounded-xl border bg-white transition-shadow hover:shadow-sm',
                          esVencida ? 'border-red-200' : 'border-slate-200',
                          tarea.estado === 'completada' && 'opacity-60'
                        )}
                      >
                        {/* Estado selector */}
                        <select
                          value={tarea.estado}
                          onChange={e => handleStatusChange(tarea, e.target.value as EstadoTarea)}
                          onClick={e => e.stopPropagation()}
                          className={cn(
                            'text-xs font-medium rounded-lg px-2 py-1 border-0 cursor-pointer focus:outline-none flex-shrink-0',
                            ESTADO_COLORS[tarea.estado]
                          )}
                        >
                          {ESTADO_OPTS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p
                            onClick={() => navigateToTask(tarea)}
                            className={cn(
                              'text-sm font-medium text-slate-800 cursor-pointer hover:text-indigo-600 truncate',
                              tarea.estado === 'completada' && 'line-through text-slate-400'
                            )}
                          >
                            {tarea.tipo === 'hito' && <span className="text-rose-400 mr-1">◆</span>}
                            {tarea.titulo}
                          </p>

                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {/* Proyecto + empresa */}
                            {proyecto && (
                              <button
                                onClick={() => navigateToTask(tarea)}
                                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                              >
                                {empresa && (
                                  <span className={cn(
                                    'w-3.5 h-3.5 rounded text-white font-bold flex items-center justify-center text-[8px] flex-shrink-0',
                                    `bg-${empresa.color}-500`
                                  )}>
                                    {empresa.nombre[0]}
                                  </span>
                                )}
                                {proyecto.nombre}
                                <ExternalLink size={10} />
                              </button>
                            )}

                            {/* Fecha */}
                            <span className={cn(
                              'text-xs',
                              esVencida ? 'text-red-600 font-medium' :
                              key === 'hoy' ? 'text-amber-600 font-medium' :
                              'text-slate-400'
                            )}>
                              {fechaLabel}
                            </span>

                            {/* Prioridad */}
                            {tarea.prioridad && tarea.prioridad !== 'media' && (
                              <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', PRIORIDAD_COLORS[tarea.prioridad])}>
                                {tarea.prioridad}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {tareasFiltradas.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4">
              <CheckSquare size={24} className="text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mb-1">Todo al día</h3>
            <p className="text-sm text-slate-400">No tienes tareas pendientes asignadas.</p>
          </div>
        )}
      </div>
    </div>
  )
}
