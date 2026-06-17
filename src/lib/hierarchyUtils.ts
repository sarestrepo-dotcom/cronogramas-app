import type { Tarea, EstadoTarea } from '@/types'

// ─── HierarchyRow ─────────────────────────────────────────────────────────────
// Discriminated union: either a phase-section header or a task row
export type HierarchyRow =
  | { kind: 'fase_header'; label: string }
  | { kind: 'tarea'; tarea: Tarea; nivel: number }

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

  const pushRoot = (root: Tarea) => {
    result.push({ kind: 'tarea', tarea: root, nivel: 0 })
    const children = tareas
      .filter((t) => t.parentId === root.id)
      .sort((a, b) => hasOrden
        ? (a.orden ?? 999999) - (b.orden ?? 999999)
        : (a.fechaInicio?.seconds ?? 0) - (b.fechaInicio?.seconds ?? 0))
    for (const child of children) {
      result.push({ kind: 'tarea', tarea: child, nivel: 1 })
    }
  }

  for (const [fase, faseRoots] of byFase) {
    result.push({ kind: 'fase_header', label: fase })
    for (const root of faseRoots) pushRoot(root)
  }
  for (const root of noFase) pushRoot(root)

  return result
}

// ─── enrichTareas ─────────────────────────────────────────────────────────────
// Derives estado, progreso, fechaInicio and fechaFin for grupos from their direct children.
export function enrichTareas(tareas: Tarea[]): Tarea[] {
  return tareas.map((tarea) => {
    if (tarea.tipo !== 'grupo') return tarea
    const children = tareas.filter((t) => t.parentId === tarea.id)
    if (children.length === 0) return tarea

    const progreso = Math.round(
      children.reduce((sum, t) => sum + (t.progreso ?? 0), 0) / children.length
    )

    const completadas = children.filter((t) => t.estado === 'completada').length
    let estado: EstadoTarea
    if (completadas === children.length) estado = 'completada'
    else if (children.some((t) => t.estado === 'bloqueada')) estado = 'bloqueada'
    else if (children.some((t) => t.estado === 'en_progreso' || (t.progreso ?? 0) > 0)) estado = 'en_progreso'
    else estado = 'pendiente'

    // Derive date span: earliest child start → latest child end
    const withDates = children.filter((t) => t.fechaInicio && t.fechaFin)
    if (withDates.length === 0) return { ...tarea, progreso, estado }

    const fechaInicio = withDates.reduce((min, t) =>
      t.fechaInicio.seconds < min.seconds ? t.fechaInicio : min, withDates[0].fechaInicio)
    const fechaFin = withDates.reduce((max, t) =>
      t.fechaFin.seconds > max.seconds ? t.fechaFin : max, withDates[0].fechaFin)

    return { ...tarea, progreso, estado, fechaInicio, fechaFin }
  })
}
