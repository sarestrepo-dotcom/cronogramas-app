import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FolderKanban, CheckSquare, X, ArrowRight } from 'lucide-react'
import { cn, ESTADO_COLORS, ESTADO_LABELS } from '@/lib/utils'
import { fetchTareasGlobal, fetchProyectosGlobal } from '@/lib/firestore'
import { useEmpresas } from '@/hooks/useEmpresas'
import type { Tarea, Proyecto } from '@/types'

interface SearchModalProps {
  onClose: () => void
}

function match(text: string, q: string): boolean {
  return text.toLowerCase().includes(q.toLowerCase())
}

export function SearchModal({ onClose }: SearchModalProps) {
  const { empresas } = useEmpresas()
  const empresaIds = empresas.map(e => e.id)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery]       = useState('')
  const [tareas, setTareas]     = useState<Tarea[]>([])
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [loading, setLoading]   = useState(false)
  const [selected, setSelected] = useState(0)

  // Load all data once on open
  useEffect(() => {
    if (empresaIds.length === 0) return
    setLoading(true)
    Promise.all([
      fetchTareasGlobal(empresaIds),
      fetchProyectosGlobal(empresaIds),
    ]).then(([t, p]) => {
      setTareas(t)
      setProyectos(p)
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaIds.join(',')])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setSelected(0) }, [query])

  const empresaMap = useMemo(() =>
    Object.fromEntries(empresas.map(e => [e.id, e])), [empresas])

  const proyectoMap = useMemo(() =>
    Object.fromEntries(proyectos.map(p => [p.id, p])), [proyectos])

  const q = query.trim()

  const filteredProyectos = useMemo(() => {
    if (!q) return []
    return proyectos.filter(p =>
      match(p.nombre, q) || match(p.objetivo ?? '', q)
    ).slice(0, 5)
  }, [proyectos, q])

  const filteredTareas = useMemo(() => {
    if (!q) return []
    return tareas.filter(t =>
      t.tipo !== 'grupo' &&
      (match(t.titulo, q) || match(t.descripcion ?? '', q) || match(t.fase ?? '', q))
    ).slice(0, 8)
  }, [tareas, q])

  const totalResults = filteredProyectos.length + filteredTareas.length

  // Flat list for keyboard nav: proyectos first, then tareas
  const flatItems = useMemo(() => [
    ...filteredProyectos.map(p => ({ type: 'proyecto' as const, item: p })),
    ...filteredTareas.map(t => ({ type: 'tarea' as const, item: t })),
  ], [filteredProyectos, filteredTareas])

  const goTo = (idx: number) => {
    const entry = flatItems[idx]
    if (!entry) return
    if (entry.type === 'proyecto') {
      const p = entry.item as Proyecto
      navigate(`/empresa/${p.empresaId}/proyecto/${p.id}`)
    } else {
      const t = entry.item as Tarea
      navigate(`/empresa/${t.empresaId}/proyecto/${t.proyectoId}?tarea=${t.id}`)
    }
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown')  { e.preventDefault(); setSelected(s => Math.min(s + 1, flatItems.length - 1)) }
    if (e.key === 'ArrowUp')    { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter')      { goTo(selected) }
    if (e.key === 'Escape')     { onClose() }
  }

  const estadoColor = (estado: string) =>
    ESTADO_COLORS[estado as keyof typeof ESTADO_COLORS] ?? { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200">
          <Search size={18} className="text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar tareas, proyectos..."
            className="flex-1 text-sm text-slate-800 placeholder-slate-400 outline-none bg-transparent"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}
          {!loading && query && (
            <button onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-600">
              <X size={15} />
            </button>
          )}
          <kbd className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 font-mono">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1">
          {!q && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search size={28} className="text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">Escribe para buscar</p>
              <p className="text-xs text-slate-300 mt-1">Tareas, proyectos, fases...</p>
            </div>
          )}

          {q && !loading && totalResults === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-slate-500">Sin resultados para <span className="font-semibold">"{q}"</span></p>
            </div>
          )}

          {filteredProyectos.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Proyectos
              </p>
              {filteredProyectos.map((p, i) => {
                const empresa = empresaMap[p.empresaId]
                const globalIdx = i
                return (
                  <button
                    key={p.id}
                    onClick={() => goTo(globalIdx)}
                    onMouseEnter={() => setSelected(globalIdx)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      selected === globalIdx ? 'bg-indigo-50' : 'hover:bg-slate-50'
                    )}
                  >
                    <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', `bg-${empresa?.color ?? 'indigo'}-100`)}>
                      <FolderKanban size={13} className={cn(`text-${empresa?.color ?? 'indigo'}-600`)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{p.nombre}</p>
                      {p.objetivo && <p className="text-xs text-slate-400 truncate">{p.objetivo}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {empresa && (
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', `bg-${empresa.color}-100 text-${empresa.color}-700`)}>
                          {empresa.nombre}
                        </span>
                      )}
                      <ArrowRight size={13} className="text-slate-300" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {filteredTareas.length > 0 && (
            <div className={filteredProyectos.length > 0 ? 'border-t border-slate-100' : ''}>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Tareas
              </p>
              {filteredTareas.map((t, i) => {
                const globalIdx = filteredProyectos.length + i
                const proyecto = proyectoMap[t.proyectoId]
                const empresa  = empresaMap[t.empresaId]
                const ec = estadoColor(t.estado)
                return (
                  <button
                    key={t.id}
                    onClick={() => goTo(globalIdx)}
                    onMouseEnter={() => setSelected(globalIdx)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      selected === globalIdx ? 'bg-indigo-50' : 'hover:bg-slate-50'
                    )}
                  >
                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <CheckSquare size={13} className="text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{t.titulo}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {t.fase && (
                          <span className="text-[10px] text-indigo-600 font-medium">{t.fase} ·</span>
                        )}
                        <span className="text-xs text-slate-400 truncate">{proyecto?.nombre ?? '—'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', ec.bg, ec.text)}>
                        {ESTADO_LABELS[t.estado as keyof typeof ESTADO_LABELS] ?? t.estado}
                      </span>
                      {empresa && (
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', `bg-${empresa.color}-100 text-${empresa.color}-700`)}>
                          {empresa.nombre}
                        </span>
                      )}
                      <ArrowRight size={13} className="text-slate-300" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Padding bottom */}
          <div className="h-3" />
        </div>

        {/* Footer hint */}
        {totalResults > 0 && (
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex items-center gap-4 text-[10px] text-slate-400">
            <span><kbd className="font-mono bg-white border border-slate-200 rounded px-1">↑↓</kbd> navegar</span>
            <span><kbd className="font-mono bg-white border border-slate-200 rounded px-1">↵</kbd> abrir</span>
            <span><kbd className="font-mono bg-white border border-slate-200 rounded px-1">esc</kbd> cerrar</span>
          </div>
        )}
      </div>
    </div>
  )
}
