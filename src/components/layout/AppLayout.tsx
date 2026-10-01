import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { SearchModal } from '@/components/search/SearchModal'
import type { Empresa } from '@/types'

export function AppLayout() {
  const [empresaActiva, setEmpresaActiva] = useState<Empresa | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(s => !s)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar
        empresaActiva={empresaActiva}
        onEmpresaChange={setEmpresaActiva}
        onOpenSearch={() => setSearchOpen(true)}
      />
      <main className="flex-1 overflow-y-auto">
        <Outlet context={{ empresaActiva, setEmpresaActiva }} />
      </main>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  )
}
