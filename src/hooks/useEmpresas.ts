import { useState, useEffect } from 'react'
import { suscribirEmpresasDeUsuario, suscribirEmpresasPorIds } from '@/lib/firestore'
import { useAuth } from './useAuth'
import type { Empresa } from '@/types'

export function useEmpresas() {
  const { user, permiso, isAdmin } = useAuth()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !permiso) { setEmpresas([]); setLoading(false); return }
    setLoading(true)

    let unsub: () => void

    if (isAdmin) {
      // Admins see every company they belong to (or all companies via owner role)
      unsub = suscribirEmpresasDeUsuario(user.uid, (data) => {
        setEmpresas(data)
        setLoading(false)
      })
    } else {
      // Regular users: only the companies explicitly assigned in their permiso
      const ids = permiso.empresas ?? []
      unsub = suscribirEmpresasPorIds(ids, (data) => {
        setEmpresas(data)
        setLoading(false)
      })
    }

    return unsub
  }, [user?.uid, isAdmin, permiso?.empresas?.join(',')])

  return { empresas, loading }
}
