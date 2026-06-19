import { startOfWeek, endOfWeek, addDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Tarea } from '@/types'
import { tsToDate } from './utils'

export interface EmailResumen {
  responsable: string
  body: string
}

export function generarEmailsResumen(tareas: Tarea[], hoy: Date = new Date()): EmailResumen[] {
  const wStart = startOfWeek(hoy, { weekStartsOn: 1 })
  const wEnd   = endOfWeek(hoy,   { weekStartsOn: 1 })
  const nStart = startOfWeek(addDays(hoy, 7), { weekStartsOn: 1 })
  const nEnd   = endOfWeek(addDays(hoy, 7),   { weekStartsOn: 1 })

  const grupoMap = new Map(tareas.filter(t => t.tipo === 'grupo').map(t => [t.id, t]))
  const nonGrupo = tareas.filter(t => t.tipo !== 'grupo')

  const responsables = [...new Set(
    nonGrupo.flatMap(t => t.asignadosA?.length ? t.asignadosA : (t.asignadoA ? [t.asignadoA] : []))
  )]

  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

  const matchResp = (taskResp: string, listName: string): boolean => {
    const t = norm(taskResp)
    const l = norm(listName)
    if (!t || !l) return false
    if (t === l) return true                  // exact
    if (t.includes(l) || l.includes(t)) return true  // one contains the other
    // First-word match only when list name is a single word (no ambiguity)
    const lWords = l.split(/\s+/)
    if (lWords.length === 1 && t.split(/\s+/)[0] === lWords[0]) return true
    return false
  }

  return responsables.map(responsable => {
    const mis = nonGrupo.filter(t => {
      const todos = t.asignadosA?.length ? t.asignadosA : (t.asignadoA ? [t.asignadoA] : [])
      return todos.some(r => matchResp(r, responsable))
    })

    const activasEstaSemana = mis.filter(t => {
      const s = tsToDate(t.fechaInicio)
      const e = tsToDate(t.fechaFin)
      return s <= wEnd && e >= wStart
    })

    const proximaSemana = mis.filter(t => {
      const s = tsToDate(t.fechaInicio)
      return s >= nStart && s <= nEnd
    })

    // Group activas by grupo
    const byGrupo = new Map<string, Tarea[]>()
    for (const t of activasEstaSemana) {
      const key = t.parentId ?? '__sin__'
      if (!byGrupo.has(key)) byGrupo.set(key, [])
      byGrupo.get(key)!.push(t)
    }

    const nombre = responsable.split(' ')[0]
    const rango = `${format(wStart, "d 'de' MMMM", { locale: es })} – ${format(wEnd, "d 'de' MMMM yyyy", { locale: es })}`

    let body = `${nombre}! 👋 Resumen semanal — ${rango}\n\n`

    if (byGrupo.size === 0) {
      body += 'Sin tareas activas esta semana.\n\n'
    } else {
      for (const [grupoId, tasks] of byGrupo) {
        const grupo = grupoId !== '__sin__' ? grupoMap.get(grupoId) : null
        if (grupo) body += `${grupo.titulo}\n`

        const completadas  = tasks.filter(t => t.estado === 'completada')
        const enProceso    = tasks.filter(t => t.estado === 'en_progreso')
        const pendientes   = tasks.filter(t => t.estado === 'pendiente' || t.estado === 'bloqueada')

        if (completadas.length > 0) {
          body += `✅ Completadas:\n`
          completadas.forEach(t => { body += `  • ${t.titulo}\n` })
        }
        if (enProceso.length > 0) {
          body += `🔄 En proceso esta semana:\n`
          enProceso.forEach(t => {
            const fin = format(tsToDate(t.fechaFin), 'dd/MM', { locale: es })
            body += `  • ${t.titulo} · deadline ${fin}\n`
          })
        }
        if (pendientes.length > 0) {
          body += `⏳ Pendientes:\n`
          pendientes.forEach(t => {
            const ini = format(tsToDate(t.fechaInicio), 'dd/MM', { locale: es })
            const fin = format(tsToDate(t.fechaFin),    'dd/MM', { locale: es })
            body += `  • ${t.titulo} · ${ini}–${fin}${t.estado === 'bloqueada' ? ' ⛔' : ''}\n`
          })
        }
        body += '\n'
      }
    }

    if (proximaSemana.length > 0) {
      const rn = `${format(nStart, "d 'de' MMMM", { locale: es })} – ${format(nEnd, "d 'de' MMMM", { locale: es })}`
      body += `▶️ Próxima semana (${rn}):\n`
      proximaSemana.forEach(t => { body += `  • ${t.titulo}\n` })
      body += '\n'
    }

    body += `¿Alguna novedad o algo que necesites? Porfa deja los links en la columna del cronograma 🙏`

    return { responsable, body }
  })
}
