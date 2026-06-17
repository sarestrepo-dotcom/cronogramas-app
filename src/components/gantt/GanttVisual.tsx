import { useState, useMemo, useRef, useEffect } from 'react'
import {
  differenceInDays, format, eachMonthOfInterval,
  getDaysInMonth, startOfMonth, endOfMonth, addDays, min, max,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { Link2, Link2Off, GripVertical, Image, FileSpreadsheet } from 'lucide-react'
import { cn, tsToDate } from '@/lib/utils'
import { enrichTareas } from '@/lib/hierarchyUtils'
import { exportGanttPNG, exportCSV } from '@/lib/exportUtils'
import type { Tarea } from '@/types'

// ─── Layout ───────────────────────────────────────────────────────────────────
const LEFT_W = 260
const ROW_H = 40
const HEADER_H = 52
const RESIZE_HANDLE_W = 10

// ─── Estado color palette ──────────────────────────────────────────────────────
// bar = solid estado color (progress fill + grupo border + hito fill)
// bg  = light estado color (bar background — unfilled portion)
const ESTADO_GANTT: Record<string, { bar: string; bg: string; border: string }> = {
  pendiente:   { bar: '#94a3b8', bg: '#e2e8f0', border: '#cbd5e1' },
  en_progreso: { bar: '#3b82f6', bg: '#bfdbfe', border: '#93c5fd' },
  completada:  { bar: '#10b981', bg: '#bbf7d0', border: '#6ee7b7' },
  bloqueada:   { bar: '#ef4444', bg: '#fecaca', border: '#fca5a5' },
}
const estadoColor = (estado: string) => ESTADO_GANTT[estado] ?? ESTADO_GANTT.pendiente

type ViewMode = 'semana' | 'mes'
const DAY_PX: Record<ViewMode, number> = { semana: 22, mes: 7 }

// ─── Drag-date state ──────────────────────────────────────────────────────────
interface DragState {
  tareaId: string
  type: 'move' | 'resize'
  startX: number
  origStart: Date
  origEnd: Date
  previewStart: Date
  previewEnd: Date
}

// ─── Display row ──────────────────────────────────────────────────────────────
type Row =
  | { kind: 'fase_header'; label: string }
  | { kind: 'tarea'; tarea: Tarea; nivel: number; barStart: Date; barEnd: Date }

function buildRows(tareas: Tarea[]): Row[] {
  const enriched = enrichTareas(tareas)
  const ids = new Set(enriched.map((t) => t.id))

  const roots = enriched
    .filter((t) => !t.parentId || !ids.has(t.parentId))
    .sort((a, b) => {
      const ag = a.tipo === 'grupo' ? 0 : 1
      const bg = b.tipo === 'grupo' ? 0 : 1
      if (ag !== bg) return ag - bg
      return (a.fechaInicio?.seconds ?? 0) - (b.fechaInicio?.seconds ?? 0)
    })

  const byFase = new Map<string, Tarea[]>()
  const noFase: Tarea[] = []
  for (const root of roots) {
    const fase = root.fase?.trim() ?? ''
    if (fase) {
      if (!byFase.has(fase)) byFase.set(fase, [])
      byFase.get(fase)!.push(root)
    } else {
      noFase.push(root)
    }
  }

  const rows: Row[] = []

  const pushRoot = (root: Tarea) => {
    const children = enriched
      .filter((t) => t.parentId === root.id)
      .sort((a, b) => (a.fechaInicio?.seconds ?? 0) - (b.fechaInicio?.seconds ?? 0))
    let barStart = tsToDate(root.fechaInicio)
    let barEnd = tsToDate(root.fechaFin)
    if ((root.tipo ?? 'tarea') === 'grupo' && children.length > 0) {
      barStart = min(children.map((c) => tsToDate(c.fechaInicio)))
      barEnd = max(children.map((c) => tsToDate(c.fechaFin)))
    }
    rows.push({ kind: 'tarea', tarea: root, nivel: 0, barStart, barEnd })
    for (const child of children) {
      rows.push({ kind: 'tarea', tarea: child, nivel: 1, barStart: tsToDate(child.fechaInicio), barEnd: tsToDate(child.fechaFin) })
    }
  }

  for (const [fase, faseRoots] of byFase) {
    rows.push({ kind: 'fase_header', label: fase })
    for (const root of faseRoots) pushRoot(root)
  }
  for (const root of noFase) pushRoot(root)

  return rows
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase()
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface GanttVisualProps {
  tareas: Tarea[]
  onUpdate?: (id: string, inicio: Date, fin: Date) => Promise<void>
  onTareaClick?: (tarea: Tarea) => void
  onReparent?: (taskId: string, newParentId: string | null) => Promise<void>
  onToggleDependency?: (taskId: string, depId: string) => Promise<void>
  rutaCritica?: Set<string>
}

export function GanttVisual({ tareas, onUpdate, onTareaClick, onReparent, onToggleDependency, rutaCritica }: GanttVisualProps) {
  const [mode, setMode] = useState<ViewMode>('semana')
  const [drag, setDrag] = useState<DragState | null>(null)
  const [linkMode, setLinkMode] = useState(false)
  const [linkSource, setLinkSource] = useState<string | null>(null)
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const ganttContainerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const dayPxRef = useRef(DAY_PX[mode])
  const onUpdateRef = useRef(onUpdate)
  useEffect(() => { dayPxRef.current = DAY_PX[mode] }, [mode])
  useEffect(() => { onUpdateRef.current = onUpdate }, [onUpdate])
  useEffect(() => { dragRef.current = drag }, [drag])

  // Cancel link mode on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setLinkMode(false); setLinkSource(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Window-level date-drag listeners
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      const px = dayPxRef.current
      const deltaDays = Math.round((e.clientX - d.startX) / px)
      let next: DragState
      if (d.type === 'move') {
        next = { ...d, previewStart: addDays(d.origStart, deltaDays), previewEnd: addDays(d.origEnd, deltaDays) }
      } else {
        const newEnd = addDays(d.origEnd, deltaDays)
        next = { ...d, previewEnd: newEnd >= d.origStart ? newEnd : d.origStart }
      }
      dragRef.current = next
      setDrag(next)
    }
    const handleUp = async () => {
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!d || !onUpdateRef.current) return
      if (d.previewStart.getTime() !== d.origStart.getTime() || d.previewEnd.getTime() !== d.origEnd.getTime()) {
        await onUpdateRef.current(d.tareaId, d.previewStart, d.previewEnd)
      }
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp) }
  }, [])

  const dayPx = DAY_PX[mode]
  const rows = useMemo(() => buildRows(tareas), [tareas])
  const rowById = useMemo(() => {
    const m = new Map<string, { row: Extract<Row, { kind: 'tarea' }>; idx: number }>()
    rows.forEach((r, i) => { if (r.kind === 'tarea') m.set(r.tarea.id, { row: r, idx: i }) })
    return m
  }, [rows])

  const { projectStart, projectEnd } = useMemo(() => {
    if (tareas.length === 0) {
      const s = startOfMonth(new Date())
      return { projectStart: s, projectEnd: endOfMonth(addDays(s, 89)) }
    }
    return {
      projectStart: startOfMonth(min(tareas.map((t) => tsToDate(t.fechaInicio)))),
      projectEnd: endOfMonth(max(tareas.map((t) => tsToDate(t.fechaFin)))),
    }
  }, [tareas])

  const totalDays = differenceInDays(projectEnd, projectStart) + 1
  const totalPx = totalDays * dayPx
  const todayPx = differenceInDays(new Date(), projectStart) * dayPx

  const months = useMemo(() =>
    eachMonthOfInterval({ start: projectStart, end: projectEnd }).map((m) => ({
      label: format(m, mode === 'semana' ? 'MMMM yyyy' : 'MMM yy', { locale: es }),
      x: differenceInDays(m, projectStart) * dayPx,
      w: getDaysInMonth(m) * dayPx,
    })),
    [projectStart, projectEnd, dayPx, mode]
  )

  const dx = (d: Date) => differenceInDays(d, projectStart) * dayPx

  const startDrag = (e: React.MouseEvent, tarea: Tarea, bStart: Date, bEnd: Date, type: 'move' | 'resize') => {
    if (!onUpdate || linkMode) return
    e.preventDefault(); e.stopPropagation()
    const state: DragState = { tareaId: tarea.id, type, startX: e.clientX, origStart: bStart, origEnd: bEnd, previewStart: bStart, previewEnd: bEnd }
    dragRef.current = state
    setDrag(state)
  }

  const handleBarClick = (e: React.MouseEvent, tarea: Tarea) => {
    e.stopPropagation()
    if (drag) return
    if (linkMode) {
      if (!linkSource) {
        setLinkSource(tarea.id)
      } else if (linkSource === tarea.id) {
        setLinkSource(null)
      } else {
        onToggleDependency?.(tarea.id, linkSource)
        setLinkSource(null)
      }
      return
    }
    onTareaClick?.(tarea)
  }

  // HTML5 row drag (reparent)
  const handleRowDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move'
    setDraggingRowId(id)
  }
  const handleRowDragEnd = () => { setDraggingRowId(null); setDropTargetId(null) }
  const handleGroupDragOver = (e: React.DragEvent, groupId: string) => {
    if (!draggingRowId || draggingRowId === groupId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetId(groupId)
  }
  const handleGroupDrop = (e: React.DragEvent, groupId: string) => {
    e.preventDefault()
    if (draggingRowId && draggingRowId !== groupId) {
      onReparent?.(draggingRowId, groupId)
    }
    setDraggingRowId(null); setDropTargetId(null)
  }
  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggingRowId) onReparent?.(draggingRowId, null)
    setDraggingRowId(null); setDropTargetId(null)
  }

  // Dependency arrows data
  const depArrows = useMemo(() => {
    const arrows: { x1: number; y1: number; x2: number; y2: number; key: string; critica: boolean }[] = []
    for (const { row, idx } of rowById.values()) {
      for (const depId of row.tarea.dependencias ?? []) {
        const dep = rowById.get(depId)
        if (!dep) continue
        const isDraggingSrc = drag?.tareaId === depId
        const depBarEnd = isDraggingSrc ? drag!.previewEnd : dep.row.barEnd
        const isDraggingTgt = drag?.tareaId === row.tarea.id
        const tgtBarStart = isDraggingTgt ? drag!.previewStart : row.barStart
        const critica = !!(rutaCritica?.has(depId) && rutaCritica?.has(row.tarea.id))

        arrows.push({
          x1: dx(depBarEnd) + dayPx,
          y1: dep.idx * ROW_H + ROW_H / 2,
          x2: dx(tgtBarStart),
          y2: idx * ROW_H + ROW_H / 2,
          key: `${depId}-${row.tarea.id}`,
          critica,
        })
      }
    }
    return arrows
  }, [rows, drag, dayPx, rowById, rutaCritica])

  const handleExportPNG = async () => {
    if (!ganttContainerRef.current) return
    setExporting(true)
    try {
      await exportGanttPNG(ganttContainerRef.current, 'gantt')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className={cn('flex flex-col h-full', drag && 'select-none')}>
      {/* Controls bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 bg-white flex-shrink-0 flex-wrap">
        <div className="flex items-center bg-slate-100 rounded-xl p-1">
          {(['semana', 'mes'] as ViewMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={cn('px-3 py-1 rounded-lg text-xs font-medium transition-colors',
                mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              {m === 'semana' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>

        {onToggleDependency && (
          <button
            onClick={() => { setLinkMode(!linkMode); setLinkSource(null) }}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors',
              linkMode
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-violet-400 hover:text-violet-600')}>
            {linkMode ? <Link2Off size={13} /> : <Link2 size={13} />}
            {linkMode ? (linkSource ? 'Clic en la tarea destino' : 'Clic en la tarea origen') : 'Vincular dependencias'}
          </button>
        )}

        <div className="flex items-center gap-3 text-xs text-slate-500 flex-1 flex-wrap">
          {([
            ['#94a3b8', '#e2e8f0', 'Pendiente'],
            ['#3b82f6', '#bfdbfe', 'En progreso'],
            ['#10b981', '#bbf7d0', 'Completada'],
            ['#ef4444', '#fecaca', 'Bloqueada'],
          ] as [string, string, string][]).map(([solid, light, lbl]) => (
            <span key={lbl} className="flex items-center gap-1">
              <span className="w-5 h-3 rounded inline-block overflow-hidden flex-shrink-0" style={{ backgroundColor: light }}>
                <span className="block h-full w-1/2" style={{ backgroundColor: solid }} />
              </span>
              {lbl}
            </span>
          ))}
          <span className="flex items-center gap-1 border-l border-slate-200 pl-3"><span className="w-0.5 h-3.5 bg-red-400 inline-block" />Hoy</span>
          {(rutaCritica?.size ?? 0) > 0 && (
            <span className="flex items-center gap-1 border-l border-slate-200 pl-3">
              <span className="w-4 h-3 rounded inline-block border-2 border-red-500" />
              Ruta crítica
            </span>
          )}
          {onReparent && <span className="text-slate-400 border-l border-slate-200 pl-3 flex items-center gap-1"><GripVertical size={11} />Arrastra nombre → grupo</span>}
          {onUpdate && <span className="text-slate-400">· Arrastra barra para mover/redimensionar</span>}
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          <button
            onClick={handleExportPNG}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60"
          >
            <Image size={12} /> {exporting ? 'Exportando...' : 'PNG'}
          </button>
          <button
            onClick={() => exportCSV(tareas, 'gantt')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <FileSpreadsheet size={12} /> CSV
          </button>
        </div>
      </div>

      {/* Gantt table */}
      <div ref={ganttContainerRef} className="flex-1 overflow-auto" style={{ cursor: drag ? (drag.type === 'resize' ? 'col-resize' : 'move') : undefined }}>
        <div className="flex" style={{ minWidth: LEFT_W + totalPx }}>

          {/* ── Left panel (sticky) ── */}
          <div
            className="flex-shrink-0 sticky left-0 z-20 bg-white border-r border-slate-200"
            style={{ width: LEFT_W }}
            onDragOver={(e) => { if (draggingRowId) { e.preventDefault(); setDropTargetId('__root__') } }}
            onDrop={handleRootDrop}
          >
            <div className="sticky top-0 z-10 flex items-center px-4 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider" style={{ height: HEADER_H }}>
              Tarea
            </div>
            {rows.map((row) => {
              // ── Fase header row ──
              if (row.kind === 'fase_header') {
                return (
                  <div key={`fase-${row.label}`}
                    className="flex items-center border-b border-indigo-200 bg-indigo-600 px-3"
                    style={{ height: ROW_H }}>
                    <span className="text-xs font-bold text-white uppercase tracking-wider truncate">{row.label}</span>
                  </div>
                )
              }

              // ── Task row ──
              const { tarea, nivel } = row
              const color = estadoColor(tarea.estado)
              const tipo = tarea.tipo ?? 'tarea'
              const isGrupo = tipo === 'grupo'
              const isDropTarget = dropTargetId === tarea.id
              const isDragging = draggingRowId === tarea.id
              const canDrag = onReparent && !isGrupo

              return (
                <div
                  key={tarea.id}
                  draggable={canDrag ? true : undefined}
                  onDragStart={canDrag ? (e) => handleRowDragStart(e, tarea.id) : undefined}
                  onDragEnd={canDrag ? handleRowDragEnd : undefined}
                  onDragOver={isGrupo ? (e) => handleGroupDragOver(e, tarea.id) : undefined}
                  onDrop={isGrupo ? (e) => handleGroupDrop(e, tarea.id) : undefined}
                  onClick={() => !linkMode && onTareaClick?.(tarea)}
                  className={cn(
                    'flex items-center border-b transition-colors',
                    isDropTarget ? 'bg-indigo-100 border-indigo-400' : 'border-slate-100',
                    isDragging ? 'opacity-40' : '',
                    !linkMode && onTareaClick ? 'cursor-pointer hover:bg-indigo-50/60' : 'hover:bg-slate-50',
                    linkMode && linkSource === tarea.id ? 'bg-violet-50' : '',
                  )}
                  style={{ height: ROW_H, paddingLeft: 8 + nivel * 18 }}
                >
                  {canDrag && (
                    <span className="flex-shrink-0 mr-1 text-slate-300 cursor-grab active:cursor-grabbing">
                      <GripVertical size={13} />
                    </span>
                  )}
                  <span className="flex-shrink-0 mr-1.5 text-[11px] font-bold" style={{ color: color.bar }}>
                    {tipo === 'grupo' ? '▶' : tipo === 'hito' ? '◆' : '—'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm truncate flex items-center gap-1', isGrupo ? 'font-semibold text-slate-800' : 'text-slate-600')} title={tarea.titulo}>
                      {rutaCritica?.has(tarea.id) && (
                        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500" title="Ruta crítica" />
                      )}
                      <span className="truncate">{tarea.titulo}</span>
                    </p>
                    {(tarea.asignadosA?.length ? tarea.asignadosA : (tarea.asignadoA ? [tarea.asignadoA] : [])).length > 0 && (
                      <p className="text-[10px] text-slate-400 truncate">
                        {(tarea.asignadosA?.length ? tarea.asignadosA : [tarea.asignadoA!]).join(', ')}
                      </p>
                    )}
                  </div>
                  {isGrupo && tarea.progreso > 0 && (
                    <span className="text-[10px] text-slate-400 pr-2 flex-shrink-0">{tarea.progreso}%</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* ── Timeline panel ── */}
          <div className="flex-1" style={{ minWidth: totalPx }}>
            {/* Header */}
            <div className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200" style={{ height: HEADER_H }}>
              <div className="relative flex" style={{ height: HEADER_H }}>
                {months.map((m, i) => (
                  <div key={i} className="absolute flex items-center justify-center border-r border-slate-200 text-xs font-semibold text-slate-600 overflow-hidden"
                    style={{ left: m.x, width: m.w, top: 0, bottom: 0 }}>
                    <span className="px-2 truncate capitalize">{m.label}</span>
                  </div>
                ))}
                {mode === 'semana' && Array.from({ length: Math.ceil(totalDays / 7) }).map((_, i) => (
                  <div key={i} className="absolute bottom-0 text-[10px] text-slate-400 border-l border-slate-200"
                    style={{ left: i * 7 * dayPx, paddingLeft: 3, paddingBottom: 3 }}>
                    {format(addDays(projectStart, i * 7), 'd', { locale: es })}
                  </div>
                ))}
              </div>
            </div>

            {/* Bar area */}
            <div className="relative" style={{ height: rows.length * ROW_H }}>
              {/* Grid */}
              {months.map((m, i) => (
                <div key={i} className="absolute top-0 bottom-0 border-l border-slate-100" style={{ left: m.x }} />
              ))}
              {rows.map((row, i) => (
                row.kind === 'fase_header' ? null :
                <div key={i} className={cn('absolute left-0 right-0', i % 2 === 1 ? 'bg-slate-50/50' : '')}
                  style={{ top: i * ROW_H, height: ROW_H }} />
              ))}

              {/* Today line */}
              {todayPx > 0 && todayPx < totalPx && (
                <div className="absolute top-0 bottom-0 z-10 pointer-events-none" style={{ left: todayPx, borderLeft: '2px solid #f87171' }}>
                  <div className="w-2 h-2 bg-red-400 rounded-full absolute -top-1 -left-[5px]" />
                </div>
              )}

              {/* Dependency arrows SVG */}
              {depArrows.length > 0 && (
                <svg className="absolute inset-0 pointer-events-none z-10 overflow-visible" style={{ width: totalPx, height: rows.length * ROW_H }}>
                  <defs>
                    <marker id="dep-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                      <path d="M 0 0 L 6 3 L 0 6 z" fill="#6366f1" opacity="0.7" />
                    </marker>
                    <marker id="dep-arrow-rc" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                      <path d="M 0 0 L 6 3 L 0 6 z" fill="#ef4444" />
                    </marker>
                  </defs>
                  {depArrows.map((a) => {
                    const cx = (a.x1 + a.x2) / 2
                    return a.critica ? (
                      <path key={a.key}
                        d={`M ${a.x1} ${a.y1} C ${cx} ${a.y1} ${cx} ${a.y2} ${a.x2} ${a.y2}`}
                        fill="none" stroke="#ef4444" strokeWidth="2" markerEnd="url(#dep-arrow-rc)" />
                    ) : (
                      <path key={a.key}
                        d={`M ${a.x1} ${a.y1} C ${cx} ${a.y1} ${cx} ${a.y2} ${a.x2} ${a.y2}`}
                        fill="none" stroke="#6366f1" strokeWidth="1.5" strokeOpacity="0.6"
                        strokeDasharray="4 3" markerEnd="url(#dep-arrow)" />
                    )
                  })}
                </svg>
              )}

              {/* Bars */}
              {rows.map((row, rowIdx) => {
                // Fase header: shaded band, no bar
                if (row.kind === 'fase_header') {
                  return (
                    <div key={`fase-bar-${row.label}`}
                      className="absolute left-0 right-0 bg-indigo-600/10 border-b border-indigo-200 pointer-events-none"
                      style={{ top: rowIdx * ROW_H, height: ROW_H }} />
                  )
                }

                const { tarea, barStart: origBarStart, barEnd: origBarEnd } = row
                const color = estadoColor(tarea.estado)
                const tipo = tarea.tipo ?? 'tarea'
                const isDraggingDate = drag?.tareaId === tarea.id
                const barStart = isDraggingDate ? drag!.previewStart : origBarStart
                const barEnd = isDraggingDate ? drag!.previewEnd : origBarEnd

                const x = dx(barStart)
                const w = Math.max((differenceInDays(barEnd, barStart) + 1) * dayPx, tipo === 'hito' ? 0 : 6)
                const top = rowIdx * ROW_H
                const barTop = top + 8
                const barH = ROW_H - 16

                const isLinkSource = linkMode && linkSource === tarea.id
                const isLinkTarget = linkMode && linkSource && linkSource !== tarea.id
                const esCritica = rutaCritica?.has(tarea.id) ?? false

                // ── Hito ──
                if (tipo === 'hito') {
                  const milX = dx(barEnd)
                  return (
                    <div key={tarea.id}
                      onClick={(e) => handleBarClick(e, tarea)}
                      className={cn('absolute z-10 transition-transform',
                        (onTareaClick || linkMode) && 'cursor-pointer hover:scale-125',
                        isLinkSource && 'ring-2 ring-violet-500 ring-offset-1 rounded-sm')}
                      style={{ left: milX - 8, top: top + ROW_H / 2 - 8, width: 16, height: 16, backgroundColor: esCritica ? '#ef4444' : color.bar, transform: 'rotate(45deg)', borderRadius: 2 }}
                      title={tarea.titulo}
                    />
                  )
                }

                // ── Grupo ──
                if (tipo === 'grupo') {
                  return (
                    <div key={tarea.id}
                      onClick={(e) => handleBarClick(e, tarea)}
                      className={cn('absolute flex items-center', (onTareaClick || linkMode) && 'cursor-pointer',
                        isLinkSource && 'ring-2 ring-violet-500')}
                      style={{ left: x, top: barTop + 3, width: w, height: barH - 6, backgroundColor: color.bg, border: esCritica ? '2px solid #ef4444' : `2px solid ${color.bar}`, borderRadius: 6, boxShadow: esCritica ? '0 0 0 1px #ef444440' : undefined }}
                      title={tarea.titulo}
                    >
                      {tarea.progreso > 0 && (
                        <div className="absolute left-0 top-0 bottom-0 pointer-events-none rounded"
                          style={{ width: `${tarea.progreso}%`, backgroundColor: color.bar, opacity: 0.5 }} />
                      )}
                      <div className="absolute -left-[1px] top-full w-0 h-0"
                        style={{ borderLeft: '6px solid transparent', borderRight: 0, borderTop: `5px solid ${esCritica ? '#ef4444' : color.bar}` }} />
                      <div className="absolute -right-[1px] top-full w-0 h-0"
                        style={{ borderLeft: 0, borderRight: '6px solid transparent', borderTop: `5px solid ${esCritica ? '#ef4444' : color.bar}` }} />
                    </div>
                  )
                }

                // ── Tarea normal ──
                const textColor = tarea.estado === 'pendiente' ? '#475569' : '#fff'
                return (
                  <div
                    key={tarea.id}
                    className={cn('absolute flex items-center overflow-visible shadow-sm group/bar',
                      isDraggingDate && 'opacity-90 shadow-lg z-20',
                      onUpdate && !linkMode && 'cursor-move',
                      linkMode && 'cursor-pointer',
                      isLinkSource && 'ring-2 ring-violet-500 z-20',
                      isLinkTarget && 'hover:ring-2 hover:ring-violet-300 z-10')}
                    style={{ left: x, top: barTop, width: w, height: barH, backgroundColor: color.bg, border: esCritica ? '2px solid #ef4444' : `1.5px solid ${color.border}`, borderRadius: 6, boxShadow: esCritica ? '0 0 0 1px #ef444430' : undefined }}
                    onMouseDown={(e) => { if (!linkMode) startDrag(e, tarea, origBarStart, origBarEnd, 'move') }}
                    onClick={(e) => handleBarClick(e, tarea)}
                    title={`${tarea.titulo}${(tarea.asignadosA?.length ? tarea.asignadosA : (tarea.asignadoA ? [tarea.asignadoA] : [])).length > 0 ? ' · ' + (tarea.asignadosA?.length ? tarea.asignadosA : [tarea.asignadoA!]).join(', ') : ''}`}
                  >
                    {/* Progress fill — solid estado color */}
                    {tarea.progreso > 0 && (
                      <div className="absolute left-0 top-0 bottom-0 pointer-events-none"
                        style={{ width: `${tarea.progreso}%`, backgroundColor: color.bar, borderRadius: '4px 0 0 4px' }} />
                    )}
                    {w > 36 && (
                      <div className="relative z-10 flex-1 flex items-center overflow-hidden px-2 gap-1.5 pointer-events-none">
                        <span className="text-[11px] font-semibold truncate leading-tight" style={{ color: textColor }}>
                          {tarea.titulo}
                        </span>
                        {w > 90 && (tarea.asignadosA?.length ? tarea.asignadosA : (tarea.asignadoA ? [tarea.asignadoA] : [])).slice(0, 2).map((r, i) => (
                          <span key={i} className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                            style={{ backgroundColor: `${color.bar}33`, color: color.bar }}>
                            {initials(r)}
                          </span>
                        ))}
                        {(tarea.dependencias?.length ?? 0) > 0 && w > 70 && (
                          <Link2 size={9} className="flex-shrink-0" style={{ color: color.bar }} />
                        )}
                      </div>
                    )}
                    {onUpdate && !linkMode && w > 20 && (
                      <div
                        className="absolute right-0 top-0 bottom-0 flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity cursor-col-resize"
                        style={{ width: RESIZE_HANDLE_W }}
                        onMouseDown={(e) => { e.stopPropagation(); startDrag(e, tarea, origBarStart, origBarEnd, 'resize') }}
                      >
                        <div className="w-0.5 h-4 rounded-full" style={{ backgroundColor: color.bar }} />
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Drag date tooltip */}
              {drag && (
                <div className="absolute top-1 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg z-30 pointer-events-none whitespace-nowrap">
                  {format(drag.previewStart, 'dd MMM', { locale: es })} → {format(drag.previewEnd, 'dd MMM yyyy', { locale: es })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <p className="text-[11px] text-slate-400 text-center py-2 border-t border-slate-100 flex-shrink-0">
          {rows.length} tarea{rows.length !== 1 ? 's' : ''} · {format(projectStart, 'MMM yyyy', { locale: es })} — {format(projectEnd, 'MMM yyyy', { locale: es })}
        </p>
      )}
    </div>
  )
}
