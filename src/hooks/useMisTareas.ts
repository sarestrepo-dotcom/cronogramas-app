import { useState, useEffect } from 'react'
import { useAuth } from './useAuth'
import { suscribirMisTareas, getUsuario } from '@/lib/firestore'
import type { Tarea } from '@/types'

export function useMisTareas() {
  const { user } = useAuth()
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setTareas([]); setLoading(false); return }

    let cancelled = false

    const iniciar = async () => {
      const perfil = await getUsuario(user.uid)

      if (cancelled) return

      const base = [user.email, user.displayName, ...(perfil?.aliases ?? [])]
      const identificadores = base
        .filter((s): s is string => !!s && s.trim().length > 0)
        .filter((s, i, arr) => arr.findIndex(x => x.toLowerCase() === s.toLowerCase()) === i)

      setLoading(true)
      const unsub = suscribirMisTareas(identificadores, (data) => {
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
  }, [user?.uid])

  return { tareas, loading }
}
