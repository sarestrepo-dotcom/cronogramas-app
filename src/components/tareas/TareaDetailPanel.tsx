import { useState } from 'react'
import { X, Pencil, Trash2, Calendar, Link, CheckCircle2, Circle, Clock, Flag, ExternalLink } from 'lucide-react'
import { cn, formatFecha, ESTADO_COLORS, ESTADO_LABELS, PRIORIDAD_COLORS, diasRestantes, isVencida } from '@/lib/utils'
import type { Tarea, EstadoTarea } from '@/types'

const TIPO_CONFIG = {
  tarea:  { icon: '—', label: 'Tarea',  cls: 'bg-slate-100 text-slate-600'  },
  hito:   { icon: '◆', label: 'Hito',   cls: 'bg-rose-100 text-rose-700'    },
  grupo:  { icon: '▶', label: 'Grupo',  cls: 'bg-indigo-100 text-indigo-700' },
}

const PRIORIDAD_LABELS = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' }
const PRIORIDAD_FLAG = { baja: 'text-slate-400', media: 'text-yellow-500', alta: 'text-orange-500', critica: 'text-red-600' }

interface TareaDetailPanelProps {
  tarea: Tarea
  tareas: Tarea[]
  onClose: () => void
  onEdit: (tarea: Tarea) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, estado: EstadoTarea) => void
}

export function TareaDetailPanel({ tarea, tareas, onClose, onEdit, onDelete, onStatusChange }: TareaDetailPanelProps) {
  const [showEstados, setShowEstados] = useState(false)
  const tipo = tarea.tipo ?? 'tarea'
  const tipoConfig = TIPO_CONFIG[tipo]
  const estadoColor = ESTADO_COLORS[tarea.estado]
  const prioridadColor = PRIORIDAD_COLORS[tarea.prioridad]
  const vencida = isVencida(tarea.fechaFin)
  const diasLeft = diasRestantes(tarea.fechaFin)
  const dependencias = tareas.filter((t) => tarea.dependencias?.includes(t.id))
  const dependientes = tareas.filter((t) => t.dependencias?.includes(tarea.id))

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-40 w-96 bg-white shadow-2xl flex flex-col border-l border-slate-200">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {tarea.fase && (
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5">
                  {tarea.fase}
                </span>
              )}
              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', tipoConfig.cls)}>
                {tipoConfig.icon} {tipoConfig.label}
              </span>
              <Flag size={12} className={PRIORIDAD_FLAG[tarea.prioridad]} />
              <span className={cn('text-xs font-medium', prioridadColor.text)}>{PRIORIDAD_LABELS[tarea.prioridad]}</span>
            </div>
            <h2 className="text-base font-semibold text-slate-900 leading-snug">{tarea.titulo}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {/* Status */}
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Estado</p>
            <div className="relative">
              <button
                onClick={() => setShowEstados(!showEstados)}
                className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors hover:opacity-90', estadoColor.bg, estadoColor.text, 'border-transparent')}
              >
                <span className={cn('w-2 h-2 rounded-full', estadoColor.dot)} />
                {ESTADO_LABELS[tarea.estado]}
                <span className="text-xs opacity-60">▾</span>
              </button>
              {showEstados && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowEstados(false)} />
                  <div className="absolute left-0 top-10 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-48">
                    {(['pendiente', 'en_progreso', 'completada', 'bloqueada'] as EstadoTarea[]).map((e) => (
                      <button key={e} onClick={() => { onStatusChange(tarea.id, e); setShowEstados(false) }}
                        className={cn('w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50', tarea.estado === e ? 'font-medium text-indigo-600' : 'text-slate-700')}>
                        <span className={cn('w-2 h-2 rounded-full', ESTADO_COLORS[e].dot)} />
                        {ESTADO_LABELS[e]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Fechas */}
          <div className="px-5 py-4 border-b border-slate-100 space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Fechas</p>
            <div className="flex items-center gap-3 text-sm">
              <Calendar size={14} className="text-slate-400 flex-shrink-0" />
              <div>
                {tipo === 'hito' ? (
                  <span className="text-slate-700 font-medium">{formatFecha(tarea.fechaFin)}</span>
                ) : (
                  <span className="text-slate-700">{formatFecha(tarea.fechaInicio)} <span className="text-slate-400">→</span> {formatFecha(tarea.fechaFin)}</span>
                )}
              </div>
            </div>
            {tarea.estado !== 'completada' && (
              <div className={cn('flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-1.5 w-fit',
                vencida ? 'bg-red-50 text-red-600' : diasLeft <= 2 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500')}>
                <Clock size={12} />
                {vencida ? `Vencida hace ${Math.abs(diasLeft)} día${Math.abs(diasLeft) !== 1 ? 's' : ''}` :
                 diasLeft === 0 ? 'Vence hoy' : `${diasLeft} día${diasLeft !== 1 ? 's' : ''} restantes`}
              </div>
            )}
          </div>

          {/* Progreso */}
          {tipo !== 'hito' && (
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Progreso</p>
                <span className="text-sm font-semibold text-slate-700">{tarea.progreso}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${tarea.progreso}%` }} />
              </div>
              {tarea.estado === 'completada' && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-600">
                  <CheckCircle2 size={13} /> Completada
                </div>
              )}
            </div>
          )}

          {/* Responsable */}
          {tarea.asignadoA && (
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Responsable</p>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                  {tarea.asignadoA.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
                </div>
                <span className="text-sm text-slate-700 font-medium">{tarea.asignadoA}</span>
              </div>
            </div>
          )}

          {/* Descripción */}
          {tarea.descripcion && (
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Descripción</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{tarea.descripcion}</p>
            </div>
          )}

          {/* Dependencias (tareas que esta tarea requiere) */}
          {dependencias.length > 0 && (
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Link size={11} /> Depende de
              </p>
              <div className="space-y-1.5">
                {dependencias.map((dep) => (
                  <div key={dep.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="text-slate-400 text-xs">{dep.tipo === 'hito' ? '◆' : dep.tipo === 'grupo' ? '▶' : '—'}</span>
                    {dep.titulo}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tareas que dependen de esta */}
          {dependientes.length > 0 && (
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Requerida por</p>
              <div className="space-y-1.5">
                {dependientes.map((dep) => (
                  <div key={dep.id} className="flex items-center gap-2 text-sm text-slate-500">
                    <span className="text-slate-300 text-xs">—</span>
                    {dep.titulo}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notas internas */}
          {tarea.notas && (
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Notas / IA</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{tarea.notas}</p>
            </div>
          )}

          {/* Links y entregables */}
          {(tarea.links ?? []).length > 0 && (
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <ExternalLink size={11} /> Links y entregables
              </p>
              <div className="space-y-1.5">
                {(tarea.links ?? []).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 hover:underline truncate">
                    <Link size={11} className="flex-shrink-0" />
                    <span className="truncate">{url}</span>
                    <ExternalLink size={10} className="flex-shrink-0 opacity-50" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Sin descripción ni responsable */}
          {!tarea.descripcion && !tarea.asignadoA && dependencias.length === 0 && (tarea.links ?? []).length === 0 && (
            <div className="px-5 py-6 text-center text-slate-400 text-sm">
              <Circle size={24} className="mx-auto mb-2 opacity-30" />
              Agrega descripción, responsable o dependencias editando la tarea.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200 flex items-center gap-3 flex-shrink-0 bg-slate-50">
          <button
            onClick={() => onEdit(tarea)}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
          >
            <Pencil size={14} /> Editar tarea
          </button>
          <button
            onClick={() => { if (confirm('¿Eliminar esta tarea?')) { onDelete(tarea.id); onClose() } }}
            className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-slate-200"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </>
  )
}
