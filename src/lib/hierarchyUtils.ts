import type { Tarea, EstadoTarea } from '@/types'

// ─── HierarchyRow ─────────────────────────────────────────────────────────────
// Discriminated union: either a phase-section header or a task row
export type HierarchyRow =
  | { kind: 'fase_header'; label: string }
  | { kind: 'tarea'; tarea: Tarea; nivel: number }

// Orden de fases en toda la app (Lista, Gantt, Dashboard, portal): primero el orden en que
// aparecen (campo `orden`, p. ej. la fila del Sheet), luego por nombre con números naturales
// (Fase 2 antes que Fase 10).
export function compararFases(a: { nombre: string; orden?: number }, b: { nombre: string; orden?: number }): number {
  return (a.orden ?? Infinity) - (b.orden ?? Infinity) ||
    a.nombre.localeCompare(b.nombre, 'es', { numeric: true, sensitivity: 'base' })
}

export function buildHierarchy(tareas: Tarea[]): HierarchyRow[] {
  const ids = new Set(tareas.map((t) => t.id))

  const hasOrden = tareas.some(t => t.orden !== undefined)
  const roots = tareas
    .filter((t) => !t.parentId || !ids.has(t.parentId))
    .sort((a, b) => {
      if (hasOrden) return (a.orden ?? 999999) - (b.orden ?? 999999)
      const ag = a.tipo === 'grupo' ? 0 : 1
      const bg = b.tipo === 'grupo' ? 0 : 1
      if (ag !== bg) return ag - bg
      return (a.fechaInicio?.seconds ?? 0) - (b.fechaInicio?.seconds ?? 0)
    })

  // Group roots by fase (preserve insertion order = alphabetical after sort)
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

  const result: HierarchyRow[] = []
  const sortFn = (a: Tarea, b: Tarea) => hasOrden
    ? (a.orden ?? 999999) - (b.orden ?? 999999)
    : (a.fechaInicio?.seconds ?? 0) - (b.fechaInicio?.seconds ?? 0)

  const pushTask = (t: Tarea, nivel: number) => {
    result.push({ kind: 'tarea', tarea: t, nivel })
    const children = tareas.filter(c => c.parentId === t.id).sort(sortFn)
    for (const child of children) pushTask(child, nivel + 1)
  }

  const minOrden = (ts: Tarea[]) => {
    const os = ts.map(t => t.orden).filter((o): o is number => o !== undefined)
    return os.length ? Math.min(...os) : undefined
  }
  const fasesOrdenadas = [...byFase.entries()]
    .sort(([a, ra], [b, rb]) => compararFases({ nombre: a, orden: minOrden(ra) }, { nombre: b, orden: minOrden(rb) }))
  for (const [fase, faseRoots] of fasesOrdenadas) {
    result.push({ kind: 'fase_header', label: fase })
    for (const root of faseRoots) pushTask(root, 0)
  }
  for (const root of noFase) pushTask(root, 0)

  return result
}

// ─── computeNumeros ───────────────────────────────────────────────────────────
// Assigns hierarchical numbers (1, 2, 3, 3.1, 3.2...) to each task by traversing
// the same order used by buildHierarchy.
export function computeNumeros(tareas: Tarea[]): Map<string, string> {
  const map = new Map<string, string>()
  const hasOrden = tareas.some(t => t.orden !== undefined)
  const ids = new Set(tareas.map(t => t.id))

  const sortFn = (a: Tarea, b: Tarea) =>
    hasOrden ? (a.orden ?? 999999) - (b.orden ?? 999999)
             : (a.fechaInicio?.seconds ?? 0) - (b.fechaInicio?.seconds ?? 0)

  const roots = tareas.filter(t => !t.parentId || !ids.has(t.parentId)).sort(sortFn)

  // Se respeta la numeración propia (Sheet / importación) cuando existe; si no, se calcula
  function traverse(tasks: Tarea[], prefix: string) {
    tasks.forEach((t, i) => {
      const num = t.numero?.trim() || (prefix ? `${prefix}.${i + 1}` : `${i + 1}`)
      map.set(t.id, num)
      const children = tareas.filter(c => c.parentId === t.id).sort(sortFn)
      if (children.length) traverse(children, num)
    })
  }

  traverse(roots, '')
  return map
}

// ─── enrichTareas ─────────────────────────────────────────────────────────────
// Derives estado, progreso, fechaInicio and fechaFin for grupos recursively
// (bottom-up via memoization so nested groups propagate correctly).
// Completed leaf tasks always contribute 100% to parent progress regardless of
// their stored progreso value.
export function enrichTareas(tareas: Tarea[]): Tarea[] {
  const memo = new Map<string, Tarea>()

  function enrich(t: Tarea): Tarea {
    if (memo.has(t.id)) return memo.get(t.id)!

    if (t.tipo !== 'grupo') {
      // Completed tasks always count as 100% for parent calculations
      const result = t.estado === 'completada' && (t.progreso ?? 0) < 100
        ? { ...t, progreso: 100 }
        : t
      memo.set(t.id, result)
      return result
    }

    const children = tareas.filter((c) => c.parentId === t.id).map(enrich)
    if (children.length === 0) {
      memo.set(t.id, t)
      return t
    }

    const progreso = Math.round(
      children.reduce((sum, c) => sum + (c.progreso ?? 0), 0) / children.length
    )

    const completadas = children.filter((c) => c.estado === 'completada').length
    let estado: EstadoTarea
    if (completadas === children.length)                                               estado = 'completada'
    else if (children.some((c) => c.estado === 'bloqueada'))                          estado = 'bloqueada'
    else if (children.some((c) => c.estado === 'en_progreso' || (c.progreso ?? 0) > 0)) estado = 'en_progreso'
    else                                                                               estado = 'pendiente'

    const withDates = children.filter((c) => c.fechaInicio && c.fechaFin)
    if (withDates.length === 0) {
      const result = { ...t, progreso, estado }
      memo.set(t.id, result)
      return result
    }

    const fechaInicio = withDates.reduce((min, c) =>
      c.fechaInicio.seconds < min.seconds ? c.fechaInicio : min, withDates[0].fechaInicio)
    const fechaFin = withDates.reduce((max, c) =>
      c.fechaFin.seconds > max.seconds ? c.fechaFin : max, withDates[0].fechaFin)

    const result = { ...t, progreso, estado, fechaInicio, fechaFin }
    memo.set(t.id, result)
    return result
  }

  return tareas.map(enrich)
}
