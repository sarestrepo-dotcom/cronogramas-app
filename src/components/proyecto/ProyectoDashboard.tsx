import { useMemo, useState } from 'react'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Mail, Copy, Check, X, Download } from 'lucide-react'
import { cn, formatFecha, ESTADO_COLORS, ESTADO_LABELS, PRIORIDAD_COLORS, tsToDate } from '@/lib/utils'
import { generarEmailsResumen } from '@/lib/emailUtils'
import { exportCSV } from '@/lib/exportUtils'
import type { Tarea } from '@/types'

type DashTab = 'resumen' | 'semanal'

const PRIORIDAD_LABELS = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' }

interface Props {
  tareas: Tarea[]
  proyectoNombre?: string
}

export function ProyectoDashboard({ tareas, proyectoNombre }: Props) {
  const [tab, setTab] = useState<DashTab>('resumen')
  const [filtroResponsable, setFiltroResponsable] = useState('')
  const [filtroGrupo, setFiltroGrupo] = useState('')
  const [soloHitos, setSoloHitos] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)

  const grupos = useMemo(() => tareas.filter(t => t.tipo === 'grupo'), [tareas])
  const responsables = useMemo(() =>
    [...new Set(tareas.map(t => t.asignadoA).filter(Boolean) as string[])].sort(),
    [tareas])

  const filtered = useMemo(() => {
    return tareas.filter(t => {
      if (filtroResponsable && t.asignadoA !== filtroResponsable) return false
      if (filtroGrupo && t.parentId !== filtroGrupo && t.id !== filtroGrupo) return false
      if (soloHitos && t.tipo !== 'hito') return false
      return true
    })
  }, [tareas, filtroResponsable, filtroGrupo, soloHitos])

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
          <button onClick={() => setShowEmailModal(true)}
            className="flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl transition-colors">
            <Mail size={14} /> Email semanal
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'resumen'
          ? <ResumenEjecutivo tareas={filtered} allTareas={tareas} proyectoNombre={proyectoNombre} />
          : <VistaSemanal tareas={filtered} allTareas={tareas} />
        }
      </div>

      {showEmailModal && (
        <EmailModal tareas={tareas} onClose={() => setShowEmailModal(false)} />
      )}
    </div>
  )
}

// ─── Resumen ejecutivo ────────────────────────────────────────────────────────

function ResumenEjecutivo({ tareas, allTareas, proyectoNombre }: { tareas: Tarea[]; allTareas: Tarea[]; proyectoNombre?: string }) {
  const nonGrupo = tareas.filter(t => t.tipo !== 'grupo')
  const total = nonGrupo.length
  const completadas = nonGrupo.filter(t => t.estado === 'completada').length
  const enProceso   = nonGrupo.filter(t => t.estado === 'en_progreso').length
  const pendientes  = nonGrupo.filter(t => t.estado === 'pendiente').length
  const bloqueadas  = nonGrupo.filter(t => t.estado === 'bloqueada').length
  const globalPct   = total > 0 ? Math.round(nonGrupo.reduce((s, t) => s + (t.progreso ?? 0), 0) / total) : 0

  const grupos = allTareas.filter(t => t.tipo === 'grupo')
  const hitos  = tareas.filter(t => t.tipo === 'hito').sort((a, b) =>
    (a.fechaFin?.seconds ?? 0) - (b.fechaFin?.seconds ?? 0))

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {/* Stats cards */}
      <div>
        {proyectoNombre && <h2 className="text-lg font-bold text-slate-800 mb-4">{proyectoNombre}</h2>}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total tareas"  value={total}        valueClass="text-slate-700" />
          <StatCard label="Completadas"   value={completadas}  valueClass="text-emerald-600" />
          <StatCard label="En curso"      value={enProceso}    valueClass="text-blue-600" />
          <StatCard label="Pendientes"    value={pendientes}   valueClass="text-slate-500" />
          <StatCard label="Bloqueadas"    value={bloqueadas}   valueClass="text-red-600" />
          <StatCard label="Avance global" value={`${globalPct}%`} valueClass="text-indigo-600" />
        </div>
      </div>

      {/* Progress per grupo */}
      {grupos.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Avance por grupo / fase</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {grupos.map(g => (
              <div key={g.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-700 mb-2 truncate">▶ {g.titulo}</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${g.progreso ?? 0}%` }} />
                  </div>
                  <span className="text-sm font-bold text-indigo-600 w-10 text-right">{g.progreso ?? 0}%</span>
                </div>
                <p className={cn('text-xs mt-1.5 font-medium', ESTADO_COLORS[g.estado].text)}>
                  {ESTADO_LABELS[g.estado]}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

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
    </div>
  )
}

function StatCard({ label, value, valueClass }: { label: string; value: string | number; valueClass: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-4 text-center">
      <p className={cn('text-2xl font-bold', valueClass)}>{value}</p>
      <p className="text-xs text-slate-500 mt-1 leading-tight">{label}</p>
    </div>
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
      {weekMap.map(week => (
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
          <table className="w-full text-sm min-w-[700px] overflow-x-auto">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Semana', 'Período', 'Grupo / Fase', 'Tarea', 'Responsable', 'Estado', '% Avance'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {week.tasks
                .sort((a, b) => {
                  const pa = a.parentId ?? ''
                  const pb = b.parentId ?? ''
                  if (pa !== pb) return pa.localeCompare(pb)
                  return (a.fechaInicio?.seconds ?? 0) - (b.fechaInicio?.seconds ?? 0)
                })
                .map(t => {
                  const grupoNombre = t.parentId ? (grupoMap.get(t.parentId) ?? '') : ''
                  const ec = ESTADO_COLORS[t.estado]
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 text-xs font-semibold text-slate-600">{week.label}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                        {formatFecha(t.fechaInicio, 'dd/MM')} – {formatFecha(t.fechaFin, 'dd/MM')}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[120px] truncate">{grupoNombre || '—'}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800 max-w-[200px]">
                        {t.parentId && <span className="text-slate-400 mr-1">└</span>}
                        <span className="truncate inline-block max-w-full">{t.titulo}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{t.asignadoA ?? '—'}</td>
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
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ─── Email preview modal ──────────────────────────────────────────────────────

function EmailModal({ tareas, onClose }: { tareas: Tarea[]; onClose: () => void }) {
  const emails = useMemo(() => generarEmailsResumen(tareas), [tareas])
  const [selected, setSelected] = useState(emails[0]?.responsable ?? '')
  const [copied, setCopied] = useState(false)

  const current = emails.find(e => e.responsable === selected)

  const copy = async () => {
    if (!current) return
    await navigator.clipboard.writeText(current.body)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openMailto = () => {
    if (!current) return
    const subject = encodeURIComponent(`Resumen semanal — ${current.responsable}`)
    const body = encodeURIComponent(current.body)
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
            <p className="text-xs text-slate-500 mt-0.5">Preview del resumen por responsable</p>
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

            {/* Email body preview */}
            <div className="flex-1 overflow-auto p-5">
              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-200">
                {current?.body ?? ''}
              </pre>
            </div>

            {/* Actions */}
            <div className="px-5 py-4 border-t border-slate-200 flex items-center gap-3 flex-shrink-0 bg-slate-50">
              <button onClick={copy}
                className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-xl transition-colors">
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                {copied ? 'Copiado' : 'Copiar'}
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
