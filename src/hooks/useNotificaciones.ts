import { useMemo, useState, useCallback } from 'react'
import { useMisTareas } from './useMisTareas'
import { diasRestantes, isVencida } from '@/lib/utils'

export type NivelNotif = 'vencida' | 'hoy' | 'manana' | 'semana'

export interface Notificacion {
  tareaId: string
  proyectoId: string
  empresaId: string
  titulo: string
  nivel: NivelNotif
  diasRestantes: number
}

const STORAGE_KEY = 'cronogramas_notif_leidas'

function getLeidas(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

function setLeidas(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
}

export function useNotificaciones() {
  const { tareas } = useMisTareas()
  const [leidas, setLeidasState] = useState<Set<string>>(getLeidas)

  const notificaciones: Notificacion[] = useMemo(() => {
    return tareas
      .filter(t => t.estado !== 'completada' && t.tipo !== 'grupo')
      .map(t => {
        const d = diasRestantes(t.fechaFin)
        const venc = isVencida(t.fechaFin)
        let nivel: NivelNotif | null = null
        if (venc)        nivel = 'vencida'
        else if (d === 0) nivel = 'hoy'
        else if (d === 1) nivel = 'manana'
        else if (d <= 7)  nivel = 'semana'
        if (!nivel) return null
        return {
          tareaId: t.id,
          proyectoId: t.proyectoId,
          empresaId: t.empresaId,
          titulo: t.titulo,
          nivel,
          diasRestantes: d,
        } as Notificacion
      })
      .filter((n): n is Notificacion => n !== null)
      .sort((a, b) => a.diasRestantes - b.diasRestantes)
  }, [tareas])

  const noLeidas = useMemo(
    () => notificaciones.filter(n => !leidas.has(n.tareaId)),
    [notificaciones, leidas]
  )

  const marcarLeida = useCallback((tareaId: string) => {
    setLeidasState(prev => {
      const next = new Set(prev)
      next.add(tareaId)
      setLeidas(next)
      return next
    })
  }, [])

  const marcarTodasLeidas = useCallback(() => {
    const ids = new Set(notificaciones.map(n => n.tareaId))
    setLeidasState(ids)
    setLeidas(ids)
  }, [notificaciones])

  return { notificaciones, noLeidas, marcarLeida, marcarTodasLeidas }
}
