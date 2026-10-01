import { useState, useEffect } from 'react'
import { useAuth } from './useAuth'
import { useEmpresas } from './useEmpresas'
import { suscribirMisTareas, getUsuario } from '@/lib/firestore'
import type { Tarea } from '@/types'

export function useMisTareas() {
  const { user, permiso } = useAuth()
  const { empresas, loading: loadingEmpresas } = useEmpresas()
  const empresaIds = [...new Set([...empresas.map(e => e.id), ...(permiso?.empresas ?? [])])]
  const compartidos = permiso?.proyectosCompartidos ?? []
  const empresasKey = empresaIds.sort().join(',')
  const compartidosKey = [...compartidos].sort().join(',')
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setTareas([]); setLoading(false); return }
    if (loadingEmpresas) return

    let cancelled = false

    const iniciar = async () => {
      const perfil = await getUsuario(user.uid)

      if (cancelled) return

      const base = [user.email, user.displayName, ...(perfil?.aliases ?? [])]
      const identificadores = base
        .filter((s): s is string => !!s && s.trim().length > 0)
        .filter((s, i, arr) => arr.findIndex(x => x.toLowerCase() === s.toLowerCase()) === i)

      setLoading(true)
      const unsub = suscribirMisTareas(identificadores, empresasKey ? empresasKey.split(',') : [], compartidosKey ? compartidosKey.split(',') : [], (data) => {
        if (!cancelled) {
          setTareas(data.filter(t => t.tipo !== 'grupo'))
          setLoading(false)
        }
      })

      return unsub
    }

    let unsubRef: (() => void) | undefined
    iniciar().then(u => { unsubRef = u })

    return () => {
      cancelled = true
      unsubRef?.()
    }
  }, [user?.uid, loadingEmpresas, empresasKey, compartidosKey])

  return { tareas, loading }
}
