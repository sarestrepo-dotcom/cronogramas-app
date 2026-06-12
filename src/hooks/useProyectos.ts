import { useState, useEffect } from 'react'
import { suscribirProyectosPorEmpresa, suscribirTodosProyectosDeUsuario } from '@/lib/firestore'
import { useAuth } from './useAuth'
import type { Proyecto } from '@/types'

export function useProyectos(empresaId: string | null) {
  const { user } = useAuth()
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !empresaId) { setProyectos([]); setLoading(false); return }
    setLoading(true)
    const unsub = suscribirProyectosPorEmpresa(empresaId, user.uid, (data) => {
      setProyectos(data)
      setLoading(false)
    })
    return unsub
  }, [user, empresaId])

  return { proyectos, loading }
}

export function useTodosProyectos(empresaIds: string[]) {
  const { user } = useAuth()
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || empresaIds.length === 0) { setProyectos([]); setLoading(false); return }
    setLoading(true)
    const unsub = suscribirTodosProyectosDeUsuario(user.uid, empresaIds, (data) => {
      setProyectos(data)
      setLoading(false)
    })
    return unsub
  }, [user, empresaIds.join(',')])

  return { proyectos, loading }
}
