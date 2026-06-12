import { Timestamp } from 'firebase/firestore'
import { actualizarTarea } from './firestore'
import type { Tarea } from '@/types'

const UN_DIA_MS = 24 * 60 * 60 * 1000

export interface CascadeUpdate {
  id: string
  titulo: string
  fechaInicio: Date
  fechaFin: Date
}

/**
 * Calcula qué tareas pendientes deben desplazarse hacia adelante
 * porque su fechaInicio <= nuevaFechaFin del task que cambió.
 * Solo avanza fechas, nunca retrocede. Detecta dependencias circulares.
 */
export function calcularCascada(
  tareas: Tarea[],
  changedId: string,
  nuevaFechaFin: Date,
  visitados = new Set<string>()
): CascadeUpdate[] {
  if (visitados.has(changedId)) return []
  const nextVisitados = new Set(visitados).add(changedId)

  const updates: CascadeUpdate[] = []
  // Copia mutable para propagar fechas actualizadas en recursión
  const tareasMutable = tareas.map(t => ({ ...t }))

  const dependientes = tareas.filter(
    t =>
      t.id !== changedId &&
      !visitados.has(t.id) &&
      (t.dependencias ?? []).includes(changedId) &&
      t.estado === 'pendiente'
  )

  for (const dep of dependientes) {
    const depInicio = dep.fechaInicio.toDate()
    const depFin = dep.fechaFin.toDate()

    if (depInicio <= nuevaFechaFin) {
      const duracionMs = Math.max(depFin.getTime() - depInicio.getTime(), 0)
      const newInicio = new Date(nuevaFechaFin.getTime() + UN_DIA_MS)
      newInicio.setHours(0, 0, 0, 0)
      const newFin = new Date(newInicio.getTime() + duracionMs)
      newFin.setHours(23, 59, 59, 0)

      updates.push({ id: dep.id, titulo: dep.titulo, fechaInicio: newInicio, fechaFin: newFin })

      // Actualizar copia mutable para que la recursión use las fechas nuevas
      const idx = tareasMutable.findIndex(t => t.id === dep.id)
      if (idx >= 0) {
        tareasMutable[idx].fechaInicio = Timestamp.fromDate(newInicio)
        tareasMutable[idx].fechaFin = Timestamp.fromDate(newFin)
      }

      const subUpdates = calcularCascada(tareasMutable, dep.id, newFin, nextVisitados)
      updates.push(...subUpdates)
    }
  }

  return updates
}

/**
 * Calcula y aplica la cascada en Firestore.
 * Retorna el listado de tareas que se actualizaron.
 */
export async function aplicarCascada(
  tareas: Tarea[],
  changedId: string,
  nuevaFechaFin: Date
): Promise<CascadeUpdate[]> {
  const updates = calcularCascada(tareas, changedId, nuevaFechaFin)
  if (updates.length === 0) return []

  await Promise.all(
    updates.map(u =>
      actualizarTarea(u.id, {
        fechaInicio: Timestamp.fromDate(u.fechaInicio),
        fechaFin: Timestamp.fromDate(u.fechaFin),
      })
    )
  )

  return updates
}
