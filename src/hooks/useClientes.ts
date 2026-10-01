import { useState, useEffect } from 'react'
import { suscribirClientes } from '@/lib/firestore'
import type { Cliente } from '@/types'

export function useClientes(empresaId: string | null) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!empresaId) { setClientes([]); setLoading(false); return }
    setLoading(true)
    const unsub = suscribirClientes(
      empresaId,
      (data) => { setClientes(data); setLoading(false) },
      () => { setClientes([]); setLoading(false) }
    )
    return unsub
  }, [empresaId])

  return { clientes, loading }
}
