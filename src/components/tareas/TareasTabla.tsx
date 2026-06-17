import { useState, useRef, useEffect, useMemo } from 'react'
import { Timestamp } from 'firebase/firestore'
import { Plus, Trash2, Check, X, GripVertical } from 'lucide-react'
import { crearTarea, actualizarTarea, eliminarTarea } from '@/lib/firestore'
import { aplicarCascada } from '@/lib/cascadeUtils'
import { cn, ESTADO_COLORS, ESTADO_LABELS, tsToDate } from '@/lib/utils'
import { buildHierarchy, enrichTareas } from '@/lib/hierarchyUtils'
import type { Tarea, EstadoTarea } from '@/types'

interface TareasTablaProps {
  tareas: Tarea[]
  proyectoId: string
  empresaId: string
  uid: string
  rutaCritica?: Set<string>
  onEditTarea?: (tarea: Tarea) => void
}

interface FilaNueva {
  titulo: string
  fase: string
  fechaInicio: string
  fechaFin: string
  prioridad: Tarea['prioridad']
  estado: EstadoTarea
  responsable: string
}

const PRIORIDADES: Tarea['prioridad'][] = ['baja', 'media', 'alta', 'critica']
const ESTADOS: EstadoTarea[] = ['pendiente', 'en_progreso', 'completada', 'bloqueada']

const PRIORIDAD_STYLES: Record<Tarea['prioridad'], string> = {
  baja:    'bg-slate-100 text-slate-600',
  media:   'bg-yellow-100 text-yellow-700',
  alta:    'bg-orange-100 text-orange-700',
  critica: 'bg-red-100 text-red-700',
}

export function TareasTabla({ tareas, proyectoId, empresaId, uid, rutaCritica, onEditTarea }: TareasTablaProps) {
  const today = new Date().toISOString().split('T')[0]
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [mostrarFila, setMostrarFila] = useState(false)
  const [fila, setFila] = useState<FilaNueva>({ titulo: '', fase: '', fechaInicio: today, fechaFin: '', prioridad: 'media', estado: 'pendiente', responsable: '' })
  const [guardando, setGuardando] = useState(false)
  const [depEditingId, setDepEditingId] = useState<string | null>(null)
  const [cascadeMsg, setCascadeMsg] = useState('')
  const [mostrarFechaInicio, setMostrarFechaInicio] = useState(true)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [respEditingId, setRespEditingId] = useState<string | null>(null)
  const [respInput, setRespInput] = useState('')

  useEffect(() => {
    if (mostrarFila && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [mostrarFila])

  useEffect(() => {
    if (!depEditingId) return
    const close = () => setDepEditingId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [depEditingId])

  useEffect(() => {
    if (!respEditingId) return
    const close = () => { setRespEditingId(null); setRespInput('') }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [respEditingId])

  const fasesExistentes = useMemo(
    () => [...new Set(tareas.map((t) => t.fase).filter(Boolean) as string[])].sort(),
    [tareas],
  )

  const responsablesExistentes = useMemo(
    () =>
      [...new Set(
        tareas.flatMap((t) => (t.asignadosA?.length ? t.asignadosA : t.asignadoA ? [t.asignadoA] : [])),
      )].sort(),
    [tareas],
  )

  const parseDate = (s: string, time: string): Date | null => {
    if (!s) return null
    const d = new Date(s + time)
    if (isNaN(d.getTime()) || d.getFullYear() > 9999) return null
    return d
  }

  const safeIso = (ts: Timestamp | undefined): string => {
    try {
      const d = tsToDate(ts)
      if (isNaN(d.getTime())) return today
      return d.toISOString().split('T')[0]
    } catch {
      return today
    }
  }

  const getResponsables = (tarea: Tarea): string[] =>
    tarea.asignadosA?.length ? tarea.asignadosA : (tarea.asignadoA ? [tarea.asignadoA] : [])

  const updateResponsables = async (tarea: Tarea, newList: string[]) => {
    await actualizarTarea(tarea.id, {
      asignadosA: newList,
      asignadoA: newList[0] ?? undefined,
    })
  }

  const rows = useMemo(() => buildHierarchy(enrichTareas(tareas)), [tareas])

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current instanceof HTMLInputElement) inputRef.current.select()
    }
  }, [editingCell])

  const startEdit = (id: string, field: string, currentValue: string, readOnly = false) => {
    if (readOnly) return
    setEditingCell({ id, field })
    setEditValue(currentValue)
  }

  const commitEdit = async (tarea: Tarea) => {
    if (!editingCell) return
    const { field } = editingCell
    let update: Partial<Tarea> = {}
    if (field === 'titulo') update = { titulo: editValue }
    else if (field === 'fechaInicio') {
      const d = parseDate(editValue, 'T00:00:00')
      if (!d) { setEditingCell(null); return }
      update = { fechaInicio: Timestamp.fromDate(d) }
    }
    else if (field === 'fechaFin') {
      const d = parseDate(editValue, 'T23:59:59')
      if (!d) { setEditingCell(null); return }
      update = { fechaFin: Timestamp.fromDate(d) }
    }
    else if (field === 'prioridad') update = { prioridad: editValue as Tarea['prioridad'] }
    else if (field === 'estado') update = { estado: editValue as EstadoTarea }
    else if (field === 'progreso') update = { progreso: Math.min(100, Math.max(0, Number(editValue))) }
    else if (field === 'responsable') update = { asignadoA: editValue.trim() || undefined }
    else if (field === 'notas') update = { notas: editValue.trim() || undefined }
    else if (field === 'entregables') update = { entregables: editValue.trim() || undefined }
    await actualizarTarea(tarea.id, update)
    setEditingCell(null)

    if (field === 'fechaFin' && editValue) {
      const nuevaFechaFin = new Date(editValue + 'T23:59:59')
      if (isNaN(nuevaFechaFin.getTime()) || nuevaFechaFin.getFullYear() > 9999) return
      const updates = await aplicarCascada(tareas, tarea.id, nuevaFechaFin)
      if (updates.length > 0) {
        setCascadeMsg(`↳ ${updates.length} tarea${updates.length > 1 ? 's' : ''} ajustada${updates.length > 1 ? 's' : ''} por dependencia`)
        setTimeout(() => setCascadeMsg(''), 4000)
      }
    }
  }

  const cancelEdit = () => setEditingCell(null)

  const handleKeyDown = (e: React.KeyboardEvent, tarea: Tarea) => {
    if (e.key === 'Enter') commitEdit(tarea)
    if (e.key === 'Escape') cancelEdit()
  }

  const handleDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return }
    const tareaRows = rows.filter((r): r is Extract<typeof r, { kind: 'tarea' }> => r.kind === 'tarea').map((r) => r.tarea)
    const fromIdx = tareaRows.findIndex((t) => t.id === dragId)
    const toIdx = tareaRows.findIndex((t) => t.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const reordered = [...tareaRows]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    await Promise.all(reordered.map((t, i) => actualizarTarea(t.id, { orden: (i + 1) * 1000 })))
    setDragId(null)
    setDragOverId(null)
  }

  const handleGuardarFila = async () => {
    const fi = parseDate(fila.fechaInicio, 'T00:00:00')
    const ff = parseDate(fila.fechaFin, 'T23:59:59')
    if (!fila.titulo.trim() || !ff) return
    setGuardando(true)
    try {
      await crearTarea({
        titulo: fila.titulo.trim(),
        descripcion: '',
        fase: fila.fase.trim() || undefined,
        fechaInicio: Timestamp.fromDate(fi ?? new Date()),
        fechaFin: Timestamp.fromDate(ff),
        estado: fila.estado,
        prioridad: fila.prioridad,
        progreso: 0,
        asignadoA: fila.responsable.trim() || undefined,
        proyectoId,
        empresaId,
        dependencias: [],
        creadoPor: uid,
      } as Omit<Tarea, 'id' | 'creadoEn' | 'actualizadoEn'>)
      setFila({ titulo: '', fase: '', fechaInicio: today, fechaFin: '', prioridad: 'media', estado: 'pendiente', responsable: '' })
      setMostrarFila(true)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-x-auto overflow-y-auto p-4">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="w-6 border-b border-slate-200 bg-slate-50 rounded-tl-xl" />
            {(['Tarea', 'Responsable(s)', 'Fase'] as const).map((h) => (
              <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200 bg-slate-50">
                {h}
              </th>
            ))}
            {mostrarFechaInicio && (
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200 bg-slate-50 whitespace-nowrap">
                Fecha inicio
              </th>
            )}
            {(['Fecha fin', 'Estado', 'Prioridad', 'Depende de', 'Progreso', 'Notas', 'Entregables'] as const).map((h) => (
              <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200 bg-slate-50">
                {h}
              </th>
            ))}
            <th className="border-b border-slate-200 bg-slate-50 rounded-tr-xl" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            // Fase section header
            if (row.kind === 'fase_header') {
              return (
                <tr key={`fase-${row.label}`}>
                  <td colSpan={mostrarFechaInicio ? 13 : 12} className="px-3 py-2 border-b border-indigo-100 bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider">
                    {row.label}
                  </td>
                </tr>
              )
            }

            const { tarea, nivel } = row
            const isGrupo = tarea.tipo === 'grupo'
            const isHito = tarea.tipo === 'hito'
            const rowBg = isGrupo ? 'bg-slate-100' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
            const derivedOnly = isGrupo

            return (
              <tr
                key={tarea.id}
                onDragOver={(e) => { e.preventDefault(); setDragOverId(tarea.id) }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverId(null) }}
                onDrop={() => handleDrop(tarea.id)}
                className={cn(
                  'group hover:bg-indigo-50/40 transition-colors',
                  rowBg,
                  dragId === tarea.id && 'opacity-40',
                  dragOverId === tarea.id && dragId !== tarea.id && 'border-t-2 border-indigo-400',
                )}
              >
                {/* Drag handle */}
                <td className="px-1 py-2 border-b border-slate-100 w-6">
                  <div
                    draggable
                    onDragStart={() => setDragId(tarea.id)}
                    onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                    className="cursor-grab active:cursor-grabbing text-slate-200 hover:text-slate-400 flex items-center justify-center"
                  >
                    <GripVertical size={13} />
                  </div>
                </td>
                {/* Título */}
                <td className="px-3 py-2 border-b border-slate-100 min-w-48 max-w-72">
                  <div style={{ paddingLeft: nivel * 20 }} className="flex items-center gap-1.5">
                    {isGrupo && <span className="text-[10px] font-bold text-indigo-500">▶</span>}
                    {isHito && <span className="text-[10px] font-bold text-rose-500">◆</span>}
                    {editingCell?.id === tarea.id && editingCell.field === 'titulo' ? (
                      <input
                        ref={inputRef as React.RefObject<HTMLInputElement>}
                        className="w-full bg-white border border-indigo-400 rounded-lg px-2 py-1 text-sm focus:outline-none"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => commitEdit(tarea)}
                        onKeyDown={(e) => handleKeyDown(e, tarea)}
                      />
                    ) : (
                      <span className="flex items-center gap-1.5 min-w-0">
                        {rutaCritica?.has(tarea.id) && (
                          <span title="Ruta crítica" className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500" />
                        )}
                        <span
                          onClick={() => onEditTarea ? onEditTarea(tarea) : startEdit(tarea.id, 'titulo', tarea.titulo)}
                          className={cn('cursor-pointer block truncate hover:text-indigo-600 underline decoration-dotted underline-offset-2 decoration-slate-300 hover:decoration-indigo-400',
                            isGrupo ? 'font-semibold text-slate-800' : 'text-slate-900')}
                        >
                          {tarea.titulo}
                        </span>
                      </span>
                    )}
                  </div>
                </td>

                {/* Responsable(s) — multi-person (después del título) */}
                <td className="px-3 py-2 border-b border-slate-100">
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-1 items-center min-w-[100px]">
                      {getResponsables(tarea).map((r, i) => (
                        <span key={i} className="flex items-center gap-1 bg-indigo-50 text-indigo-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                          <span className="w-3.5 h-3.5 rounded-full bg-indigo-200 text-indigo-700 text-[8px] font-bold flex items-center justify-center flex-shrink-0">
                            {r.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                          </span>
                          <span className="max-w-[60px] truncate">{r.split(' ')[0]}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); updateResponsables(tarea, getResponsables(tarea).filter((_, j) => j !== i)) }}
                            className="text-indigo-400 hover:text-indigo-700 ml-0.5"
                          >×</button>
                        </span>
                      ))}
                      <button
                        onClick={() => setRespEditingId(respEditingId === tarea.id ? null : tarea.id)}
                        className="text-slate-300 hover:text-indigo-500 text-xs transition-colors leading-none"
                        title="Agregar responsable"
                      >+</button>
                    </div>
                    {respEditingId === tarea.id && (
                      <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-2 min-w-44" onClick={(e) => e.stopPropagation()}>
                        <input
                          autoFocus
                          list="resp-datalist"
                          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-400"
                          placeholder="Nombre del responsable..."
                          value={respInput}
                          onChange={(e) => setRespInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && respInput.trim()) {
                              updateResponsables(tarea, [...getResponsables(tarea), respInput.trim()])
                              setRespInput('')
                              setRespEditingId(null)
                            }
                            if (e.key === 'Escape') { setRespEditingId(null); setRespInput('') }
                          }}
                        />
                        <datalist id="resp-datalist">
                          {responsablesExistentes
                            .filter((r) => !getResponsables(tarea).includes(r))
                            .map((r) => <option key={r} value={r} />)}
                        </datalist>
                        <p className="text-[10px] text-slate-400 mt-1 px-1">Enter para agregar · Esc para cerrar</p>
                      </div>
                    )}
                  </div>
                </td>

                {/* Fase */}
                <td className="px-3 py-2 border-b border-slate-100 max-w-[120px]">
                  {tarea.fase ? (
                    <span className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md font-medium truncate block">
                      {tarea.fase}
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </td>

                {/* Fecha inicio — opcional */}
                {mostrarFechaInicio && (
                  <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                    {editingCell?.id === tarea.id && editingCell.field === 'fechaInicio' ? (
                      <input ref={inputRef as React.RefObject<HTMLInputElement>} type="date"
                        className="bg-white border border-indigo-400 rounded-lg px-2 py-1 text-sm focus:outline-none"
                        value={editValue} onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => commitEdit(tarea)} onKeyDown={(e) => handleKeyDown(e, tarea)} />
                    ) : (
                      <span onClick={() => startEdit(tarea.id, 'fechaInicio', safeIso(tarea.fechaInicio))}
                        className="cursor-text text-slate-600 hover:text-indigo-600">
                        {tsToDate(tarea.fechaInicio).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </td>
                )}

                {/* Fecha fin */}
                <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                  {editingCell?.id === tarea.id && editingCell.field === 'fechaFin' ? (
                    <input ref={inputRef as React.RefObject<HTMLInputElement>} type="date"
                      className="bg-white border border-indigo-400 rounded-lg px-2 py-1 text-sm focus:outline-none"
                      value={editValue} onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(tarea)} onKeyDown={(e) => handleKeyDown(e, tarea)} />
                  ) : (
                    <span onClick={() => startEdit(tarea.id, 'fechaFin', safeIso(tarea.fechaFin))}
                      className="cursor-text text-slate-600 hover:text-indigo-600">
                      {tsToDate(tarea.fechaFin).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </span>
                  )}
                </td>

                {/* Estado */}
                <td className="px-3 py-2 border-b border-slate-100">
                  {editingCell?.id === tarea.id && editingCell.field === 'estado' ? (
                    <select ref={inputRef as React.RefObject<HTMLSelectElement>}
                      className="bg-white border border-indigo-400 rounded-lg px-2 py-1 text-sm focus:outline-none"
                      value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => commitEdit(tarea)}>
                      {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
                    </select>
                  ) : (
                    <span onClick={() => !derivedOnly && startEdit(tarea.id, 'estado', tarea.estado)}
                      className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
                        derivedOnly ? 'cursor-default' : 'cursor-pointer',
                        ESTADO_COLORS[tarea.estado].bg, ESTADO_COLORS[tarea.estado].text)}>
                      <span className={cn('w-1.5 h-1.5 rounded-full', ESTADO_COLORS[tarea.estado].dot)} />
                      {ESTADO_LABELS[tarea.estado]}
                    </span>
                  )}
                </td>

                {/* Prioridad */}
                <td className="px-3 py-2 border-b border-slate-100">
                  {editingCell?.id === tarea.id && editingCell.field === 'prioridad' ? (
                    <select ref={inputRef as React.RefObject<HTMLSelectElement>}
                      className="bg-white border border-indigo-400 rounded-lg px-2 py-1 text-sm focus:outline-none"
                      value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => commitEdit(tarea)}>
                      {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <span onClick={() => startEdit(tarea.id, 'prioridad', tarea.prioridad)}
                      className={cn('cursor-pointer inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize', PRIORIDAD_STYLES[tarea.prioridad])}>
                      {tarea.prioridad}
                    </span>
                  )}
                </td>

                {/* Depende de */}
                <td className="px-3 py-2 border-b border-slate-100">
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setDepEditingId(depEditingId === tarea.id ? null : tarea.id)}
                      className="flex items-center gap-1 group/dep"
                    >
                      {(tarea.dependencias ?? []).length === 0 ? (
                        <span className="text-slate-300 hover:text-indigo-400 text-xs transition-colors">+ dep</span>
                      ) : (
                        <span className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded-md font-medium transition-colors">
                          ↳ {tarea.dependencias!.length}
                        </span>
                      )}
                    </button>
                    {depEditingId === tarea.id && (
                      <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 min-w-52 max-h-52 overflow-y-auto">
                        {tareas.filter(t => t.id !== tarea.id).length === 0 ? (
                          <p className="text-xs text-slate-400 px-2 py-1.5">No hay otras tareas</p>
                        ) : (
                          tareas.filter(t => t.id !== tarea.id).map(t => {
                            const checked = (tarea.dependencias ?? []).includes(t.id)
                            return (
                              <label key={t.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={async () => {
                                    const current = tarea.dependencias ?? []
                                    const next = checked ? current.filter(id => id !== t.id) : [...current, t.id]
                                    await actualizarTarea(tarea.id, { dependencias: next })
                                  }}
                                  className="rounded accent-indigo-600"
                                />
                                <span className="text-xs text-slate-700 truncate max-w-[160px]">{t.titulo}</span>
                              </label>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                </td>

                {/* Progreso */}
                <td className="px-3 py-2 border-b border-slate-100 min-w-24">
                  {editingCell?.id === tarea.id && editingCell.field === 'progreso' ? (
                    <input ref={inputRef as React.RefObject<HTMLInputElement>} type="number" min={0} max={100}
                      className="w-16 bg-white border border-indigo-400 rounded-lg px-2 py-1 text-sm focus:outline-none"
                      value={editValue} onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(tarea)} onKeyDown={(e) => handleKeyDown(e, tarea)} />
                  ) : (
                    <div onClick={() => !derivedOnly && startEdit(tarea.id, 'progreso', String(tarea.progreso))}
                      className={cn('flex items-center gap-2 group/prog', derivedOnly ? 'cursor-default' : 'cursor-pointer')}>
                      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${tarea.progreso}%` }} />
                      </div>
                      <span className={cn('text-xs text-slate-500 w-8 text-right', !derivedOnly && 'group-hover/prog:text-indigo-600')}>
                        {tarea.progreso}%
                      </span>
                    </div>
                  )}
                </td>

                {/* Notas */}
                <td className="px-3 py-2 border-b border-slate-100 max-w-[160px]">
                  {editingCell?.id === tarea.id && editingCell.field === 'notas' ? (
                    <textarea
                      ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                      className="w-40 h-20 bg-white border border-indigo-400 rounded-lg px-2 py-1 text-xs focus:outline-none resize-none"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(tarea)}
                      onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit() }}
                    />
                  ) : (
                    <span
                      onClick={() => startEdit(tarea.id, 'notas', tarea.notas ?? '')}
                      className="cursor-text text-xs text-slate-500 hover:text-indigo-600 line-clamp-2 block"
                    >
                      {tarea.notas || <span className="text-slate-300">+ nota</span>}
                    </span>
                  )}
                </td>

                {/* Entregables */}
                <td className="px-3 py-2 border-b border-slate-100 max-w-[180px]">
                  {editingCell?.id === tarea.id && editingCell.field === 'entregables' ? (
                    <textarea
                      ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                      className="w-44 h-20 bg-white border border-indigo-400 rounded-lg px-2 py-1 text-xs focus:outline-none resize-none"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(tarea)}
                      onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit() }}
                    />
                  ) : tarea.entregables ? (
                    /^https?:\/\//.test(tarea.entregables) ? (
                      <div className="flex items-center gap-1 group/ent">
                        <a
                          href={tarea.entregables}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-600 hover:underline truncate max-w-[130px] block"
                          title={tarea.entregables}
                        >
                          {tarea.entregables.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                        </a>
                        <button
                          onClick={() => startEdit(tarea.id, 'entregables', tarea.entregables ?? '')}
                          className="opacity-0 group-hover/ent:opacity-100 text-slate-300 hover:text-slate-500 text-[10px] transition-all"
                          title="Editar"
                        >✎</button>
                      </div>
                    ) : (
                      <span
                        onClick={() => startEdit(tarea.id, 'entregables', tarea.entregables ?? '')}
                        className="cursor-text text-xs text-slate-500 hover:text-indigo-600 line-clamp-2 block"
                      >
                        {tarea.entregables}
                      </span>
                    )
                  ) : (
                    <span
                      onClick={() => startEdit(tarea.id, 'entregables', '')}
                      className="cursor-text text-xs text-slate-300 hover:text-indigo-400 block"
                    >
                      + entregable
                    </span>
                  )}
                </td>

                {/* Acciones */}
                <td className="px-3 py-2 border-b border-slate-100">
                  <button onClick={() => { if (confirm('¿Eliminar tarea?')) eliminarTarea(tarea.id) }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            )
          })}

          {/* Fila nueva — mismo orden que headers */}
          {mostrarFila && (
            <tr className="bg-indigo-50/60">
              <td className="w-6" />
              {/* Tarea */}
              <td className="px-3 py-2">
                <input autoFocus className="w-full bg-white border border-indigo-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="Nombre de la tarea..." value={fila.titulo}
                  onChange={(e) => setFila({ ...fila, titulo: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleGuardarFila() }} />
              </td>
              {/* Responsable */}
              <td className="px-3 py-2">
                <input className="w-full bg-white border border-indigo-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                  list="fila-resp-datalist" placeholder="Responsable..." value={fila.responsable}
                  onChange={(e) => setFila({ ...fila, responsable: e.target.value })} />
                <datalist id="fila-resp-datalist">
                  {responsablesExistentes.map((r) => <option key={r} value={r} />)}
                </datalist>
              </td>
              {/* Fase */}
              <td className="px-3 py-2">
                <input className="w-full bg-white border border-indigo-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                  list="fases-datalist" placeholder="Fase..." value={fila.fase}
                  onChange={(e) => setFila({ ...fila, fase: e.target.value })} />
                <datalist id="fases-datalist">
                  {fasesExistentes.map((f) => <option key={f} value={f} />)}
                </datalist>
              </td>
              {/* Fecha inicio — opcional */}
              {mostrarFechaInicio && (
                <td className="px-3 py-2">
                  <input type="date" className="bg-white border border-indigo-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                    value={fila.fechaInicio} onChange={(e) => setFila({ ...fila, fechaInicio: e.target.value })} />
                </td>
              )}
              {/* Fecha fin */}
              <td className="px-3 py-2">
                <input type="date" className="bg-white border border-indigo-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                  value={fila.fechaFin} min={fila.fechaInicio} onChange={(e) => setFila({ ...fila, fechaFin: e.target.value })} />
              </td>
              {/* Estado */}
              <td className="px-3 py-2">
                <select className="bg-white border border-indigo-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                  value={fila.estado} onChange={(e) => setFila({ ...fila, estado: e.target.value as EstadoTarea })}>
                  {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
                </select>
              </td>
              {/* Prioridad */}
              <td className="px-3 py-2">
                <select className="bg-white border border-indigo-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                  value={fila.prioridad} onChange={(e) => setFila({ ...fila, prioridad: e.target.value as Tarea['prioridad'] })}>
                  {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </td>
              <td className="px-3 py-2 text-xs text-slate-400">—</td>
              <td className="px-3 py-2 text-xs text-slate-400">0%</td>
              <td className="px-3 py-2 text-xs text-slate-400">—</td>
              <td className="px-3 py-2 text-xs text-slate-400">—</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <button onClick={handleGuardarFila} disabled={guardando || !fila.titulo.trim() || !parseDate(fila.fechaFin, 'T23:59:59')}
                    className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                    <Check size={13} />
                  </button>
                  <button onClick={() => setMostrarFila(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                    <X size={13} />
                  </button>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>

    {/* Sticky footer: always visible at the bottom of the table panel */}
    <div className="flex-shrink-0 bg-white border-t border-slate-100 px-4 py-2.5 flex items-center justify-between">
      {!mostrarFila ? (
        <button onClick={() => setMostrarFila(true)}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 transition-colors">
          <Plus size={15} /> Agregar tarea
        </button>
      ) : (
        <p className="text-xs text-slate-400">
          Haz clic en cualquier celda para editarla · Enter para confirmar · Esc para cancelar
        </p>
      )}
      <div className="flex items-center gap-3">
        {cascadeMsg && (
          <span className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl animate-pulse">
            {cascadeMsg}
          </span>
        )}
        <button
          onClick={() => setMostrarFechaInicio((v) => !v)}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors border border-slate-200 rounded-lg px-2 py-1"
          title={mostrarFechaInicio ? 'Ocultar fecha inicio' : 'Mostrar fecha inicio'}
        >
          {mostrarFechaInicio ? '⊖ f.inicio' : '⊕ f.inicio'}
        </button>
      </div>
    </div>
    </div>
  )
}
