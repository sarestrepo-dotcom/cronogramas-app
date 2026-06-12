import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { cn, formatFecha, PRIORIDAD_COLORS } from '@/lib/utils'
import type { Tarea, EstadoTarea } from '@/types'

const COLS: { estado: EstadoTarea; label: string; dotCls: string; borderCls: string; bgCls: string }[] = [
  { estado: 'pendiente',   label: 'Pendiente',  dotCls: 'bg-slate-400',   borderCls: 'border-slate-200', bgCls: 'bg-slate-50'       },
  { estado: 'en_progreso', label: 'En proceso', dotCls: 'bg-blue-500',    borderCls: 'border-blue-200',  bgCls: 'bg-blue-50/50'     },
  { estado: 'completada',  label: 'Completada', dotCls: 'bg-emerald-500', borderCls: 'border-emerald-200', bgCls: 'bg-emerald-50/50' },
  { estado: 'bloqueada',   label: 'Bloqueada',  dotCls: 'bg-red-500',     borderCls: 'border-red-200',   bgCls: 'bg-red-50/40'      },
]

const PRIORIDAD_LABELS = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' }

export function KanbanView({ tareas, onStatusChange, onRowClick }: {
  tareas: Tarea[]
  onStatusChange: (id: string, estado: EstadoTarea) => Promise<void>
  onRowClick: (t: Tarea) => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [hoverCol, setHoverCol] = useState<EstadoTarea | null>(null)

  const cards = tareas.filter(t => t.tipo !== 'grupo')
  const grupoMap = Object.fromEntries(tareas.filter(t => t.tipo === 'grupo').map(t => [t.id, t.titulo]))

  return (
    <div className="flex gap-4 p-6 overflow-x-auto min-h-0 h-full">
      {COLS.map(col => {
        const colCards = cards.filter(t => t.estado === col.estado)
        const isTarget = hoverCol === col.estado && draggingId != null

        return (
          <div
            key={col.estado}
            className={cn(
              'flex-shrink-0 w-72 flex flex-col rounded-2xl border-2 transition-all',
              isTarget ? 'border-indigo-400 shadow-lg shadow-indigo-100/50' : col.borderCls,
              col.bgCls,
            )}
            onDragOver={(e) => { e.preventDefault(); setHoverCol(col.estado) }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHoverCol(null) }}
            onDrop={async () => {
              setHoverCol(null)
              if (draggingId) {
                const card = cards.find(t => t.id === draggingId)
                if (card && card.estado !== col.estado) await onStatusChange(draggingId, col.estado)
              }
              setDraggingId(null)
            }}
          >
            {/* Column header */}
            <div className="px-4 py-3 flex items-center gap-2 border-b border-slate-200/70">
              <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', col.dotCls)} />
              <span className="text-sm font-semibold text-slate-700 flex-1">{col.label}</span>
              <span className="text-xs bg-white/80 border border-slate-200 rounded-full px-2 py-0.5 font-medium text-slate-500">
                {colCards.length}
              </span>
            </div>

            {/* Cards list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {colCards.map(tarea => (
                <KanbanCard
                  key={tarea.id}
                  tarea={tarea}
                  grupoNombre={tarea.parentId ? grupoMap[tarea.parentId] : undefined}
                  isDragging={draggingId === tarea.id}
                  onDragStart={() => setDraggingId(tarea.id)}
                  onDragEnd={() => setDraggingId(null)}
                  onClick={() => onRowClick(tarea)}
                />
              ))}

              <div className={cn(
                'rounded-xl border-2 border-dashed flex items-center justify-center text-sm transition-colors',
                isTarget ? 'h-14 border-indigo-400 bg-indigo-50 text-indigo-500' : 'h-10 border-transparent text-transparent',
              )}>
                {isTarget ? 'Soltar aquí' : ''}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function KanbanCard({ tarea, grupoNombre, isDragging, onDragStart, onDragEnd, onClick }: {
  tarea: Tarea
  grupoNombre?: string
  isDragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
}) {
  const pc = PRIORIDAD_COLORS[tarea.prioridad]

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl border border-slate-200 p-3 cursor-pointer select-none',
        'hover:border-indigo-300 hover:shadow-sm transition-all',
        isDragging && 'opacity-50 ring-2 ring-indigo-400 shadow-md',
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-400">{tarea.tipo === 'hito' ? '◆ Hito' : '— Tarea'}</span>
        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', pc.bg, pc.text)}>
          {PRIORIDAD_LABELS[tarea.prioridad]}
        </span>
      </div>

      {grupoNombre && (
        <p className="text-xs text-indigo-600 bg-indigo-50 rounded-md px-2 py-0.5 mb-2 truncate font-medium">
          ▶ {grupoNombre}
        </p>
      )}

      <p className={cn(
        'text-sm font-medium text-slate-800 leading-snug mb-2',
        tarea.estado === 'completada' && 'line-through text-slate-400',
      )}>
        {tarea.titulo}
      </p>

      {tarea.progreso > 0 && (
        <div className="mb-2.5">
          <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
            <span>Avance</span>
            <span>{tarea.progreso}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${tarea.progreso}%`, backgroundColor: tarea.progreso === 100 ? '#10b981' : '#6366f1' }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-slate-400 flex items-center gap-1">
          <Calendar size={10} />
          {formatFecha(tarea.fechaFin, 'dd MMM')}
        </span>
        {tarea.asignadoA && (
          <div
            className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-700"
            title={tarea.asignadoA}
          >
            {tarea.asignadoA.split(' ').slice(0, 2).map(n => n[0] ?? '').join('').toUpperCase()}
          </div>
        )}
      </div>
    </div>
  )
}
