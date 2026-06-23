import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { Timestamp, deleteField } from 'firebase/firestore'
import {
  Plus, List, BarChart2, Table2, ArrowLeft, Circle, CheckCircle2,
  Clock, MoreVertical, Trash2, Pencil, Upload, ChevronDown, ChevronRight,
  LayoutDashboard, Columns3, Link2, X, Filter, Printer, LayoutTemplate,
  Users, AlertTriangle, RotateCcw, Settings2, Mail,
} from 'lucide-react'
import { useEmpresas } from '@/hooks/useEmpresas'
import { useTareas } from '@/hooks/useTareas'
import { useAuth } from '@/hooks/useAuth'
import { useUndoStack } from '@/hooks/useUndoStack'
import { crearTarea, actualizarTarea, eliminarTarea, registrarCambio } from '@/lib/firestore'
import { aplicarCascada } from '@/lib/cascadeUtils'
import { calcularRutaCritica } from '@/lib/criticalPath'
import { cn, formatFecha, ESTADO_COLORS, ESTADO_LABELS, PRIORIDAD_COLORS, tsToDate, isVencida, isProximaAVencer } from '@/lib/utils'
import { enrichTareas, buildHierarchy } from '@/lib/hierarchyUtils'
import type { Empresa, Tarea, EstadoTarea, TipoTarea } from '@/types'
import { TareasTabla } from '@/components/tareas/TareasTabla'
import { ImportarTareasModal } from '@/components/tareas/ImportarTareasModal'
import { TareaDetailPanel } from '@/components/tareas/TareaDetailPanel'
import { GanttVisual } from '@/components/gantt/GanttVisual'
import { KanbanView } from '@/components/kanban/KanbanView'
import { ProyectoDashboard } from '@/components/proyecto/ProyectoDashboard'
import { WorkloadView } from '@/components/proyecto/WorkloadView'
import { ProcesarEmailModal } from '@/components/tareas/ProcesarEmailModal'
import { LineasBaseModal } from '@/components/lineasBase/LineasBaseModal'
import { PlantillasModal } from '@/components/plantillas/PlantillasModal'
import { abrirVistaPDF } from '@/components/proyecto/PrintView'

type TopTab = 'cronograma' | 'dashboard'
type Vista = 'lista' | 'tabla' | 'kanban' | 'gantt' | 'carga'

export function ProyectoDetailPage() {
  const { empresaId, proyectoId } = useParams<{ empresaId: string; proyectoId: string }>()
  const { setEmpresaActiva } = useOutletContext<{ empresaActiva: Empresa | null; setEmpresaActiva: (e: Empresa) => void }>()
  const { user } = useAuth()
  const { empresas } = useEmpresas()
  const { tareas, loading } = useTareas(proyectoId ?? null)
  const navigate = useNavigate()

  const { pushUndo, mensaje: undoMensaje } = useUndoStack()

  const [topTab, setTopTab] = useState<TopTab>('cronograma')
  const [vista, setVista] = useState<Vista>('lista')
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showLineasBase, setShowLineasBase] = useState(false)
  const [showPlantillas, setShowPlantillas] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [editTarea, setEditTarea] = useState<Tarea | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [selectedTarea, setSelectedTarea] = useState<Tarea | null>(null)
  const [filtroResponsable, setFiltroResponsable] = useState('')
  const [filtroGrupo, setFiltroGrupo] = useState('')
  const [showProcesarEmail, setShowProcesarEmail] = useState(false)
  const [showHerramientas, setShowHerramientas] = useState(false)

  const empresa = empresas.find((e) => e.id === empresaId)
  const enrichedTareas = useMemo(() => enrichTareas(tareas), [tareas])
  const rutaCritica = useMemo(() => calcularRutaCritica(enrichedTareas), [enrichedTareas])

  const responsables = useMemo(() =>
    [...new Set(tareas.flatMap(t => t.asignadosA?.length ? t.asignadosA : (t.asignadoA ? [t.asignadoA] : [])))].sort(),
    [tareas])
  const grupos = useMemo(() => tareas.filter(t => t.tipo === 'grupo'), [tareas])

  // Salud del proyecto
  const tareasActivas = useMemo(() => enrichedTareas.filter(t => t.tipo !== 'grupo'), [enrichedTareas])
  const vencidasCount = useMemo(() =>
    tareasActivas.filter(t => t.estado !== 'completada' && isVencida(t.fechaFin)).length, [tareasActivas])
  const proximasCount = useMemo(() =>
    tareasActivas.filter(t => t.estado !== 'completada' && !isVencida(t.fechaFin) && isProximaAVencer(t.fechaFin, 3)).length, [tareasActivas])

  const filteredTareas = useMemo(() => {
    if (!filtroResponsable && !filtroGrupo) return enrichedTareas
    return enrichedTareas.filter(t => {
      if (filtroResponsable) {
        const todos = t.asignadosA?.length ? t.asignadosA : (t.asignadoA ? [t.asignadoA] : [])
        if (!todos.includes(filtroResponsable)) return false
      }
      if (filtroGrupo) {
        if (t.id === filtroGrupo) return true
        if (t.parentId !== filtroGrupo) return false
      }
      return true
    })
  }, [enrichedTareas, filtroResponsable, filtroGrupo])

  const hasFilters = filtroResponsable || filtroGrupo

  useEffect(() => {
    if (empresa) setEmpresaActiva(empresa)
  }, [empresa])


  // Wrapper con undo + historial para cambios de estado
  const handleStatusChange = async (id: string, estado: EstadoTarea) => {
    const tarea = enrichedTareas.find(t => t.id === id)
    if (tarea) {
      pushUndo({
        label: `Estado de "${tarea.titulo}"`,
        fn: () => actualizarTarea(id, { estado: tarea.estado, progreso: tarea.progreso }),
      })
      await registrarCambio({
        tareaId: id,
        proyectoId: proyectoId!,
        campo: 'estado',
        valorAnterior: ESTADO_LABELS[tarea.estado],
        valorNuevo: ESTADO_LABELS[estado],
        cambiadoPor: user!.uid,
        cambiadoPorNombre: user!.displayName ?? user!.email ?? 'Usuario',
      })
    }
    await actualizarTarea(id, { estado })
  }

  // Wrapper con undo para cambios de fecha en Gantt
  const handleGanttUpdate = async (id: string, inicio: Date, fin: Date) => {
    const tarea = enrichedTareas.find(t => t.id === id)
    if (tarea) {
      pushUndo({
        label: `Fechas de "${tarea.titulo}"`,
        fn: () => actualizarTarea(id, { fechaInicio: tarea.fechaInicio, fechaFin: tarea.fechaFin }),
      })
    }
    await actualizarTarea(id, {
      fechaInicio: Timestamp.fromDate(inicio),
      fechaFin: Timestamp.fromDate(fin),
    })
    const updates = await aplicarCascada(tareas, id, fin)
    if (updates.length > 0) {
      setImportMsg(`↳ ${updates.length} tarea${updates.length > 1 ? 's' : ''} ajustada${updates.length > 1 ? 's' : ''} por dependencia`)
      setTimeout(() => setImportMsg(''), 4000)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toasts flotantes */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
        {undoMensaje && (
          <div className="bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 pointer-events-auto">
            <RotateCcw size={14} /> {undoMensaje}
          </div>
        )}
        {importMsg && (
          <div className="bg-emerald-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-1.5 pointer-events-auto">
            <CheckCircle2 size={14} /> {importMsg}
          </div>
        )}
      </div>

      {/* ── Menú sticky 2 niveles ─────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white flex-shrink-0">

        {/* Nivel 1: navegación + acción principal */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/empresa/${empresaId}/proyectos`)}
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              <ArrowLeft size={17} />
            </button>
            <div>
              <h1 className="font-semibold text-slate-900 text-sm leading-tight">Proyecto</h1>
              <p className="text-[11px] text-slate-400">{tareas.length} tarea{tareas.length !== 1 ? 's' : ''}</p>
            </div>
            {!loading && tareas.length > 0 && (
              vencidasCount > 0 ? (
                <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  <AlertTriangle size={11} /> {vencidasCount} vencida{vencidasCount !== 1 ? 's' : ''}
                </span>
              ) : proximasCount > 0 ? (
                <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  <Clock size={11} /> {proximasCount} vence{proximasCount !== 1 ? 'n' : ''} pronto
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={11} /> Al día
                </span>
              )
            )}
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
            <Plus size={15} /> Nueva tarea
          </button>
        </div>

        {/* Nivel 2: tabs + vistas + herramientas */}
        <div className="flex items-center gap-2 px-5 py-2 border-b border-slate-100">
          {/* Dashboard / Cronograma */}
          <div className="flex items-center bg-slate-100 rounded-xl p-0.5">
            <button onClick={() => setTopTab('dashboard')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-sm font-medium transition-colors',
                topTab === 'dashboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              <LayoutDashboard size={13} /> Dashboard
            </button>
            <button onClick={() => setTopTab('cronograma')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-sm font-medium transition-colors',
                topTab === 'cronograma' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              <BarChart2 size={13} /> Cronograma
            </button>
          </div>

          {topTab === 'cronograma' && (
            <>
              <div className="w-px h-5 bg-slate-200 mx-1" />

              {/* Selector de vista */}
              <div className="flex items-center bg-slate-100 rounded-xl p-0.5">
                {([
                  ['lista',  <List size={13} />,     'Lista'],
                  ['tabla',  <Table2 size={13} />,   'Tabla'],
                  ['kanban', <Columns3 size={13} />,  'Kanban'],
                  ['gantt',  <BarChart2 size={13} />, 'Gantt'],
                  ['carga',  <Users size={13} />,    'Carga'],
                ] as [Vista, React.ReactNode, string][]).map(([v, icon, label]) => (
                  <button key={v} onClick={() => setVista(v)}
                    className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-sm font-medium transition-colors',
                      vista === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                    {icon} {label}
                  </button>
                ))}
              </div>

              <div className="flex-1" />

              {/* Importar */}
              <button onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-1.5 rounded-xl transition-colors">
                <Upload size={14} /> Importar
              </button>

              {/* Herramientas dropdown */}
              <div className="relative">
                <button onClick={() => setShowHerramientas((v) => !v)}
                  className={cn(
                    'flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl border transition-colors',
                    showHerramientas
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                  )}>
                  <Settings2 size={14} /> Herramientas
                  <ChevronDown size={13} className={cn('transition-transform', showHerramientas && 'rotate-180')} />
                </button>
                {showHerramientas && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowHerramientas(false)} />
                    <div className="absolute right-0 top-10 z-20 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 w-52">
                      <p className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Versiones</p>
                      <button onClick={() => { setShowLineasBase(true); setShowHerramientas(false) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                        <BarChart2 size={14} className="text-amber-500" /> Líneas base
                      </button>
                      <button onClick={() => { setShowPlantillas(true); setShowHerramientas(false) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                        <LayoutTemplate size={14} className="text-violet-500" /> Plantillas
                      </button>
                      <div className="border-t border-slate-100 my-1" />
                      <p className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Exportar / IA</p>
                      <button onClick={() => { abrirVistaPDF(enrichedTareas, undefined); setShowHerramientas(false) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                        <Printer size={14} className="text-slate-500" /> Exportar PDF
                      </button>
                      <button onClick={() => { setShowProcesarEmail(true); setShowHerramientas(false) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                        <Mail size={14} className="text-violet-500" /> Procesar email IA
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Filter bar (cronograma only) */}
      {topTab === 'cronograma' && vista !== 'carga' && (responsables.length > 0 || grupos.length > 0) && (
        <div className="flex items-center gap-3 px-6 py-2 border-b border-slate-100 bg-white flex-shrink-0 flex-wrap">
          <Filter size={13} className="text-slate-400" />
          <select value={filtroResponsable} onChange={e => setFiltroResponsable(e.target.value)}
            className="text-sm border border-slate-200 rounded-xl px-3 py-1.5 text-slate-600 bg-white">
            <option value="">Todos los responsables</option>
            {responsables.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)}
            className="text-sm border border-slate-200 rounded-xl px-3 py-1.5 text-slate-600 bg-white">
            <option value="">Todos los grupos</option>
            {grupos.map(g => <option key={g.id} value={g.id}>{g.titulo}</option>)}
          </select>
          {hasFilters && (
            <button onClick={() => { setFiltroResponsable(''); setFiltroGrupo('') }}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg transition-colors">
              <X size={11} /> Limpiar
            </button>
          )}
          {hasFilters && (
            <span className="text-xs text-slate-400">{filteredTareas.filter(t => t.tipo !== 'grupo').length} tareas</span>
          )}
        </div>
      )}

      {/* Content */}
      <div className={cn('flex-1 min-h-0', vista === 'tabla' && topTab === 'cronograma' ? 'overflow-hidden' : 'overflow-auto')}>
        {topTab === 'dashboard' ? (
          <ProyectoDashboard tareas={enrichedTareas} />
        ) : loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : vista === 'carga' ? (
          <WorkloadView tareas={enrichedTareas} />
        ) : tareas.length === 0 && vista !== 'tabla' ? (
          <EmptyTareas onNew={() => setShowModal(true)} onImport={() => setShowImport(true)} />
        ) : vista === 'tabla' ? (
          <TareasTabla
            tareas={filteredTareas}
            proyectoId={proyectoId!}
            empresaId={empresaId!}
            uid={user!.uid}
            rutaCritica={rutaCritica}
            onEditTarea={(t) => { setEditTarea(t); setShowModal(true) }}
            onRowClick={(t) => setSelectedTarea(t)}
          />
        ) : vista === 'kanban' ? (
          <KanbanView
            tareas={filteredTareas}
            onStatusChange={handleStatusChange}
            onRowClick={(t) => setSelectedTarea(t)}
          />
        ) : vista === 'lista' ? (
          <TareasList
            tareas={filteredTareas}
            menuOpen={menuOpen}
            rutaCritica={rutaCritica}
            onMenuToggle={(id) => setMenuOpen(menuOpen === id ? null : id)}
            onMenuClose={() => setMenuOpen(null)}
            onEdit={(t) => setSelectedTarea(t)}
            onDelete={async (id) => { if (confirm('¿Eliminar tarea?')) await eliminarTarea(id) }}
            onStatusChange={handleStatusChange}
            onRowClick={(t) => setSelectedTarea(t)}
          />
        ) : (
          <GanttVisual
            tareas={filteredTareas}
            rutaCritica={rutaCritica}
            onUpdate={handleGanttUpdate}
            onTareaClick={(t) => setSelectedTarea(t)}
            onReparent={async (taskId, newParentId) => {
              await actualizarTarea(taskId, { parentId: newParentId ?? undefined })
            }}
            onToggleDependency={async (taskId, depId) => {
              const t = tareas.find((x) => x.id === taskId)
              if (!t) return
              const deps = t.dependencias ?? []
              await actualizarTarea(taskId, {
                dependencias: deps.includes(depId) ? deps.filter((d) => d !== depId) : [...deps, depId],
              })
            }}
          />
        )}
      </div>

      {/* Modal tarea */}
      {showModal && proyectoId && empresaId && (
        <TareaModal
          tarea={editTarea}
          proyectoId={proyectoId}
          empresaId={empresaId}
          uid={user!.uid}
          tareas={tareas}
          onClose={() => { setShowModal(false); setEditTarea(null) }}
          onCascade={(count) => {
            setImportMsg(`↳ ${count} tarea${count > 1 ? 's' : ''} ajustada${count > 1 ? 's' : ''} por dependencia`)
            setTimeout(() => setImportMsg(''), 4000)
          }}
        />
      )}

      {/* Detail panel */}
      {selectedTarea && (
        <TareaDetailPanel
          tarea={selectedTarea}
          tareas={tareas}
          onClose={() => setSelectedTarea(null)}
          onEdit={(t) => { setSelectedTarea(null); setEditTarea(t); setShowModal(true) }}
          onDelete={async (id) => { await eliminarTarea(id) }}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Modal procesar email */}
      {showProcesarEmail && proyectoId && empresaId && (
        <ProcesarEmailModal
          proyectoId={proyectoId}
          empresaId={empresaId}
          uid={user!.uid}
          tareas={enrichedTareas}
          onClose={() => setShowProcesarEmail(false)}
          onAplicado={(count) => {
            setShowProcesarEmail(false)
            setImportMsg(`✓ ${count} actualización${count !== 1 ? 'es' : ''} aplicada${count !== 1 ? 's' : ''}`)
            setTimeout(() => setImportMsg(''), 4000)
          }}
        />
      )}

      {/* Modal importar */}
      {showImport && proyectoId && empresaId && (
        <ImportarTareasModal
          proyectoId={proyectoId}
          empresaId={empresaId}
          uid={user!.uid}
          onClose={() => setShowImport(false)}
          onImportado={(count) => {
            setImportMsg(`✓ ${count} tarea${count !== 1 ? 's' : ''} importada${count !== 1 ? 's' : ''}`)
            setTimeout(() => setImportMsg(''), 4000)
            setVista('tabla')
          }}
        />
      )}

      {/* Modal líneas base */}
      {showLineasBase && proyectoId && (
        <LineasBaseModal
          proyectoId={proyectoId}
          uid={user!.uid}
          tareas={enrichedTareas}
          onClose={() => setShowLineasBase(false)}
        />
      )}

      {/* Modal plantillas */}
      {showPlantillas && proyectoId && empresaId && (
        <PlantillasModal
          empresaId={empresaId}
          proyectoId={proyectoId}
          uid={user!.uid}
          tareas={enrichedTareas}
          onClose={() => setShowPlantillas(false)}
          onAplicada={(count) => {
            setShowPlantillas(false)
            setImportMsg(`✓ ${count} tarea${count !== 1 ? 's' : ''} creada${count !== 1 ? 's' : ''} desde plantilla`)
            setTimeout(() => setImportMsg(''), 4000)
          }}
        />
      )}
    </div>
  )
}

// ─── Lista de tareas ──────────────────────────────────────────────────────────

function TareasList({ tareas, menuOpen, rutaCritica, onMenuToggle, onMenuClose, onEdit, onDelete, onStatusChange, onRowClick }: {
  tareas: Tarea[]
  menuOpen: string | null
  rutaCritica?: Set<string>
  onMenuToggle: (id: string) => void
  onMenuClose: () => void
  onEdit: (t: Tarea) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, estado: EstadoTarea) => void
  onRowClick: (t: Tarea) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [collapsedFases, setCollapsedFases] = useState<Set<string>>(new Set())
  const rows = buildHierarchy(tareas)

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const toggleFase = (fase: string) =>
    setCollapsedFases((prev) => { const s = new Set(prev); s.has(fase) ? s.delete(fase) : s.add(fase); return s })

  return (
    <div className="p-6 space-y-1 max-w-4xl mx-auto">
      {(() => {
        let currentFase: string | null = null
        return rows.map((row, rowIdx) => {
        if (row.kind === 'fase_header') {
          currentFase = row.label
          const isFaseCollapsed = collapsedFases.has(row.label)
          return (
            <div key={`fase-${row.label}-${rowIdx}`} className="mt-5 first:mt-0 mb-1">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-indigo-200" />
                <button
                  onClick={() => toggleFase(row.label)}
                  className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1 hover:bg-indigo-100 transition-colors"
                >
                  {isFaseCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                  {row.label}
                </button>
                <div className="h-px flex-1 bg-indigo-200" />
              </div>
            </div>
          )
        }

        const { tarea, nivel } = row
        const isGrupo = tarea.tipo === 'grupo'
        const isCollapsed = collapsed.has(tarea.id)

        if (currentFase && collapsedFases.has(currentFase)) return null

        if (nivel > 0) {
          const parent = tareas.find((t) => t.id === tarea.parentId)
          if (parent && collapsed.has(parent.id)) return null
        }

        if (isGrupo) {
          return (
            <div key={tarea.id} className="mt-4 first:mt-0">
              <div className="flex items-center gap-2 mb-1.5 px-2">
                <button onClick={() => toggleCollapse(tarea.id)} className="text-slate-400 hover:text-slate-600">
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
                <div className={cn('w-2 h-2 rounded-full', ESTADO_COLORS[tarea.estado].dot)} />
                <span
                  onClick={() => onRowClick(tarea)}
                  className="text-sm font-semibold text-slate-700 cursor-pointer hover:text-indigo-600 flex-1"
                >
                  ▶ {tarea.titulo}
                </span>
                <span className="text-xs text-slate-400">{tarea.progreso}%</span>
                <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${tarea.progreso}%` }} />
                </div>
              </div>
              {!isCollapsed && (
                <div className="ml-6 space-y-1.5 pl-3 border-l-2 border-slate-200" />
              )}
            </div>
          )
        }

        return (
          <div key={tarea.id} style={{ paddingLeft: nivel > 0 ? 28 : 0 }}>
            <TareaRow
              tarea={tarea}
              menuOpen={menuOpen === tarea.id}
              esCritica={rutaCritica?.has(tarea.id) ?? false}
              onMenuToggle={() => onMenuToggle(tarea.id)}
              onMenuClose={onMenuClose}
              onEdit={() => onEdit(tarea)}
              onDelete={() => onDelete(tarea.id)}
              onStatusChange={(e) => onStatusChange(tarea.id, e)}
              onClick={() => onRowClick(tarea)}
            />
          </div>
        )
      })
      })()}
    </div>
  )
}

function TareaRow({ tarea, menuOpen, esCritica, onMenuToggle, onMenuClose, onEdit, onDelete, onStatusChange, onClick }: {
  tarea: Tarea
  menuOpen: boolean
  esCritica?: boolean
  onMenuToggle: () => void
  onMenuClose: () => void
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (e: EstadoTarea) => void
  onClick: () => void
}) {
  const prioridadColor = PRIORIDAD_COLORS[tarea.prioridad]
  const [showEstados, setShowEstados] = useState(false)
  const ESTADOS: EstadoTarea[] = ['pendiente', 'en_progreso', 'completada', 'bloqueada']

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-4 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer"
    >
      <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setShowEstados(!showEstados)} className="text-slate-400 hover:text-indigo-500 transition-colors">
          {tarea.estado === 'completada' ? <CheckCircle2 size={20} className="text-emerald-500" /> : <Circle size={20} />}
        </button>
        {showEstados && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowEstados(false)} />
            <div className="absolute left-0 top-7 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-44">
              {ESTADOS.map((e) => (
                <button key={e} onClick={() => { onStatusChange(e); setShowEstados(false) }}
                  className={cn('w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50', tarea.estado === e ? 'font-medium text-indigo-600' : 'text-slate-700')}>
                  <div className={cn('w-2 h-2 rounded-full', ESTADO_COLORS[e].dot)} /> {ESTADO_LABELS[e]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {esCritica && (
            <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500" title="Ruta crítica" />
          )}
          {(tarea.tipo === 'hito' || tarea.tipo === 'grupo') && (
            <span className="text-xs font-bold text-slate-400">{tarea.tipo === 'hito' ? '◆' : '▶'}</span>
          )}
          <p className={cn('text-sm font-medium text-slate-900 truncate', tarea.estado === 'completada' && 'line-through text-slate-400')}>
            {tarea.titulo}
          </p>
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Clock size={11} /> {formatFecha(tarea.fechaInicio)} – {formatFecha(tarea.fechaFin)}
          </span>
          {(tarea.asignadosA?.length ? tarea.asignadosA : (tarea.asignadoA ? [tarea.asignadoA] : [])).map((r, i) => (
            <span key={i} className="text-xs text-slate-500 flex items-center gap-1">
              <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 text-[9px] font-bold flex items-center justify-center">
                {r.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
              </span>
              {r}
            </span>
          ))}
          {tarea.progreso > 0 && <span className="text-xs text-slate-400">{tarea.progreso}%</span>}
          {(tarea.dependencias?.length ?? 0) > 0 && (
            <span className="text-xs text-slate-400 flex items-center gap-0.5">
              <span>🔗</span>{tarea.dependencias.length}
            </span>
          )}
        </div>
      </div>

      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full hidden sm:inline-flex', prioridadColor.bg, prioridadColor.text)}>
        {tarea.prioridad}
      </span>

      <div className="relative flex-shrink-0">
        <button onClick={onMenuToggle} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
          <MoreVertical size={15} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={onMenuClose} />
            <div className="absolute right-0 top-8 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-36">
              <button onClick={() => { onEdit(); onMenuClose() }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <Pencil size={13} /> Editar
              </button>
              <button onClick={() => { onDelete(); onMenuClose() }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                <Trash2 size={13} /> Eliminar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Modal tarea ──────────────────────────────────────────────────────────────

function TareaModal({ tarea, proyectoId, empresaId, uid, tareas, onClose, onCascade }: {
  tarea: Tarea | null
  proyectoId: string
  empresaId: string
  uid: string
  tareas: Tarea[]
  onClose: () => void
  onCascade?: (count: number) => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [titulo, setTitulo] = useState(tarea?.titulo ?? '')
  const [descripcion, setDescripcion] = useState(tarea?.descripcion ?? '')
  const [tipo, setTipo] = useState<TipoTarea>(tarea?.tipo ?? 'tarea')
  const [parentId, setParentId] = useState(tarea?.parentId ?? '')
  const [fechaInicio, setFechaInicio] = useState(
    tarea ? tsToDate(tarea.fechaInicio).toISOString().split('T')[0] : today
  )
  const [fechaFin, setFechaFin] = useState(
    tarea ? tsToDate(tarea.fechaFin).toISOString().split('T')[0] : ''
  )
  const [estado, setEstado] = useState<EstadoTarea>(tarea?.estado ?? 'pendiente')
  const [prioridad, setPrioridad] = useState(tarea?.prioridad ?? 'media')
  const [progreso, setProgreso] = useState(tarea?.progreso ?? 0)
  const [responsables, setResponsables] = useState<string[]>(
    tarea ? (tarea.asignadosA?.length ? tarea.asignadosA : (tarea.asignadoA ? [tarea.asignadoA] : [])) : []
  )
  const [newResp, setNewResp] = useState('')

  const addResp = () => {
    const trimmed = newResp.trim()
    if (trimmed && !responsables.includes(trimmed)) {
      setResponsables([...responsables, trimmed])
    }
    setNewResp('')
  }
  const [dependencias, setDependencias] = useState<string[]>(tarea?.dependencias ?? [])
  const [links, setLinks] = useState<string[]>(tarea?.links ?? [])
  const [newLink, setNewLink] = useState('')
  const [fase, setFase] = useState(tarea?.fase ?? '')
  const [notas, setNotas] = useState(tarea?.notas ?? '')
  const [saving, setSaving] = useState(false)

  const fasesExistentes = [...new Set(tareas.map(t => t.fase).filter(Boolean) as string[])].sort()
  const posiblesParents = tareas.filter((t) => t.id !== tarea?.id && (t.tipo === 'grupo' || !t.parentId))
  const posiblesDependencias = tareas.filter((t) => t.id !== tarea?.id)

  const toggleDep = (id: string) =>
    setDependencias((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const fin = tipo === 'hito' ? fechaInicio : fechaFin
    const fiDate = new Date(fechaInicio + 'T00:00:00')
    const ffDate = new Date(fin + 'T23:59:59')
    if (!titulo.trim() || !fechaFin) return
    if (isNaN(fiDate.getTime()) || fiDate.getFullYear() > 9999) return
    if (isNaN(ffDate.getTime()) || ffDate.getFullYear() > 9999) return
    setSaving(true)
    try {
      const data: Partial<Tarea> = {
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        tipo,
        parentId: parentId || undefined,
        fechaInicio: Timestamp.fromDate(fiDate),
        fechaFin: Timestamp.fromDate(ffDate),
        estado,
        prioridad: prioridad as Tarea['prioridad'],
        progreso,
        asignadoA: responsables[0] || undefined,
        asignadosA: responsables.length > 0 ? responsables : undefined,
        dependencias,
        links: links.filter(l => l.trim()),
        fase: fase.trim() || undefined,
        notas: notas.trim() || undefined,
      }
      if (tarea) {
        const update: Record<string, unknown> = { ...data }
        if (!parentId && tarea.parentId) update.parentId = deleteField()
        await actualizarTarea(tarea.id, update as Partial<Tarea>)
        const updates = await aplicarCascada(tareas, tarea.id, ffDate)
        if (updates.length > 0) onCascade?.(updates.length)
      } else {
        await crearTarea({
          ...data,
          proyectoId,
          empresaId,
          creadoPor: uid,
        } as Omit<Tarea, 'id' | 'creadoEn' | 'actualizadoEn'>)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-slate-900">{tarea ? 'Editar tarea' : 'Nueva tarea'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Tipo">
            <div className="flex gap-2">
              {([['tarea', '— Tarea', 'bg-slate-100 text-slate-700'], ['grupo', '▶ Grupo / Fase', 'bg-indigo-100 text-indigo-700'], ['hito', '◆ Hito', 'bg-rose-100 text-rose-700']] as [TipoTarea, string, string][]).map(([val, label, cls]) => (
                <button key={val} type="button" onClick={() => setTipo(val)}
                  className={cn('flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all', tipo === val ? cls + ' border-current' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300')}>
                  {label}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="Fase (opcional)">
            {fasesExistentes.length > 0 ? (
              <div className="space-y-1.5">
                <select className="input-base" value={fasesExistentes.includes(fase) ? fase : ''} onChange={(e) => setFase(e.target.value)}>
                  <option value="">— Sin fase / escribir abajo</option>
                  {fasesExistentes.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <input className="input-base text-xs" value={fase} onChange={(e) => setFase(e.target.value)} placeholder="O escribe una fase nueva..." />
              </div>
            ) : (
              <input className="input-base" value={fase} onChange={(e) => setFase(e.target.value)} placeholder="Ej: F1 - Cimentar" />
            )}
          </FormField>

          <FormField label="Título">
            <input className="input-base" value={titulo} onChange={(e) => setTitulo(e.target.value)}
              placeholder={tipo === 'grupo' ? 'Ej: Fase de diseño' : tipo === 'hito' ? 'Ej: Entrega al cliente' : 'Ej: Diseño de pantallas'}
              required />
          </FormField>
          <FormField label="Descripción (opcional)">
            <textarea className="input-base resize-none" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </FormField>

          {tipo !== 'grupo' && posiblesParents.length > 0 && (
            <FormField label="Tarea padre (opcional)">
              <select className="input-base" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">— Sin padre (tarea raíz)</option>
                {posiblesParents.map((p) => (
                  <option key={p.id} value={p.id}>{p.tipo === 'grupo' ? '▶ ' : ''}{p.titulo}</option>
                ))}
              </select>
            </FormField>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FormField label={tipo === 'hito' ? 'Fecha del hito' : 'Fecha inicio'}>
              <input className="input-base" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} required />
            </FormField>
            {tipo !== 'hito' && (
              <FormField label="Fecha fin">
                <input className="input-base" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} min={fechaInicio} required />
              </FormField>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Estado">
              <select className="input-base" value={estado} onChange={(e) => setEstado(e.target.value as EstadoTarea)}>
                <option value="pendiente">Pendiente</option>
                <option value="en_progreso">En progreso</option>
                <option value="completada">Completada</option>
                <option value="bloqueada">Bloqueada</option>
              </select>
            </FormField>
            <FormField label="Prioridad">
              <select className="input-base" value={prioridad} onChange={(e) => setPrioridad(e.target.value as Tarea['prioridad'])}>
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </FormField>
          </div>
          {tipo === 'tarea' && (
            <FormField label={`Progreso: ${progreso}%`}>
              <input type="range" min={0} max={100} value={progreso} onChange={(e) => setProgreso(Number(e.target.value))}
                className="w-full accent-indigo-600" />
            </FormField>
          )}

          <FormField label="Responsable(s) (opcional)">
            <div className="space-y-2">
              {responsables.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {responsables.map((r, i) => (
                    <span key={i} className="flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium px-2.5 py-1 rounded-full">
                      {r}
                      <button type="button" onClick={() => setResponsables(responsables.filter((_, j) => j !== i))}
                        className="text-indigo-400 hover:text-indigo-700 ml-0.5 leading-none">×</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input className="input-base flex-1" value={newResp} onChange={(e) => setNewResp(e.target.value)}
                  placeholder="Nombre de quien está a cargo..."
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addResp() } }} />
                {newResp.trim() && (
                  <button type="button" onClick={addResp}
                    className="flex-shrink-0 px-3 py-2 text-sm bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl transition-colors">
                    Agregar
                  </button>
                )}
              </div>
            </div>
          </FormField>

          {posiblesDependencias.length > 0 && (
            <FormField label="Depende de (opcional)">
              <div className="border border-slate-200 rounded-xl max-h-36 overflow-y-auto divide-y divide-slate-100">
                {posiblesDependencias.map((t) => (
                  <label key={t.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" className="accent-indigo-600 flex-shrink-0"
                      checked={dependencias.includes(t.id)} onChange={() => toggleDep(t.id)} />
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {t.tipo === 'hito' ? '◆' : t.tipo === 'grupo' ? '▶' : '—'}
                    </span>
                    <span className="text-sm text-slate-700 truncate">{t.titulo}</span>
                  </label>
                ))}
              </div>
            </FormField>
          )}

          <FormField label="Notas / IA (opcional)">
            <textarea className="input-base resize-none" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas internas, contexto de IA, acuerdos..." />
          </FormField>

          <FormField label="Links y entregables (opcional)">
            <div className="space-y-2">
              {links.map((link, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-indigo-600 bg-indigo-50 rounded-xl px-3 py-1.5 truncate">{link}</span>
                  <button type="button" onClick={() => setLinks(links.filter((_, idx) => idx !== i))}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                    <X size={13} />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input className="input-base flex-1" value={newLink} onChange={e => setNewLink(e.target.value)}
                  placeholder="https://..." type="url"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const v = newLink.trim()
                      if (v) { setLinks([...links, v]); setNewLink('') }
                    }
                  }} />
                <button type="button"
                  onClick={() => { const v = newLink.trim(); if (v) { setLinks([...links, v]); setNewLink('') } }}
                  className="flex items-center gap-1 px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors">
                  <Link2 size={13} /> Agregar
                </button>
              </div>
            </div>
          </FormField>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando...' : tarea ? 'Guardar cambios' : 'Crear'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  )
}

function EmptyTareas({ onNew, onImport }: { onNew: () => void; onImport: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
        <BarChart2 size={28} className="text-indigo-500" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">Sin tareas todavía</h3>
      <p className="text-slate-500 text-sm mb-6 max-w-sm">Agrega tareas una por una o importa desde Excel.</p>
      <div className="flex items-center gap-3">
        <button onClick={onImport} className="btn-secondary flex items-center gap-2">
          <Upload size={15} /> Importar desde Excel
        </button>
        <button onClick={onNew} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nueva tarea
        </button>
      </div>
    </div>
  )
}
