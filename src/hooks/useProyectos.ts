import { useState, useEffect } from 'react'
import { suscribirProyectosPorEmpresa, suscribirTodosProyectosDeUsuario, suscribirProyectosCompartidosConUsuario, suscribirPermisoUsuario } from '@/lib/firestore'
import { useAuth } from './useAuth'
import type { Proyecto, UsuarioPermitido } from '@/types'

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

export function useProyectosCompartidos(misEmpresaIds: string[]) {
  const { user, permiso } = useAuth()
  const [proyectoIds, setProyectoIds] = useState<string[]>([])
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [loading, setLoading] = useState(false)

  // Step 1: subscribe to the permiso doc to get proyectosCompartidos in real-time
  useEffect(() => {
    if (!user || !permiso?.email) { setProyectoIds([]); return }
    const unsub = suscribirPermisoUsuario(permiso.email, (p: UsuarioPermitido | null) => {
      setProyectoIds(p?.proyectosCompartidos ?? [])
    })
    return unsub
  }, [user?.uid, permiso?.email])

  // Step 2: when IDs change, subscribe to the actual project documents
  useEffect(() => {
    if (proyectoIds.length === 0) { setProyectos([]); setLoading(false); return }
    setLoading(true)
    const unsub = suscribirProyectosCompartidosConUsuario(proyectoIds, misEmpresaIds, (data) => {
      setProyectos(data)
      setLoading(false)
    })
    return unsub
  }, [proyectoIds.join(','), misEmpresaIds.join(',')])

  return { proyectos, loading }
}
