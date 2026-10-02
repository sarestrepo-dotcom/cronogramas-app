import { tsToDate, isVencida, diasBloqueada, UMBRAL_BLOQUEO_DIAS } from './utils'
import type { Tarea } from '@/types'

export type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'sin_datos'

export interface SaludProyecto {
  semaforo: Semaforo
  avanceReal: number       // % promedio de las tareas (completada = 100)
  avanceEsperado: number   // % que debería llevar hoy según las fechas de cada tarea
  diferencia: number       // real - esperado (negativo = atrasado)
  vencidas: number         // tareas no completadas con fecha fin pasada
  bloqueadas: number
  bloqueadasCliente: number
  bloqueosViejos: number   // bloqueadas hace UMBRAL_BLOQUEO_DIAS días o más
  motivo: string           // explicación corta del color
}

export const SEMAFORO_ESTILOS: Record<Semaforo, { dot: string; bg: string; text: string; label: string }> = {
  verde:     { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'En tiempo' },
  amarillo:  { dot: 'bg-amber-400',   bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'En riesgo' },
  rojo:      { dot: 'bg-red-500',     bg: 'bg-red-50',     text: 'text-red-700',     label: 'Atrasado' },
  sin_datos: { dot: 'bg-slate-300',   bg: 'bg-slate-50',   text: 'text-slate-500',   label: 'Sin datos' },
}

// Avance esperado de una tarea hoy: lineal entre su inicio y su fin
function esperadoTarea(t: Tarea, hoy: number): number {
  const ini = tsToDate(t.fechaInicio).getTime()
  const fin = tsToDate(t.fechaFin).getTime()
  if (!ini || !fin || hoy <= ini) return 0
  if (hoy >= fin) return 100
  return ((hoy - ini) / (fin - ini)) * 100
}

/**
 * Salud del proyecto: compara el avance real con el esperado según el cronograma.
 * - Rojo: ≥20 puntos de atraso, o 3+ tareas vencidas, o bloqueos del cliente con 7+ días.
 * - Amarillo: ≥8 puntos de atraso, o alguna vencida, o alguna bloqueada.
 * - Verde: en otro caso.
 */
export function calcularSalud(tareas: Tarea[], hoy: Date = new Date()): SaludProyecto {
  const hojas = tareas.filter(t => t.tipo !== 'grupo')
  const base = { avanceReal: 0, avanceEsperado: 0, diferencia: 0, vencidas: 0, bloqueadas: 0, bloqueadasCliente: 0, bloqueosViejos: 0 }
  if (hojas.length === 0) return { ...base, semaforo: 'sin_datos', motivo: 'Sin tareas' }

  const ms = hoy.getTime()
  const avanceReal = Math.round(hojas.reduce((s, t) => s + (t.estado === 'completada' ? 100 : (t.progreso ?? 0)), 0) / hojas.length)
  const avanceEsperado = Math.round(hojas.reduce((s, t) => s + esperadoTarea(t, ms), 0) / hojas.length)
  const diferencia = avanceReal - avanceEsperado
  const vencidas = hojas.filter(t => t.estado !== 'completada' && isVencida(t.fechaFin)).length
  const bloq = hojas.filter(t => t.estado === 'bloqueada')
  const bloqueadasCliente = bloq.filter(t => t.bloqueo === 'cliente').length
  const bloqueosViejos = bloq.filter(t => (diasBloqueada(t) ?? 0) >= UMBRAL_BLOQUEO_DIAS).length
  const clienteViejo = bloq.some(t => t.bloqueo === 'cliente' && (diasBloqueada(t) ?? 0) >= UMBRAL_BLOQUEO_DIAS)

  const r = { avanceReal, avanceEsperado, diferencia, vencidas, bloqueadas: bloq.length, bloqueadasCliente, bloqueosViejos }
  const atraso = -diferencia

  if (atraso >= 20) return { ...r, semaforo: 'rojo', motivo: `${atraso} puntos por debajo de lo planeado` }
  if (vencidas >= 3) return { ...r, semaforo: 'rojo', motivo: `${vencidas} tareas vencidas` }
  if (clienteViejo) return { ...r, semaforo: 'rojo', motivo: `Bloqueos del cliente con ${UMBRAL_BLOQUEO_DIAS}+ días` }
  if (atraso >= 8) return { ...r, semaforo: 'amarillo', motivo: `${atraso} puntos por debajo de lo planeado` }
  if (vencidas > 0) return { ...r, semaforo: 'amarillo', motivo: `${vencidas} tarea${vencidas === 1 ? '' : 's'} vencida${vencidas === 1 ? '' : 's'}` }
  if (bloq.length > 0) return { ...r, semaforo: 'amarillo', motivo: `${bloq.length} tarea${bloq.length === 1 ? '' : 's'} bloqueada${bloq.length === 1 ? '' : 's'}` }
  return { ...r, semaforo: 'verde', motivo: diferencia >= 0 ? 'Al día o adelantado' : 'Dentro de lo planeado' }
}
