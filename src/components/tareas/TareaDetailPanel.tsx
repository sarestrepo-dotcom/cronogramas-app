import { useState, useEffect, useRef } from 'react'
import { X, Pencil, Trash2, Calendar, Link, CheckCircle2, Circle, Clock, Flag, ExternalLink, Send, History, MessageSquare } from 'lucide-react'
import { cn, formatFecha, ESTADO_COLORS, ESTADO_LABELS, PRIORIDAD_COLORS, diasRestantes, isVencida } from '@/lib/utils'
import { agregarComentario, eliminarComentario, suscribirComentarios, suscribirHistorial } from '@/lib/firestore'
import { useAuth } from '@/hooks/useAuth'
import type { Tarea, EstadoTarea, Comentario, CambioHistorial } from '@/types'

const TIPO_CONFIG = {
  tarea:  { icon: '—', label: 'Tarea',  cls: 'bg-slate-100 text-slate-600'  },
  hito:   { icon: '◆', label: 'Hito',   cls: 'bg-rose-100 text-rose-700'    },
  grupo:  { icon: '▶', label: 'Grupo',  cls: 'bg-indigo-100 text-indigo-700' },
}

const PRIORIDAD_LABELS = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' }
const PRIORIDAD_FLAG = { baja: 'text-slate-400', media: 'text-yellow-500', alta: 'text-orange-500', critica: 'text-red-600' }

const CAMPO_LABELS: Record<string, string> = {
  estado: 'Estado',
  progreso: 'Progreso',
  fechaInicio: 'Fecha inicio',
  fechaFin: 'Fecha fin',
  asignadosA: 'Responsables',
  titulo: 'Título',
  prioridad: 'Prioridad',
}

type Tab = 'detalle' | 'comentarios' | 'historial'

interface TareaDetailPanelProps {
  tarea: Tarea
  tareas: Tarea[]
  onClose: () => void
  onEdit: (tarea: Tarea) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, estado: EstadoTarea) => void
}

export function TareaDetailPanel({ tarea, tareas, onClose, onEdit, onDelete, onStatusChange }: TareaDetailPanelProps) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('detalle')
  const [showEstados, setShowEstados] = useState(false)
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [historial, setHistorial] = useState<CambioHistorial[]>([])
  const [nuevoComentario, setNuevoComentario] = useState('')
  const [sendingComentario, setSendingComentario] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const tipo = tarea.tipo ?? 'tarea'
  const tipoConfig = TIPO_CONFIG[tipo]
  const estadoColor = ESTADO_COLORS[tarea.estado]
  const prioridadColor = PRIORIDAD_COLORS[tarea.prioridad]
  const vencida = isVencida(tarea.fechaFin)
  const diasLeft = diasRestantes(tarea.fechaFin)
  const dependencias = tareas.filter((t) => tarea.dependencias?.includes(t.id))
  const dependientes = tareas.filter((t) => t.dependencias?.includes(tarea.id))

  useEffect(() => {
    const unsub1 = suscribirComentarios(tarea.id, setComentarios)
    const unsub2 = suscribirHistorial(tarea.id, setHistorial)
    return () => { unsub1(); unsub2() }
  }, [tarea.id])

  useEffect(() => {
    if (activeTab === 'comentarios') {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }, [comentarios, activeTab])

  const handleEnviarComentario = async () => {
    const texto = nuevoComentario.trim()
    if (!texto || !user) return
    setSendingComentario(true)
    try {
      await agregarComentario({
        tareaId: tarea.id,
        proyectoId: tarea.proyectoId,
        texto,
        autorId: user.uid,
        autorNombre: user.displayName ?? user.email ?? 'Usuario',
      })
      setNuevoComentario('')
    } finally {
      setSendingComentario(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20" onClick={onClose} />
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

        {/* Tabs */}
        <div className="flex border-b border-slate-200 flex-shrink-0">
          {([
            ['detalle',     'Detalle',     null],
            ['comentarios', 'Comentarios', comentarios.length],
            ['historial',   'Historial',   historial.length],
          ] as [Tab, string, number | null][]).map(([tab, label, count]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2',
                activeTab === tab
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}>
              {tab === 'comentarios' ? <MessageSquare size={12} /> : tab === 'historial' ? <History size={12} /> : null}
              {label}
              {count !== null && count > 0 && (
                <span className="bg-slate-100 text-slate-500 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'detalle' && (
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

            {/* Responsable(s) */}
            {(tarea.asignadosA?.length ? tarea.asignadosA : (tarea.asignadoA ? [tarea.asignadoA] : [])).length > 0 && (
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Responsable{(tarea.asignadosA?.length ?? 0) > 1 ? 's' : ''}</p>
                <div className="space-y-2">
                  {(tarea.asignadosA?.length ? tarea.asignadosA : (tarea.asignadoA ? [tarea.asignadoA] : [])).map((r, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                        {r.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
                      </div>
                      <span className="text-sm text-slate-700 font-medium">{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tarea.descripcion && (
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Descripción</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{tarea.descripcion}</p>
              </div>
            )}

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

            {tarea.notas && (
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Notas / IA</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{tarea.notas}</p>
              </div>
            )}

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

            {!tarea.descripcion && !(tarea.asignadosA?.length ?? tarea.asignadoA) && dependencias.length === 0 && (tarea.links ?? []).length === 0 && (
              <div className="px-5 py-6 text-center text-slate-400 text-sm">
                <Circle size={24} className="mx-auto mb-2 opacity-30" />
                Agrega descripción, responsable o dependencias editando la tarea.
              </div>
            )}
          </div>
        )}

        {activeTab === 'comentarios' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {comentarios.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <MessageSquare size={28} className="text-slate-200 mb-2" />
                  <p className="text-sm text-slate-400">Sin comentarios aún</p>
                  <p className="text-xs text-slate-300 mt-1">Sé el primero en comentar</p>
                </div>
              )}
              {comentarios.map((c) => (
                <div key={c.id} className="group">
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0 mt-0.5">
                      {c.autorNombre.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-slate-700">{c.autorNombre.split(' ')[0]}</span>
                        <span className="text-xs text-slate-400">
                          {c.creadoEn ? formatFecha(c.creadoEn, 'dd MMM · HH:mm') : ''}
                        </span>
                        {user?.uid === c.autorId && (
                          <button onClick={() => eliminarComentario(c.id)}
                            className="opacity-0 group-hover:opacity-100 ml-auto text-slate-300 hover:text-red-400 transition-all">
                            <X size={11} />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 rounded-xl px-3 py-2">
                        {c.texto}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="px-4 py-3 border-t border-slate-200 flex-shrink-0">
              <div className="flex gap-2 items-end">
                <textarea
                  className="input-base flex-1 resize-none text-sm min-h-[40px] max-h-28"
                  rows={1}
                  placeholder="Escribe un comentario..."
                  value={nuevoComentario}
                  onChange={(e) => setNuevoComentario(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleEnviarComentario()
                    }
                  }}
                />
                <button
                  onClick={handleEnviarComentario}
                  disabled={!nuevoComentario.trim() || sendingComentario}
                  className="flex-shrink-0 p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl transition-colors"
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'historial' && (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {historial.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <History size={28} className="text-slate-200 mb-2" />
                <p className="text-sm text-slate-400">Sin cambios registrados</p>
                <p className="text-xs text-slate-300 mt-1">Los cambios de estado y fechas se registran aquí</p>
              </div>
            )}
            <div className="space-y-3">
              {historial.map((c) => (
                <div key={c.id} className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-300 flex-shrink-0 mt-2" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">{c.cambiadoPorNombre.split(' ')[0]}</span>
                      {' cambió '}
                      <span className="font-medium text-slate-600">{CAMPO_LABELS[c.campo] ?? c.campo}</span>
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                      <span className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded line-through">{c.valorAnterior || '—'}</span>
                      <span className="text-slate-400">→</span>
                      <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">{c.valorNuevo || '—'}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {c.cambiadoEn ? formatFecha(c.cambiadoEn, 'dd MMM yyyy · HH:mm') : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200 flex items-center gap-3 flex-shrink-0 bg-slate-50">
          <button onClick={() => onEdit(tarea)}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
            <Pencil size={14} /> Editar tarea
          </button>
          <button
            onClick={() => { if (confirm('¿Eliminar esta tarea?')) { onDelete(tarea.id); onClose() } }}
            className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-slate-200">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </>
  )
}
