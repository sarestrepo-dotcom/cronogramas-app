import { useState, useEffect } from 'react'
import { suscribirTareasPorProyecto, suscribirTareasProximasAVencer } from '@/lib/firestore'
import type { Tarea } from '@/types'

export function useTareas(proyectoId: string | null) {
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!proyectoId) { setTareas([]); setLoading(false); return }
    setLoading(true)
    const unsub = suscribirTareasPorProyecto(proyectoId, (data) => {
      setTareas(data)
      setLoading(false)
    })
    return unsub
  }, [proyectoId])

  return { tareas, loading }
}

export function useTareasProximas(empresaIds: string[], dias = 14) {
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (empresaIds.length === 0) { setTareas([]); setLoading(false); return }
    setLoading(true)
    const unsub = suscribirTareasProximasAVencer(empresaIds, dias, (data) => {
      setTareas(data)
      setLoading(false)
    })
    return unsub
  }, [empresaIds.join(','), dias])

  return { tareas, loading }
}
