import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Mail, Copy, Check, X, Download } from 'lucide-react'
import { cn, formatFecha, ESTADO_COLORS, ESTADO_LABELS, PRIORIDAD_COLORS, tsToDate } from '@/lib/utils'
import { generarEmailsResumen } from '@/lib/emailUtils'
import { exportCSV } from '@/lib/exportUtils'
import { TareasBloqueadasModal } from './TareasBloqueadasModal'
import { compararFases } from '@/lib/hierarchyUtils'
import { calcularSalud, SEMAFORO_ESTILOS } from '@/lib/saludUtils'
import { BarraAvance } from './BarraAvance'
import { LineaBaseComparacion } from './LineaBaseComparacion'
import { generarResumenCliente } from '@/lib/resumenCliente'
import type { Tarea } from '@/types'

type DashTab = 'resumen' | 'semanal'

const PRIORIDAD_LABELS = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' }

interface Props {
  tareas: Tarea[]
  proyectoNombre?: string
  proyectoId?: string
  /** Para el resumen al cliente (no se muestra como título) */
  nombreParaCliente?: string
  portalUrl?: string
  /** Proyecto global: nombre de cada proyecto que lo compone (habilita la vista "Proyectos") */
  nombresProyectos?: Record<string, string>
  onAbrirTarea?: (t: Tarea) => void
}

export function ProyectoDashboard({ tareas, proyectoNombre, proyectoId, nombreParaCliente, portalUrl, nombresProyectos, onAbrirTarea }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('dash') as DashTab | null) ?? 'resumen'
  const setTab = (t: DashTab) =>
    setSearchParams(p => { p.set('dash', t); return p }, { replace: true })
  const [filtroResponsable, setFiltroResponsable] = useState('')
  const [filtroGrupo, setFiltroGrupo] = useState('')
  const [soloHitos, setSoloHitos] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState<Tarea['estado'] | ''>('')
  const [filtroBloqueo, setFiltroBloqueo] = useState<'interno' | 'cliente' | ''>('')
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [showResumenCliente, setShowResumenCliente] = useState(false)

  const grupos = useMemo(() => tareas.filter(t => t.tipo === 'grupo'), [tareas])
  const responsables = useMemo(() =>
    [...new Set(tareas.map(t => t.asignadoA).filter(Boolean) as string[])].sort(),
    [tareas])

  const filtered = useMemo(() => {
    return tareas.filter(t => {
      if (filtroResponsable && t.asignadoA !== filtroResponsable) return false
      if (filtroGrupo && t.parentId !== filtroGrupo && t.id !== filtroGrupo) return false
      if (soloHitos && t.tipo !== 'hito') return false
      if (filtroEstado && t.tipo !== 'grupo' && t.estado !== filtroEstado) return false
      if (filtroBloqueo && t.tipo !== 'grupo' && (t.estado !== 'bloqueada' || t.bloqueo !== filtroBloqueo)) return false
      return true
    })
  }, [tareas, filtroResponsable, filtroGrupo, soloHitos, filtroEstado, filtroBloqueo])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-slate-200 bg-white flex items-center gap-3 flex-wrap flex-shrink-0">
        {/* Tab toggle */}
        <div className="flex items-center bg-slate-100 rounded-xl p-1">
          {([['resumen', 'Resumen ejecutivo'], ['semanal', 'Vista semanal']] as [DashTab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
                tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              {label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <select value={filtroResponsable} onChange={e => setFiltroResponsable(e.target.value)}
            className="text-sm border border-slate-200 rounded-xl px-3 py-1.5 text-slate-600 bg-white">
            <option value="">Todos los responsables</option>
            {responsables.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)}
            className="text-sm border border-slate-200 rounded-xl px-3 py-1.5 text-slate-600 bg-white">
            <option value="">Todos los grupos</option>
            {grupos.map(g => <option key={g.id} value={g.id}>{g.titulo}</option>)}
          </select>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as Tarea['estado'] | '')}
            className="text-sm border border-slate-200 rounded-xl px-3 py-1.5 text-slate-600 bg-white">
            <option value="">Todos los estados</option>
            {(['pendiente', 'en_progreso', 'completada', 'bloqueada'] as Tarea['estado'][]).map(e => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
          </select>
          <select value={filtroBloqueo} onChange={e => setFiltroBloqueo(e.target.value as 'interno' | 'cliente' | '')}
            className="text-sm border border-slate-200 rounded-xl px-3 py-1.5 text-slate-600 bg-white">
            <option value="">Todos los bloqueos</option>
            <option value="interno">Bloqueo interno</option>
            <option value="cliente">Bloqueo del cliente</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={soloHitos} onChange={e => setSoloHitos(e.target.checked)}
              className="accent-indigo-600" />
            Solo hitos
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button onClick={() => exportCSV(tareas, proyectoNombre ?? 'cronograma')}
            className="flex items-center gap-1.5 text-sm border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-xl transition-colors">
            <Download size={14} /> CSV / Sheets
          </button>
          <button onClick={() => setShowResumenCliente(true)}
            className="flex items-center gap-1.5 text-sm border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-xl transition-colors">
            <Copy size={14} /> Resumen cliente
          </button>
          <button onClick={() => setShowEmailModal(true)}
            className="flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl transition-colors">
            <Mail size={14} /> Email semanal
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'resumen'
          ? <ResumenEjecutivo tareas={filtered} allTareas={tareas} proyectoNombre={proyectoNombre} proyectoId={proyectoId} nombresProyectos={nombresProyectos} onAbrirTarea={onAbrirTarea} />
          : <VistaSemanal tareas={filtered} allTareas={tareas} />
        }
      </div>

      {showEmailModal && (
        <EmailModal tareas={tareas} onClose={() => setShowEmailModal(false)} />
      )}
      {showResumenCliente && (
        <ResumenClienteModal
          texto={generarResumenCliente(nombreParaCliente ?? proyectoNombre ?? 'el proyecto', tareas, portalUrl)}
          onClose={() => setShowResumenCliente(false)} />
      )}
    </div>
  )
}

// ─── Resumen ejecutivo ────────────────────────────────────────────────────────

function ResumenEjecutivo({ tareas, allTareas, proyectoNombre, proyectoId, nombresProyectos, onAbrirTarea }: {
  tareas: Tarea[]; allTareas: Tarea[]; proyectoNombre?: string; proyectoId?: string
  nombresProyectos?: Record<string, string>; onAbrirTarea?: (t: Tarea) => void
}) {
  const [showBloqueadas, setShowBloqueadas] = useState(false)
  const nonGrupo = tareas.filter(t => t.tipo !== 'grupo')
  const total = nonGrupo.length
  const completadas = nonGrupo.filter(t => t.estado === 'completada').length
  const enProceso   = nonGrupo.filter(t => t.estado === 'en_progreso').length
  const pendientes  = nonGrupo.filter(t => t.estado === 'pendiente').length
  const listaBloqueadas = nonGrupo.filter(t => t.estado === 'bloqueada')
  const bloqueadas  = listaBloqueadas.length
  const globalPct   = total > 0 ? Math.round(nonGrupo.reduce((s, t) => s + (t.progreso ?? 0), 0) / total) : 0

  const grupos = allTareas.filter(t => t.tipo === 'grupo')
  const [vistaAvance, setVistaAvance] = useState<'fases' | 'grupos' | 'sprints' | 'proyectos'>(nombresProyectos ? 'proyectos' : 'fases')
  const fases = useMemo(() => calcularAvancePorFase(nonGrupo, allTareas), [nonGrupo, allTareas])
  const sprints = useMemo(() => calcularAvancePorFase(nonGrupo, allTareas, t => t.sprint?.trim() ?? '', false), [nonGrupo, allTareas])
  const porProyecto = useMemo(() => nombresProyectos
    ? calcularAvancePorFase(nonGrupo, allTareas, t => nombresProyectos[t.proyectoId] ?? '', false)
    : [], [nonGrupo, allTareas, nombresProyectos])
  const hitos  = tareas.filter(t => t.tipo === 'hito').sort((a, b) =>
    (a.fechaFin?.seconds ?? 0) - (b.fechaFin?.seconds ?? 0))

  const salud = useMemo(() => calcularSalud(allTareas), [allTareas])
  const est = SEMAFORO_ESTILOS[salud.semaforo]

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {/* Semáforo de salud (todo el proyecto, sin filtros) */}
      <div className={cn('rounded-2xl border px-5 py-4 flex items-center gap-5 flex-wrap', est.bg, 'border-slate-200')}>
        <div className="flex items-center gap-3 min-w-[200px]">
          <span className={cn('w-4 h-4 rounded-full flex-shrink-0', est.dot)} />
          <div>
            <p className={cn('text-sm font-bold', est.text)}>{est.label}</p>
            <p className="text-xs text-slate-600">{salud.motivo}</p>
          </div>
        </div>
        <div className="flex-1 min-w-[220px]"><BarraAvance salud={salud} /></div>
        <div className="text-xs text-slate-600 space-y-0.5">
          <p><b className={salud.diferencia < 0 ? 'text-red-600' : 'text-emerald-600'}>{salud.diferencia > 0 ? '+' : ''}{salud.diferencia} pts</b> vs. lo planeado</p>
          <p>{salud.vencidas} vencida{salud.vencidas === 1 ? '' : 's'} · {salud.bloqueadas} bloqueada{salud.bloqueadas === 1 ? '' : 's'}</p>
        </div>
      </div>

      {/* Stats cards */}
      <div>
        {proyectoNombre && <h2 className="text-lg font-bold text-slate-800 mb-4">{proyectoNombre}</h2>}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total tareas"  value={total}        valueClass="text-slate-700" />
          <StatCard label="Completadas"   value={completadas}  valueClass="text-emerald-600" />
          <StatCard label="En curso"      value={enProceso}    valueClass="text-blue-600" />
          <StatCard label="Pendientes"    value={pendientes}   valueClass="text-slate-500" />
          <StatCard label="Bloqueadas"    value={bloqueadas}   valueClass="text-red-600"
            onClick={() => setShowBloqueadas(true)} hint="Ver motivos" />
          <StatCard label="Avance global" value={`${globalPct}%`} valueClass="text-indigo-600" />
        </div>
      </div>

      {/* Avance por fase (franjas moradas) o por grupo (▶ tareas contenedoras) */}
      {(fases.length > 0 || grupos.length > 0 || sprints.length > 0 || porProyecto.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-3 gap-3">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
              {({ fases: 'Avance por fase', sprints: 'Avance por sprint', grupos: 'Avance por grupo', proyectos: 'Avance por proyecto' })[vistaAvance]}
            </h3>
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              {([...(porProyecto.length ? [['proyectos', `Proyectos (${porProyecto.length})`]] : []), ['fases', `Fases (${fases.length})`], ['grupos', `Grupos (${grupos.length})`], ...(sprints.length ? [['sprints', `Sprints (${sprints.length})`]] : [])] as Array<[typeof vistaAvance, string]>).map(([v, label]) => (
                <button key={v} onClick={() => setVistaAvance(v)}
                  className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    vistaAvance === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {(vistaAvance === 'fases' ? fases : vistaAvance === 'sprints' ? sprints : vistaAvance === 'proyectos' ? porProyecto : grupos).length === 0 ? (
            <p className="text-sm text-slate-400 bg-white rounded-xl border border-dashed border-slate-200 p-4 text-center">
              {vistaAvance === 'fases'
                ? 'Ninguna tarea tiene Fase asignada.'
                : 'No hay grupos (tareas con subtareas) en este proyecto.'}
            </p>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(vistaAvance !== 'grupos'
              ? (vistaAvance === 'fases' ? fases : vistaAvance === 'proyectos' ? porProyecto : sprints).map(f => ({ key: f.nombre, titulo: f.nombre, icono: '', progreso: f.progreso, estado: f.estado, detalle: `${f.completadas}/${f.total} tareas completadas` }))
              : grupos.map(g => ({ key: g.id, titulo: g.titulo, icono: '▶ ', progreso: g.progreso ?? 0, estado: g.estado, detalle: '' }))
            ).map(c => (
              <div key={c.key} className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-700 mb-2 truncate">{c.icono}{c.titulo}</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', c.progreso === 100 ? 'bg-emerald-500' : 'bg-indigo-500')}
                      style={{ width: `${c.progreso}%` }} />
                  </div>
                  <span className="text-sm font-bold text-indigo-600 w-10 text-right">{c.progreso}%</span>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <p className={cn('text-xs font-medium', ESTADO_COLORS[c.estado].text)}>{ESTADO_LABELS[c.estado]}</p>
                  {c.detalle && <p className="text-[11px] text-slate-400">{c.detalle}</p>}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      )}

      {proyectoId && <LineaBaseComparacion proyectoId={proyectoId} tareas={allTareas} />}

      {/* Hitos clave */}
      {hitos.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Hitos clave</h3>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Fase / Grupo', 'Hito', 'Fecha límite', 'Estado'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hitos.map(hito => {
                  const grupo = allTareas.find(t => t.id === hito.parentId && t.tipo === 'grupo')
                  const ec = ESTADO_COLORS[hito.estado]
                  return (
                    <tr key={hito.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-500">{grupo?.titulo ?? '—'}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">◆ {hito.titulo}</td>
                      <td className="px-4 py-3 text-slate-600">{formatFecha(hito.fechaFin)}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full', ec.bg, ec.text)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', ec.dot)} />
                          {ESTADO_LABELS[hito.estado]}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All tasks table */}
      <div>
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Tareas principales ({nonGrupo.length})
        </h3>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['#', 'Fase', 'Tarea', 'Responsable', 'Inicio', 'Fin', 'Estado', 'Prioridad', '% Avance'].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {nonGrupo.map((t, i) => {
                const grupo = allTareas.find(g => g.id === t.parentId && g.tipo === 'grupo')
                const ec = ESTADO_COLORS[t.estado]
                const pc = PRIORIDAD_COLORS[t.prioridad]
                return (
                  <tr key={t.id} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 text-slate-400 text-xs">{i + 1}</td>
                    <td className="px-3 py-2.5 text-slate-500 text-xs max-w-[120px] truncate">{grupo?.titulo ?? '—'}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[200px] truncate">{t.titulo}</td>
                    <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">{t.asignadoA ?? '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">{formatFecha(t.fechaInicio, 'dd/MM/yyyy')}</td>
                    <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">{formatFecha(t.fechaFin, 'dd/MM/yyyy')}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap', ec.bg, ec.text)}>
                        {ESTADO_LABELS[t.estado]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', pc.bg, pc.text)}>
                        {PRIORIDAD_LABELS[t.prioridad]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${t.progreso}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 w-8">{t.progreso}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showBloqueadas && (
        <TareasBloqueadasModal
          bloqueadas={listaBloqueadas}
          allTareas={allTareas}
          onClose={() => setShowBloqueadas(false)}
          onAbrirTarea={onAbrirTarea && (t => { setShowBloqueadas(false); onAbrirTarea(t) })}
        />
      )}
    </div>
  )
}

// La fase de una tarea es la suya o, si no tiene, la de su ancestro más cercano.
// Avance = promedio de las tareas (completada cuenta 100%), igual que enrichTareas.
// `clave` permite reutilizarlo para sprints; `heredar` busca el valor en los ancestros
function calcularAvancePorFase(tareas: Tarea[], allTareas: Tarea[], clave: (t: Tarea) => string = t => t.fase?.trim() ?? '', heredar = true) {
  const porId = new Map(allTareas.map(t => [t.id, t]))
  const faseDe = (t: Tarea): string => {
    if (!heredar) return clave(t)
    let cur: Tarea | undefined = t
    for (let i = 0; cur && i < 50; i++) {
      if (clave(cur)) return clave(cur)
      cur = cur.parentId ? porId.get(cur.parentId) : undefined
    }
    return ''
  }
  // Orden de las fases: como aparecen en el cronograma/Sheet (menor `orden`); si no hay
  // orden, por nombre con números naturales (Fase 2 antes que Fase 10)
  const map = new Map<string, Tarea[]>()
  const primerOrden = new Map<string, number>()
  for (const t of tareas) {
    const f = faseDe(t)
    if (!f) continue
    if (!map.has(f)) map.set(f, [])
    map.get(f)!.push(t)
    if (t.orden !== undefined) primerOrden.set(f, Math.min(primerOrden.get(f) ?? Infinity, t.orden))
  }
  // Sprints: por nombre (Sprint 01, 02…); fases: por orden de aparición
  const orden = [...map.keys()].sort((a, b) => heredar
    ? compararFases({ nombre: a, orden: primerOrden.get(a) }, { nombre: b, orden: primerOrden.get(b) })
    : compararFases({ nombre: a }, { nombre: b }))
  return orden.map(nombre => {
    const ts = map.get(nombre)!
    const completadas = ts.filter(t => t.estado === 'completada').length
    const progreso = Math.round(ts.reduce((s, t) => s + (t.estado === 'completada' ? 100 : (t.progreso ?? 0)), 0) / ts.length)
    const estado: Tarea['estado'] =
      completadas === ts.length ? 'completada'
      : ts.some(t => t.estado === 'bloqueada') ? 'bloqueada'
      : ts.some(t => t.estado === 'en_progreso' || t.estado === 'completada' || (t.progreso ?? 0) > 0) ? 'en_progreso'
      : 'pendiente'
    return { nombre, total: ts.length, completadas, progreso, estado }
  })
}

function StatCard({ label, value, valueClass, onClick, hint }: {
  label: string; value: string | number; valueClass: string; onClick?: () => void; hint?: string
}) {
  const content = (
    <>
      <p className={cn('text-2xl font-bold', valueClass)}>{value}</p>
      <p className="text-xs text-slate-500 mt-1 leading-tight">{label}</p>
      {onClick && hint && <p className="text-[10px] text-indigo-500 mt-1 font-medium">{hint} →</p>}
    </>
  )
  if (!onClick) {
    return <div className="bg-white rounded-xl border border-slate-200 px-4 py-4 text-center">{content}</div>
  }
  return (
    <button onClick={onClick}
      className="bg-white rounded-xl border border-slate-200 px-4 py-4 text-center hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer">
      {content}
    </button>
  )
}

// ─── Vista semanal ────────────────────────────────────────────────────────────

function VistaSemanal({ tareas, allTareas }: { tareas: Tarea[]; allTareas: Tarea[] }) {
  const grupoMap = new Map(allTareas.filter(t => t.tipo === 'grupo').map(t => [t.id, t.titulo]))

  // Group non-grupo tasks by ISO start week
  const weekMap = useMemo(() => {
    const map = new Map<string, { start: Date; end: Date; tasks: Tarea[] }>()
    for (const t of tareas) {
      if (t.tipo === 'grupo') continue
      const start = tsToDate(t.fechaInicio)
      const wStart = startOfWeek(start, { weekStartsOn: 1 })
      const key = format(wStart, 'yyyy-MM-dd')
      if (!map.has(key)) map.set(key, { start: wStart, end: endOfWeek(wStart, { weekStartsOn: 1 }), tasks: [] })
      map.get(key)!.tasks.push(t)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v], idx) => ({ ...v, label: `S${idx + 1}` }))
  }, [tareas])

  if (weekMap.length === 0) {
    return <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Sin tareas en el rango seleccionado</div>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {weekMap.map(week => {
        // Group tasks by fase, preserving orden within each fase
        const byFase = new Map<string, Tarea[]>()
        const sorted = [...week.tasks].sort((a, b) =>
          (a.orden ?? 999999) !== (b.orden ?? 999999)
            ? (a.orden ?? 999999) - (b.orden ?? 999999)
            : (a.fechaInicio?.seconds ?? 0) - (b.fechaInicio?.seconds ?? 0)
        )
        for (const t of sorted) {
          const fase = t.fase?.trim() ?? ''
          if (!byFase.has(fase)) byFase.set(fase, [])
          byFase.get(fase)!.push(t)
        }
        // Sin fase tasks go last
        const conFase = [...byFase.entries()].filter(([f]) => f !== '')
        const sinFase = byFase.get('') ?? []

        return (
        <div key={week.label} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {/* Week header */}
          <div className="bg-slate-800 text-white px-5 py-3 flex items-center gap-4">
            <span className="text-sm font-bold">{week.label}</span>
            <span className="text-slate-300 text-sm">
              {format(week.start, "d 'de' MMMM", { locale: es })} – {format(week.end, "d 'de' MMMM yyyy", { locale: es })}
            </span>
            <span className="ml-auto text-xs text-slate-400">{week.tasks.length} tarea{week.tasks.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Tasks table */}
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Semana', 'Período', 'Grupo', 'Tarea', 'Responsable', 'Estado', '% Avance'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Tasks grouped by fase */}
              {[...conFase, ...(sinFase.length ? [['', sinFase] as [string, Tarea[]]] : [])].map(([fase, faseTasks]) => (
                <>
                  {fase && (
                    <tr key={`fase-${fase}`}>
                      <td colSpan={7} className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider">
                        {fase}
                      </td>
                    </tr>
                  )}
                  {(faseTasks as Tarea[]).map(t => {
                    const grupoNombre = t.parentId ? (grupoMap.get(t.parentId) ?? '') : ''
                    const responsables = t.asignadosA?.length ? t.asignadosA : (t.asignadoA ? [t.asignadoA] : [])
                    const ec = ESTADO_COLORS[t.estado]
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 text-xs font-semibold text-slate-600">{week.label}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                          {formatFecha(t.fechaInicio, 'dd/MM')} – {formatFecha(t.fechaFin, 'dd/MM')}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[130px] truncate" title={grupoNombre || undefined}>
                          {grupoNombre || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-800 max-w-[200px]">
                          {grupoNombre && <span className="text-slate-300 mr-1">└</span>}
                          <span className="truncate inline-block max-w-full">{t.titulo}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                          {responsables.length ? responsables.join(', ') : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap', ec.bg, ec.text)}>
                            {ESTADO_LABELS[t.estado]}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${t.progreso}%` }} />
                            </div>
                            <span className="text-xs text-slate-500">{t.progreso}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
        )
      })}
    </div>
  )
}

// ─── Email preview modal ──────────────────────────────────────────────────────

function ResumenClienteModal({ texto, onClose }: { texto: string; onClose: () => void }) {
  const [valor, setValor] = useState(texto)
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    await navigator.clipboard.writeText(valor)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Resumen para el cliente</h2>
            <p className="text-xs text-slate-500 mt-0.5">Listo para pegar en correo o WhatsApp. Solo incluye bloqueos del cliente, nunca internos.</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="flex-1 min-h-0 p-5">
          <textarea value={valor} onChange={e => setValor(e.target.value)}
            className="w-full h-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 resize-none focus:outline-none focus:border-indigo-400 font-mono" />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="btn-secondary">Cerrar</button>
          <button onClick={copiar} className="btn-primary flex items-center gap-2">
            {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EmailModal({ tareas, onClose }: { tareas: Tarea[]; onClose: () => void }) {
  const emails = useMemo(() => generarEmailsResumen(tareas), [tareas])
  const [selected, setSelected] = useState(emails[0]?.responsable ?? '')
  const [copied, setCopied] = useState(false)
  const [editedBodies, setEditedBodies] = useState<Record<string, string>>(
    () => Object.fromEntries(emails.map(e => [e.responsable, e.body]))
  )

  const currentBody = editedBodies[selected] ?? ''

  const copy = async () => {
    await navigator.clipboard.writeText(currentBody)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openMailto = () => {
    const subject = encodeURIComponent(`Resumen semanal — ${selected}`)
    const body = encodeURIComponent(currentBody)
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Email semanal</h2>
            <p className="text-xs text-slate-500 mt-0.5">Edita el contenido antes de copiar o enviar</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {emails.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            No hay responsables asignados a las tareas
          </div>
        ) : (
          <>
            {/* Responsable selector */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 flex-shrink-0 flex-wrap">
              <span className="text-sm text-slate-500">Para:</span>
              <div className="flex flex-wrap gap-2">
                {emails.map(e => (
                  <button key={e.responsable} onClick={() => setSelected(e.responsable)}
                    className={cn('px-3 py-1 rounded-xl text-sm font-medium transition-colors',
                      selected === e.responsable
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                    {e.responsable}
                  </button>
                ))}
              </div>
            </div>

            {/* Editable email body */}
            <div className="flex-1 min-h-0 p-5">
              <textarea
                className="w-full h-full bg-slate-50 rounded-xl p-4 border border-slate-200 text-sm text-slate-700 font-mono leading-relaxed resize-none focus:outline-none focus:border-indigo-400"
                value={currentBody}
                onChange={(e) => setEditedBodies(prev => ({ ...prev, [selected]: e.target.value }))}
                spellCheck={false}
              />
            </div>

            {/* Actions */}
            <div className="px-5 py-4 border-t border-slate-200 flex items-center gap-3 flex-shrink-0 bg-slate-50">
              <button onClick={copy}
                className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-xl transition-colors">
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                {copied ? '¡Copiado!' : 'Copiar'}
              </button>
              <button onClick={openMailto}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
                <Mail size={14} /> Abrir en cliente de email
              </button>
              <p className="ml-auto text-xs text-slate-400">Para envío automático semanal, configura Firebase Cloud Functions</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
