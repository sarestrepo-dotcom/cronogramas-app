import { useState, useEffect } from 'react'
import { X, Save, Trash2, AlertTriangle, CheckCircle2, Plus } from 'lucide-react'
import { guardarLineaBase, suscribirLineasBase, eliminarLineaBase } from '@/lib/firestore'
import { formatFecha, cn } from '@/lib/utils'
import type { LineaBase, Tarea, TareaSnapshot } from '@/types'

function diffDias(lbSeconds: number, actualSeconds: number): number {
  return Math.round((actualSeconds - lbSeconds) / 86400)
}

function BadgeDiff({ dias }: { dias: number }) {
  if (dias === 0) return <span className="text-xs text-emerald-600 font-medium">Sin cambio</span>
  const abs = Math.abs(dias)
  const cls =
    dias > 0
      ? abs <= 3 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
      : 'bg-blue-50 text-blue-600'
  return (
    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', cls)}>
      {dias > 0 ? `+${dias}d` : `${dias}d`}
    </span>
  )
}

export function LineasBaseModal({
  proyectoId,
  uid,
  tareas,
  onClose,
}: {
  proyectoId: string
  uid: string
  tareas: Tarea[]
  onClose: () => void
}) {
  const [lineasBase, setLineasBase] = useState<LineaBase[]>([])
  const [selectedLB, setSelectedLB] = useState<LineaBase | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [nombre, setNombre] = useState('')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    return suscribirLineasBase(proyectoId, (lbs) => {
      setLineasBase(lbs)
      if (lbs.length === 0) setShowForm(true)
    })
  }, [proyectoId])

  const tareasParaSnapshot = tareas.filter((t) => t.tipo !== 'grupo')

  const handleGuardar = async () => {
    if (!nombre.trim()) return
    setSaving(true)
    try {
      const snapshot: TareaSnapshot[] = tareasParaSnapshot.map((t) => ({
        tareaId: t.id,
        titulo: t.titulo,
        tipo: t.tipo,
        fase: t.fase,
        parentId: t.parentId,
        fechaInicio: t.fechaInicio,
        fechaFin: t.fechaFin,
        estado: t.estado,
        progreso: t.progreso,
        asignadosA: t.asignadosA?.length ? t.asignadosA : t.asignadoA ? [t.asignadoA] : [],
      }))
      await guardarLineaBase({ proyectoId, nombre: nombre.trim(), motivo: motivo.trim(), creadoPor: uid, tareas: snapshot })
      setNombre('')
      setMotivo('')
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  const comparacion = selectedLB
    ? (() => {
        const tareaMap = new Map(tareas.map((t) => [t.id, t]))
        return selectedLB.tareas.map((snap) => {
          const actual = tareaMap.get(snap.tareaId)
          return {
            snap,
            actual,
            diffInicio: actual ? diffDias(snap.fechaInicio.seconds, actual.fechaInicio.seconds) : null,
            diffFin: actual ? diffDias(snap.fechaFin.seconds, actual.fechaFin.seconds) : null,
          }
        })
      })()
    : []

  const retrasos = comparacion.filter((r) => (r.diffFin ?? 0) > 0).length
  const adelantos = comparacion.filter((r) => (r.diffFin ?? 0) < 0).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-5xl flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Líneas Base</h2>
            <p className="text-xs text-slate-500">Versiones del cronograma para evidenciar desviaciones</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 border-r border-slate-200 flex flex-col flex-shrink-0">
            <div className="p-3 border-b border-slate-100">
              <button
                onClick={() => { setShowForm(true); setSelectedLB(null) }}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-xl transition-colors"
              >
                <Plus size={14} /> Nueva línea base
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {lineasBase.length === 0 && !showForm && (
                <p className="text-xs text-slate-400 text-center py-8">Sin líneas base guardadas</p>
              )}
              {lineasBase.map((lb) => (
                <button
                  key={lb.id}
                  onClick={() => { setSelectedLB(lb); setShowForm(false) }}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors',
                    selectedLB?.id === lb.id
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                  )}
                >
                  <p className="font-medium truncate">{lb.nombre}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {lb.creadoEn ? formatFecha(lb.creadoEn) : '—'} · {lb.tareas.length} tareas
                  </p>
                  {lb.motivo && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate italic">"{lb.motivo}"</p>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Main panel */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {showForm ? (
              <div className="p-6 space-y-5 overflow-y-auto">
                <div>
                  <h3 className="font-semibold text-slate-900">Guardar nueva línea base</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Se guardará una foto con las fechas actuales de <strong>{tareasParaSnapshot.length} tareas</strong>.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Nombre</label>
                  <input
                    className="input-base w-full"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej: LB1 – Acuerdo inicial cliente"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleGuardar() }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Motivo / contexto (opcional)</label>
                  <textarea
                    className="input-base w-full resize-none"
                    rows={3}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ej: Cronograma aprobado en reunión del 15/01 con el cliente..."
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleGuardar}
                    disabled={!nombre.trim() || saving}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Save size={14} /> {saving ? 'Guardando...' : 'Guardar línea base'}
                  </button>
                  {lineasBase.length > 0 && (
                    <button onClick={() => setShowForm(false)} className="btn-secondary">
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            ) : selectedLB ? (
              <div className="flex flex-col h-full overflow-hidden">
                {/* Comparison header */}
                <div className="px-6 py-4 border-b border-slate-100 flex-shrink-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900">{selectedLB.nombre}</h3>
                      {selectedLB.motivo && (
                        <p className="text-sm text-slate-500 mt-0.5 italic">"{selectedLB.motivo}"</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="text-xs text-slate-400">
                          Guardada el {selectedLB.creadoEn ? formatFecha(selectedLB.creadoEn) : '—'}
                        </span>
                        {retrasos > 0 && (
                          <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full font-medium">
                            <AlertTriangle size={11} /> {retrasos} tarea{retrasos !== 1 ? 's' : ''} con retraso
                          </span>
                        )}
                        {adelantos > 0 && (
                          <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
                            ↑ {adelantos} adelantada{adelantos !== 1 ? 's' : ''}
                          </span>
                        )}
                        {retrasos === 0 && adelantos === 0 && (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                            <CheckCircle2 size={11} /> Sin desviaciones
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        if (confirm(`¿Eliminar la línea base "${selectedLB.nombre}"?`)) {
                          await eliminarLineaBase(selectedLB.id)
                          setSelectedLB(null)
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                      title="Eliminar línea base"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Comparison table */}
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tarea</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fase</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">LB inicio</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actual inicio</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">LB fin</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actual fin</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Desviación</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {comparacion.map(({ snap, actual, diffInicio, diffFin }) => {
                        const rowColor =
                          !actual ? 'opacity-40' :
                          (diffFin ?? 0) > 7 ? 'bg-red-50/50' :
                          (diffFin ?? 0) > 0 ? 'bg-amber-50/50' :
                          (diffFin ?? 0) < 0 ? 'bg-blue-50/30' : ''
                        return (
                          <tr key={snap.tareaId} className={cn('hover:bg-slate-50 transition-colors', rowColor)}>
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-slate-800 truncate max-w-[200px]" title={snap.titulo}>
                                {snap.titulo}
                              </p>
                              {!actual && <p className="text-xs text-slate-400 italic">eliminada del cronograma</p>}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-xs text-slate-500">{snap.fase ?? '—'}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className="text-xs text-slate-500">{formatFecha(snap.fechaInicio)}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {actual ? (
                                <span className={cn('text-xs', (diffInicio ?? 0) !== 0 ? 'font-semibold text-slate-800' : 'text-slate-500')}>
                                  {formatFecha(actual.fechaInicio)}
                                </span>
                              ) : <span className="text-xs text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className="text-xs text-slate-500">{formatFecha(snap.fechaFin)}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {actual ? (
                                <span className={cn('text-xs', (diffFin ?? 0) !== 0 ? 'font-semibold text-slate-800' : 'text-slate-500')}>
                                  {formatFecha(actual.fechaFin)}
                                </span>
                              ) : <span className="text-xs text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {diffFin !== null ? (
                                <BadgeDiff dias={diffFin} />
                              ) : (
                                <span className="text-xs text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {actual ? (
                                <span className={cn(
                                  'text-xs font-medium px-2 py-0.5 rounded-full',
                                  actual.estado === 'completada' ? 'bg-emerald-50 text-emerald-600' :
                                  actual.estado === 'en_progreso' ? 'bg-blue-50 text-blue-600' :
                                  actual.estado === 'bloqueada' ? 'bg-red-50 text-red-600' :
                                  'bg-slate-100 text-slate-500'
                                )}>
                                  {actual.estado === 'completada' ? 'Completada' :
                                   actual.estado === 'en_progreso' ? 'En progreso' :
                                   actual.estado === 'bloqueada' ? 'Bloqueada' : 'Pendiente'}
                                </span>
                              ) : <span className="text-xs text-slate-300">—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-3">
                  <Save size={22} className="text-indigo-400" />
                </div>
                <p className="text-sm font-medium text-slate-600">Selecciona una línea base</p>
                <p className="text-xs text-slate-400 mt-1">O guarda una nueva para empezar a comparar</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
