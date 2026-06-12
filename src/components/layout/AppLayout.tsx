import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import type { Empresa } from '@/types'

export function AppLayout() {
  const [empresaActiva, setEmpresaActiva] = useState<Empresa | null>(null)

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar empresaActiva={empresaActiva} onEmpresaChange={setEmpresaActiva} />
      <main className="flex-1 overflow-y-auto">
        <Outlet context={{ empresaActiva, setEmpresaActiva }} />
      </main>
    </div>
  )
}
