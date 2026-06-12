import type { Tarea } from '@/types'

// Normaliza milisegundos a día entero para comparaciones libres de hora
const toDay = (ms: number) => Math.floor(ms / (24 * 60 * 60 * 1000))

/**
 * Calcula la ruta crítica usando el método CPM con pasada hacia atrás.
 *
 * Para cada tarea:
 *   LF (Latest Finish) = min(fechaInicio de sucesores) - 1 día
 *                        o proyecto.fechaFin si no tiene sucesores
 *   Float (holgura)    = LF_día - EF_día
 *   Crítica            = float ≤ 0 Y forma parte de una cadena de dependencias
 *
 * Solo se calcula cuando hay al menos un enlace de dependencia en el proyecto.
 */
export function calcularRutaCritica(tareas: Tarea[]): Set<string> {
  if (tareas.length === 0) return new Set()

  const tieneDeps = tareas.some(t => (t.dependencias ?? []).length > 0)
  if (!tieneDeps) return new Set()

  // Construir mapa de sucesores: id → ids de las tareas que dependen de él
  const sucesores = new Map<string, string[]>()
  for (const t of tareas) sucesores.set(t.id, [])
  for (const t of tareas) {
    for (const depId of (t.dependencias ?? [])) {
      sucesores.get(depId)?.push(t.id)
    }
  }

  // Fin del proyecto = día más tardío entre todos los fechaFin
  const proyectoFinDay = Math.max(...tareas.map(t => toDay(t.fechaFin.toMillis())))

  const criticas = new Set<string>()

  for (const tarea of tareas) {
    const suc = sucesores.get(tarea.id) ?? []
    const esDeCadena = (tarea.dependencias ?? []).length > 0 || suc.length > 0
    if (!esDeCadena) continue

    const sucTareas = suc
      .map(id => tareas.find(t => t.id === id))
      .filter((t): t is Tarea => !!t)

    const lfDay = sucTareas.length === 0
      ? proyectoFinDay
      : Math.min(...sucTareas.map(t => toDay(t.fechaInicio.toMillis()))) - 1

    const efDay = toDay(tarea.fechaFin.toMillis())
    const floatDays = lfDay - efDay

    if (floatDays <= 0) criticas.add(tarea.id)
  }

  return criticas
}
