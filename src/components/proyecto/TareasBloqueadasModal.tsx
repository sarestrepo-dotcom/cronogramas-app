import { useEffect, useState } from 'react'
import { X, Ban, Copy, Check, ArrowRight, StickyNote } from 'lucide-react'
import { cn, formatFecha, isVencida, diasRestantes, PRIORIDAD_COLORS, BLOQUEO_LABELS, BLOQUEO_COLORS } from '@/lib/utils'
import type { Tarea } from '@/types'

const PRIORIDAD_LABELS = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' }

interface Props {
  bloqueadas: Tarea[]
  allTareas: Tarea[]
  onClose: () => void
  onAbrirTarea?: (t: Tarea) => void
}

function responsablesDe(t: Tarea): string {
  const lista = t.asignadosA?.length ? t.asignadosA : t.asignadoA ? [t.asignadoA] : []
  return lista.join(', ')
}

export function TareasBloqueadasModal({ bloqueadas, allTareas, onClose, onAbrirTarea }: Props) {
  const [copiado, setCopiado] = useState(false)
  const [lado, setLado] = useState<'todos' | 'interno' | 'cliente' | 'sin'>('todos')
  const grupoDe = (t: Tarea) => allTareas.find(g => g.id === t.parentId && g.tipo === 'grupo')?.titulo ?? t.fase

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const conteo = {
    todos: bloqueadas.length,
    interno: bloqueadas.filter(t => t.bloqueo === 'interno').length,
    cliente: bloqueadas.filter(t => t.bloqueo === 'cliente').length,
    sin: bloqueadas.filter(t => !t.bloqueo).length,
  }
  const ordenadas = bloqueadas
    .filter(t => lado === 'todos' || (lado === 'sin' ? !t.bloqueo : t.bloqueo === lado))
    .sort((a, b) => (a.fechaFin?.seconds ?? 0) - (b.fechaFin?.seconds ?? 0))
  const sinMotivo = ordenadas.filter(t => !t.notas?.trim()).length

  const copiarResumen = async () => {
    const texto = [
      `Tareas bloqueadas (${ordenadas.length})`,
      '',
      ...ordenadas.flatMap(t => [
        `⛔ ${t.titulo}${grupoDe(t) ? ` — ${grupoDe(t)}` : ''}`,
        `   Bloqueo: ${t.bloqueo ? BLOQUEO_LABELS[t.bloqueo] : 'Sin clasificar'} · Responsable: ${responsablesDe(t) || 'Sin asignar'} · Entrega: ${formatFecha(t.fechaFin)}`,
        `   Motivo: ${t.notas?.trim() || 'Sin motivo registrado'}`,
        '',
      ]),
    ].join('\n')
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
              <Ban size={17} className="text-red-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Tareas bloqueadas ({ordenadas.length})</h2>
              <p className="text-xs text-slate-500">
                {sinMotivo > 0
                  ? `${sinMotivo} sin motivo registrado en Notas`
                  : 'Todas tienen el motivo registrado'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {ordenadas.length > 0 && (
              <button onClick={copiarResumen}
                className="flex items-center gap-1.5 text-xs border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg transition-colors">
                {copiado ? <><Check size={13} className="text-emerald-500" /> Copiado</> : <><Copy size={13} /> Copiar resumen</>}
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Interno / cliente */}
        <div className="px-6 pt-4 flex items-center gap-2 flex-wrap">
          {([['todos', 'Todos'], ['cliente', 'Del cliente'], ['interno', 'Internos'], ['sin', 'Sin clasificar']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setLado(v)}
              className={cn('px-3 py-1 rounded-lg text-xs font-medium transition-colors',
                lado === v ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {label} ({conteo[v]})
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="overflow-y-auto p-6 space-y-3">
          {ordenadas.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No hay tareas bloqueadas 🎉</p>
          ) : ordenadas.map(t => {
            const venc = isVencida(t.fechaFin)
            const dias = diasRestantes(t.fechaFin)
            const grupo = grupoDe(t)
            const pc = PRIORIDAD_COLORS[t.prioridad]
            return (
              <div key={t.id} className="border border-red-100 bg-red-50/30 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {grupo && <p className="text-[11px] text-slate-400 font-medium mb-0.5 truncate">▶ {grupo}</p>}
                    <p className="text-sm font-semibold text-slate-800">{t.tipo === 'hito' ? '◆ ' : ''}{t.titulo}</p>
                  </div>
                  {onAbrirTarea && (
                    <button onClick={() => onAbrirTarea(t)}
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium flex-shrink-0">
                      Abrir <ArrowRight size={12} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-2 text-xs text-slate-500">
                  {t.bloqueo
                    ? <span className={cn('px-1.5 py-0.5 rounded-md font-semibold', BLOQUEO_COLORS[t.bloqueo].bg, BLOQUEO_COLORS[t.bloqueo].text)}>Bloqueo {BLOQUEO_LABELS[t.bloqueo].toLowerCase()}</span>
                    : <span className="px-1.5 py-0.5 rounded-md font-medium bg-slate-100 text-slate-500">Sin clasificar</span>}
                  <span>👤 {responsablesDe(t) || 'Sin asignar'}</span>
                  <span className={cn(venc && 'text-red-600 font-semibold')}>
                    📅 {formatFecha(t.fechaFin)}{venc ? ` · ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'} de atraso` : ''}
                  </span>
                  {pc && (
                    <span className={cn('px-1.5 py-0.5 rounded-md font-medium', pc.bg, pc.text)}>
                      {PRIORIDAD_LABELS[t.prioridad]}
                    </span>
                  )}
                </div>

                <div className={cn('mt-3 rounded-lg px-3 py-2 text-sm flex gap-2',
                  t.notas?.trim() ? 'bg-white border border-slate-200 text-slate-700' : 'bg-amber-50 border border-amber-200 text-amber-700')}>
                  <StickyNote size={14} className="flex-shrink-0 mt-0.5 opacity-60" />
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {t.notas?.trim() || 'Sin motivo registrado. Abre la tarea y escribe en Notas por qué está bloqueada.'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
