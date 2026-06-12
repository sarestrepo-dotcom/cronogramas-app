import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Clock, CheckCircle2, TrendingUp, Calendar, Filter } from 'lucide-react'
import { useEmpresas } from '@/hooks/useEmpresas'
import { useTareasProximas } from '@/hooks/useTareas'
import { useTodosProyectos } from '@/hooks/useProyectos'
import { cn, formatFecha, diasRestantes, isVencida, ESTADO_COLORS, ESTADO_LABELS, PRIORIDAD_COLORS } from '@/lib/utils'
import { COLORES_EMPRESAS } from '@/types'
import type { Tarea } from '@/types'

export function DashboardPage() {
  const { empresas, loading: loadingEmpresas } = useEmpresas()
  const [empresaFiltro, setEmpresaFiltro] = useState<string>('todas')

  const empresaIds = empresaFiltro === 'todas'
    ? empresas.map((e) => e.id)
    : [empresaFiltro]

  const { tareas: todasLasTareas, loading: loadingTareas } = useTareasProximas(empresaIds, 30)
  const { proyectos } = useTodosProyectos(empresas.map(e => e.id))

  // Only show tasks that belong to projects that actually exist
  const proyectoIds = new Set(proyectos.map(p => p.id))
  const tareas = todasLasTareas.filter(t => proyectoIds.has(t.proyectoId))

  const navigate = useNavigate()

  const vencidas = tareas.filter((t) => isVencida(t.fechaFin))
  const hoy = tareas.filter((t) => {
    const d = diasRestantes(t.fechaFin)
    return d >= 0 && d <= 2
  })
  const estasSemana = tareas.filter((t) => {
    const d = diasRestantes(t.fechaFin)
    return d > 2 && d <= 7
  })
  const proximas = tareas.filter((t) => {
    const d = diasRestantes(t.fechaFin)
    return d > 7
  })

  if (loadingEmpresas) return <PageLoader />

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Resumen de tareas próximas a vencer</p>
        </div>

        {/* Filtro empresa */}
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-slate-400" />
          <select
            value={empresaFiltro}
            onChange={(e) => setEmpresaFiltro(e.target.value)}
            className="bg-white border border-slate-200 text-slate-700 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400 shadow-sm"
          >
            <option value="todas">Todas las empresas</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Vencidas"
          value={vencidas.length}
          icon={<AlertTriangle size={18} />}
          color="rose"
          active={vencidas.length > 0}
        />
        <StatCard
          label="Vencen hoy o mañana"
          value={hoy.length}
          icon={<Clock size={18} />}
          color="amber"
          active={hoy.length > 0}
        />
        <StatCard
          label="Esta semana"
          value={estasSemana.length}
          icon={<Calendar size={18} />}
          color="blue"
        />
        <StatCard
          label="Próximos 30 días"
          value={proximas.length}
          icon={<TrendingUp size={18} />}
          color="indigo"
        />
      </div>

      {/* Empresas resumen */}
      {empresaFiltro === 'todas' && empresas.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Por empresa</h2>
          <div className="flex flex-wrap gap-2">
            {empresas.map((empresa) => {
              const count = tareas.filter((t) => t.empresaId === empresa.id).length
              const colores = COLORES_EMPRESAS[empresa.color] ?? COLORES_EMPRESAS.indigo
              return (
                <button
                  key={empresa.id}
                  onClick={() => setEmpresaFiltro(empresa.id)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  <div className={cn('w-5 h-5 rounded text-xs font-bold flex items-center justify-center text-white flex-shrink-0', colores.bg)}>
                    {empresa.nombre[0]}
                  </div>
                  <span className="text-slate-700 font-medium">{empresa.nombre}</span>
                  {count > 0 && (
                    <span className="bg-indigo-100 text-indigo-600 text-xs font-semibold px-1.5 py-0.5 rounded-full">{count}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {loadingTareas ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tareas.length === 0 ? (
        <EmptyDashboard />
      ) : (
        <div className="space-y-6">
          {vencidas.length > 0 && (
            <TareasSection
              titulo="Vencidas"
              tareas={vencidas}
              colorHeader="text-rose-600"
              dotColor="bg-rose-500"
              empresas={empresas}
              onNavigate={(t) => navigate(`/empresa/${t.empresaId}/proyecto/${t.proyectoId}`)}
            />
          )}
          {hoy.length > 0 && (
            <TareasSection
              titulo="Vencen hoy o mañana"
              tareas={hoy}
              colorHeader="text-amber-600"
              dotColor="bg-amber-500"
              empresas={empresas}
              onNavigate={(t) => navigate(`/empresa/${t.empresaId}/proyecto/${t.proyectoId}`)}
            />
          )}
          {estasSemana.length > 0 && (
            <TareasSection
              titulo="Esta semana"
              tareas={estasSemana}
              colorHeader="text-blue-600"
              dotColor="bg-blue-500"
              empresas={empresas}
              onNavigate={(t) => navigate(`/empresa/${t.empresaId}/proyecto/${t.proyectoId}`)}
            />
          )}
          {proximas.length > 0 && (
            <TareasSection
              titulo="Próximos 30 días"
              tareas={proximas}
              colorHeader="text-slate-700"
              dotColor="bg-slate-400"
              empresas={empresas}
              onNavigate={(t) => navigate(`/empresa/${t.empresaId}/proyecto/${t.proyectoId}`)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, color, active }: {
  label: string
  value: number
  icon: React.ReactNode
  color: string
  active?: boolean
}) {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    rose:   { bg: 'bg-rose-50',   text: 'text-rose-600',   border: 'border-rose-200'  },
    amber:  { bg: 'bg-amber-50',  text: 'text-amber-600',  border: 'border-amber-200' },
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-200'  },
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200'},
  }
  const c = colorMap[color]

  return (
    <div className={cn('bg-white rounded-2xl border p-5 shadow-sm', active ? c.border : 'border-slate-200')}>
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', active ? c.bg : 'bg-slate-100')}>
        <span className={cn(active ? c.text : 'text-slate-400')}>{icon}</span>
      </div>
      <p className={cn('text-2xl font-bold', active ? c.text : 'text-slate-900')}>{value}</p>
      <p className="text-slate-500 text-xs mt-1">{label}</p>
    </div>
  )
}

function TareasSection({ titulo, tareas, colorHeader, dotColor, empresas, onNavigate }: {
  titulo: string
  tareas: Tarea[]
  colorHeader: string
  dotColor: string
  empresas: { id: string; nombre: string; color: string }[]
  onNavigate: (t: Tarea) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className={cn('w-2 h-2 rounded-full', dotColor)} />
        <h3 className={cn('font-semibold text-sm', colorHeader)}>{titulo}</h3>
        <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{tareas.length}</span>
      </div>
      <div className="space-y-2">
        {tareas.map((tarea) => (
          <TareaCard key={tarea.id} tarea={tarea} empresas={empresas} onClick={() => onNavigate(tarea)} />
        ))}
      </div>
    </div>
  )
}

function TareaCard({ tarea, empresas, onClick }: {
  tarea: Tarea
  empresas: { id: string; nombre: string; color: string }[]
  onClick: () => void
}) {
  const empresa = empresas.find((e) => e.id === tarea.empresaId)
  const colores = COLORES_EMPRESAS[empresa?.color ?? 'indigo'] ?? COLORES_EMPRESAS.indigo
  const estadoColor = ESTADO_COLORS[tarea.estado]
  const prioridadColor = PRIORIDAD_COLORS[tarea.prioridad]
  const diasLeft = diasRestantes(tarea.fechaFin)
  const vencida = isVencida(tarea.fechaFin)

  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-4 hover:border-indigo-300 hover:shadow-sm transition-all text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-slate-900 truncate">{tarea.titulo}</p>
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0', prioridadColor.bg, prioridadColor.text)}>
            {tarea.prioridad}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {empresa && (
            <span className="flex items-center gap-1.5">
              <div className={cn('w-3.5 h-3.5 rounded flex items-center justify-center text-white text-[9px] font-bold', colores.bg)}>
                {empresa.nombre[0]}
              </div>
              {empresa.nombre}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar size={11} />
            {formatFecha(tarea.fechaFin)}
          </span>
        </div>
      </div>

      <div className="flex-shrink-0 text-right">
        <span className={cn('text-xs font-semibold', vencida ? 'text-rose-600' : diasLeft <= 2 ? 'text-amber-600' : 'text-slate-500')}>
          {vencida ? `Vencida hace ${Math.abs(diasLeft)}d` : diasLeft === 0 ? 'Hoy' : `${diasLeft}d restantes`}
        </span>
        <div className={cn('flex items-center justify-end gap-1 mt-1')}>
          <div className={cn('w-1.5 h-1.5 rounded-full', estadoColor.dot)} />
          <span className={cn('text-xs', estadoColor.text)}>{ESTADO_LABELS[tarea.estado]}</span>
        </div>
      </div>
    </button>
  )
}

function EmptyDashboard() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4">
        <CheckCircle2 size={28} className="text-emerald-500" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">Todo al día</h3>
      <p className="text-slate-500 text-sm max-w-sm">No hay tareas próximas a vencer en los próximos 30 días.</p>
    </div>
  )
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
