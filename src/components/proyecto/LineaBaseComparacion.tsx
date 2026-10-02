import { useEffect, useMemo, useState } from 'react'
import { differenceInCalendarDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { GitCompare } from 'lucide-react'
import { suscribirLineasBase } from '@/lib/firestore'
import { compararFases } from '@/lib/hierarchyUtils'
import { cn, formatFecha, tsToDate } from '@/lib/utils'
import type { LineaBase, Tarea } from '@/types'

interface Props {
  proyectoId: string
  tareas: Tarea[]   // todas las tareas del proyecto (enriquecidas)
}

const fmtD = (d: Date | null) => d ? format(d, 'dd MMM yyyy', { locale: es }) : '—'
const fmtDias = (d: number) => d === 0 ? 'A tiempo' : d > 0 ? `+${d} día${d === 1 ? '' : 's'}` : `${d} día${d === -1 ? '' : 's'}`
const colorDias = (d: number) => d > 3 ? 'text-red-600' : d > 0 ? 'text-amber-600' : 'text-emerald-600'

/** Días que se ha corrido el proyecto, cada fase y cada tarea frente a una línea base. */
export function LineaBaseComparacion({ proyectoId, tareas }: Props) {
  const [lineas, setLineas] = useState<LineaBase[]>([])
  const [seleccion, setSeleccion] = useState('')

  useEffect(() => suscribirLineasBase(proyectoId, setLineas), [proyectoId])
  const lb = lineas.find(l => l.id === seleccion) ?? lineas[0]

  const comp = useMemo(() => {
    if (!lb) return null
    const porId = new Map(tareas.map(t => [t.id, t]))
    const faseDe = (t: Tarea): string => {
      let cur: Tarea | undefined = t
      for (let i = 0; cur && i < 50; i++) {
        if (cur.fase?.trim()) return cur.fase.trim()
        cur = cur.parentId ? porId.get(cur.parentId) : undefined
      }
      return ''
    }
    const base = new Map(lb.tareas.filter(s => s.tipo !== 'grupo').map(s => [s.tareaId, s]))
    const hojas = tareas.filter(t => t.tipo !== 'grupo')

    const filas = hojas.filter(t => base.has(t.id)).map(t => {
      const b = base.get(t.id)!
      return { t, fase: faseDe(t) || b.fase || '', finBase: tsToDate(b.fechaFin), finActual: tsToDate(t.fechaFin),
        desvio: differenceInCalendarDays(tsToDate(t.fechaFin), tsToDate(b.fechaFin)) }
    })
    const maxFecha = (ds: Date[]) => ds.length ? new Date(Math.max(...ds.map(d => d.getTime()))) : null

    const finBaseProyecto = maxFecha([...base.values()].map(s => tsToDate(s.fechaFin)))
    const finActualProyecto = maxFecha(hojas.map(t => tsToDate(t.fechaFin)))
    const desvioProyecto = finBaseProyecto && finActualProyecto ? differenceInCalendarDays(finActualProyecto, finBaseProyecto) : 0

    const porFase = new Map<string, typeof filas>()
    filas.forEach(f => { if (!f.fase) return; if (!porFase.has(f.fase)) porFase.set(f.fase, []); porFase.get(f.fase)!.push(f) })
    const fases = [...porFase.entries()].map(([nombre, fs]) => {
      const fb = maxFecha(fs.map(f => f.finBase))!, fa = maxFecha(fs.map(f => f.finActual))!
      return { nombre, orden: Math.min(...fs.map(f => f.t.orden ?? Infinity)), finBase: fb, finActual: fa,
        desvio: differenceInCalendarDays(fa, fb), corridas: fs.filter(f => f.desvio > 0).length, total: fs.length }
    }).sort(compararFases)

    return {
      desvioProyecto, finBaseProyecto, finActualProyecto, fases,
      top: filas.filter(f => f.desvio > 0).sort((a, b) => b.desvio - a.desvio).slice(0, 5),
      corridas: filas.filter(f => f.desvio > 0).length,
      nuevas: hojas.filter(t => !base.has(t.id)).length,
      eliminadas: [...base.keys()].filter(id => !porId.has(id)).length,
    }
  }, [lb, tareas])

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
          <GitCompare size={14} /> Comparación con línea base
        </h3>
        {lineas.length > 1 && (
          <select value={lb?.id ?? ''} onChange={e => setSeleccion(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 bg-white">
            {lineas.map(l => <option key={l.id} value={l.id}>{l.nombre} · {formatFecha(l.creadoEn)}</option>)}
          </select>
        )}
      </div>

      {!lb || !comp ? (
        <p className="text-sm text-slate-400 bg-white rounded-xl border border-dashed border-slate-200 p-4 text-center">
          Aún no hay líneas base. Créala en <b>Herramientas → Líneas base</b> cuando el plan esté aprobado para medir cuánto se corre.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Fin del proyecto</p>
              <p className={cn('text-xl font-bold', colorDias(comp.desvioProyecto))}>{fmtDias(comp.desvioProyecto)}</p>
              <p className="text-[11px] text-slate-400">{fmtD(comp.finBaseProyecto)} → {fmtD(comp.finActualProyecto)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Tareas corridas</p>
              <p className="text-xl font-bold text-slate-800">{comp.corridas}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Tareas nuevas</p>
              <p className="text-xl font-bold text-slate-800">{comp.nuevas}</p>
              <p className="text-[11px] text-slate-400">no estaban en la línea base</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Tareas eliminadas</p>
              <p className="text-xl font-bold text-slate-800">{comp.eliminadas}</p>
            </div>
          </div>

          {comp.fases.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>{['Fase', 'Fin planeado', 'Fin actual', 'Desvío', 'Tareas corridas'].map(h =>
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {comp.fases.map(f => (
                    <tr key={f.nombre}>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{f.nombre}</td>
                      <td className="px-4 py-2.5 text-slate-500">{fmtD(f.finBase)}</td>
                      <td className="px-4 py-2.5 text-slate-500">{fmtD(f.finActual)}</td>
                      <td className={cn('px-4 py-2.5 font-semibold', colorDias(f.desvio))}>{fmtDias(f.desvio)}</td>
                      <td className="px-4 py-2.5 text-slate-500">{f.corridas}/{f.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {comp.top.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Las que más se han corrido</p>
              <ul className="space-y-1.5">
                {comp.top.map(f => (
                  <li key={f.t.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-700 truncate">{f.t.titulo}</span>
                    <span className={cn('font-semibold flex-shrink-0', colorDias(f.desvio))}>{fmtDias(f.desvio)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-slate-400">Línea base "{lb.nombre}" del {formatFecha(lb.creadoEn)}{lb.motivo ? ` · ${lb.motivo}` : ''}</p>
        </div>
      )}
    </div>
  )
}
