import { format, startOfWeek, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { tsToDate, diasBloqueada, textoDiasBloqueada } from './utils'
import { calcularSalud, SEMAFORO_ESTILOS } from './saludUtils'
import type { Tarea } from '@/types'

const f = (d: Date) => format(d, "d 'de' MMMM", { locale: es })

/**
 * Texto de avance para enviar al cliente (correo / WhatsApp). Solo incluye lo que el
 * cliente debe ver: nada de bloqueos internos, responsables ni notas de tareas no bloqueadas.
 */
export function generarResumenCliente(nombreProyecto: string, tareas: Tarea[], portalUrl?: string, hoy = new Date()): string {
  const hojas = tareas.filter(t => t.tipo !== 'grupo')
  const salud = calcularSalud(tareas, hoy)
  const inicioSemana = startOfWeek(hoy, { weekStartsOn: 1 }).getTime()
  const en14 = addDays(hoy, 14).getTime()
  const ahora = hoy.getTime()

  const completadasSemana = hojas.filter(t => t.estado === 'completada' && (t.actualizadoEn?.seconds ?? 0) * 1000 >= inicioSemana)
  const enCurso = hojas.filter(t => t.estado === 'en_progreso')
  const delCliente = hojas.filter(t => t.estado === 'bloqueada' && t.bloqueo === 'cliente')
    .sort((a, b) => (diasBloqueada(b) ?? 0) - (diasBloqueada(a) ?? 0))
  const hitos = hojas.filter(t => t.tipo === 'hito' && t.estado !== 'completada' && tsToDate(t.fechaFin).getTime() >= ahora - 86400000)
    .sort((a, b) => tsToDate(a.fechaFin).getTime() - tsToDate(b.fechaFin).getTime()).slice(0, 3)
  const proximas = hojas.filter(t => t.tipo !== 'hito' && t.estado === 'pendiente' &&
    tsToDate(t.fechaInicio).getTime() >= ahora - 86400000 && tsToDate(t.fechaInicio).getTime() <= en14)
    .sort((a, b) => tsToDate(a.fechaInicio).getTime() - tsToDate(b.fechaInicio).getTime()).slice(0, 8)

  const l: string[] = []
  l.push(`Hola 👋 Este es el avance de *${nombreProyecto}* al ${f(hoy)}:`)
  l.push('')
  l.push(`📊 Avance general: ${salud.avanceReal}%${salud.semaforo !== 'sin_datos' ? ` (${SEMAFORO_ESTILOS[salud.semaforo].label.toLowerCase()})` : ''}`)

  if (completadasSemana.length) {
    l.push('', '✅ Completado esta semana:')
    completadasSemana.forEach(t => l.push(`  • ${t.titulo}`))
  }
  if (enCurso.length) {
    l.push('', '🔄 En curso:')
    enCurso.slice(0, 10).forEach(t => l.push(`  • ${t.titulo} — ${t.progreso ?? 0}% · entrega ${f(tsToDate(t.fechaFin))}`))
    if (enCurso.length > 10) l.push(`  • …y ${enCurso.length - 10} más`)
  }
  if (delCliente.length) {
    l.push('', '⛔ Necesitamos de su parte para avanzar:')
    delCliente.forEach(t => {
      const dias = textoDiasBloqueada(diasBloqueada(t))
      l.push(`  • ${t.titulo}${t.notas?.trim() ? `: ${t.notas.trim()}` : ''}${dias ? ` (${dias.toLowerCase()})` : ''}`)
    })
  }
  if (hitos.length) {
    l.push('', '📅 Próximos hitos:')
    hitos.forEach(t => l.push(`  • ${t.titulo} — ${f(tsToDate(t.fechaFin))}`))
  }
  if (proximas.length) {
    l.push('', '🗓 Próximas 2 semanas:')
    proximas.forEach(t => l.push(`  • ${t.titulo} — desde ${f(tsToDate(t.fechaInicio))}`))
  }
  if (portalUrl) l.push('', `🔗 Cronograma completo en tiempo real: ${portalUrl}`)
  l.push('', 'Quedamos atentos a cualquier comentario. ¡Gracias!')
  return l.join('\n')
}
