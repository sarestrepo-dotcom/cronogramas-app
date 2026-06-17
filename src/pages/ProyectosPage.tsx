import { useState, useEffect } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { Plus, FolderKanban, Calendar, MoreVertical, Trash2, ExternalLink, Users, Share2, UserPlus, X } from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import { useProyectos } from '@/hooks/useProyectos'
import { useEmpresas } from '@/hooks/useEmpresas'
import { useAuth } from '@/hooks/useAuth'
import { crearProyecto, eliminarProyecto, agregarMiembroProyecto, removerMiembroProyecto, buscarUsuarioPorEmail, getUsuario } from '@/lib/firestore'
import { cn, formatFecha } from '@/lib/utils'
import type { Empresa, Proyecto, Rol, UsuarioApp } from '@/types'
import { COLORES_EMPRESAS as COLORES_MAP } from '@/types'

const ESTADO_CONFIG = {
  activo:     { label: 'Activo',     bg: 'bg-emerald-100', text: 'text-emerald-700' },
  pausado:    { label: 'Pausado',    bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  completado: { label: 'Completado', bg: 'bg-slate-100',   text: 'text-slate-600'   },
  archivado:  { label: 'Archivado',  bg: 'bg-slate-100',   text: 'text-slate-400'   },
}

const COLORES_PROYECTO = ['indigo', 'blue', 'violet', 'emerald', 'rose', 'amber', 'cyan', 'slate']

export function ProyectosPage() {
  const { empresaId } = useParams<{ empresaId: string }>()
  const { setEmpresaActiva } = useOutletContext<{ empresaActiva: Empresa | null; setEmpresaActiva: (e: Empresa) => void }>()
  const { user } = useAuth()
  const { empresas } = useEmpresas()
  const { proyectos, loading } = useProyectos(empresaId ?? null)
  const navigate = useNavigate()

  const [showModal, setShowModal] = useState(false)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [compartirProyecto, setCompartirProyecto] = useState<Proyecto | null>(null)

  const empresa = empresas.find((e) => e.id === empresaId)
  const miRol = empresa?.miembros[user!.uid] as Rol | undefined
  const puedoCompartir = miRol === 'owner' || miRol === 'admin'

  useEffect(() => {
    if (empresa) setEmpresaActiva(empresa)
  }, [empresa])

  if (loading) return <PageLoader />

  const coloresEmpresa = COLORES_MAP[empresa?.color ?? 'indigo'] ?? COLORES_MAP.indigo

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            {empresa && (
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm', coloresEmpresa.bg)}>
                {empresa.nombre[0]}
              </div>
            )}
            <h1 className="text-2xl font-bold text-slate-900">
              {empresa?.nombre ?? 'Proyectos'}
            </h1>
          </div>
          <p className="text-slate-500 text-sm">{proyectos.length} proyecto{proyectos.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus size={16} />
          Nuevo proyecto
        </button>
      </div>

      {/* Grid */}
      {proyectos.length === 0 ? (
        <EmptyState onNew={() => setShowModal(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {proyectos.map((proyecto) => (
            <ProyectoCard
              key={proyecto.id}
              proyecto={proyecto}
              puedoCompartir={puedoCompartir}
              menuOpen={menuOpen === proyecto.id}
              onMenuToggle={() => setMenuOpen(menuOpen === proyecto.id ? null : proyecto.id)}
              onMenuClose={() => setMenuOpen(null)}
              onAbrir={() => navigate(`/empresa/${empresaId}/proyecto/${proyecto.id}`)}
              onCompartir={() => { setCompartirProyecto(proyecto); setMenuOpen(null) }}
              onEliminar={async () => { if (confirm('¿Eliminar proyecto?')) await eliminarProyecto(proyecto.id) }}
            />
          ))}
        </div>
      )}

      {showModal && empresa && (
        <CrearProyectoModal
          empresa={empresa}
          uid={user!.uid}
          onClose={() => setShowModal(false)}
          onCreate={(id) => { setShowModal(false); navigate(`/empresa/${empresaId}/proyecto/${id}`) }}
        />
      )}

      {compartirProyecto && (
        <CompartirProyectoModal
          proyecto={compartirProyecto}
          miUid={user!.uid}
          onClose={() => setCompartirProyecto(null)}
        />
      )}
    </div>
  )
}

function ProyectoCard({ proyecto, puedoCompartir, menuOpen, onMenuToggle, onMenuClose, onAbrir, onCompartir, onEliminar }: {
  proyecto: Proyecto
  puedoCompartir: boolean
  menuOpen: boolean
  onMenuToggle: () => void
  onMenuClose: () => void
  onAbrir: () => void
  onCompartir: () => void
  onEliminar: () => void
}) {
  const colores = COLORES_MAP[proyecto.color] ?? COLORES_MAP.indigo
  const estado = ESTADO_CONFIG[proyecto.estado]
  const miembrosCount = Object.keys(proyecto.miembros).length

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
      onClick={onAbrir}
    >
      <div className={cn('h-1.5', colores.bg)} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={cn('px-2.5 py-1 rounded-full text-xs font-medium', estado.bg, estado.text)}>
            {estado.label}
          </div>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={onMenuToggle} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={onMenuClose} />
                <div className="absolute right-0 top-8 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-44">
                  <button onClick={() => { onAbrir(); onMenuClose() }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                    <ExternalLink size={14} /> Abrir
                  </button>
                  {puedoCompartir && (
                    <button onClick={onCompartir} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      <Share2 size={14} /> Compartir
                    </button>
                  )}
                  <button onClick={() => { onEliminar(); onMenuClose() }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                    <Trash2 size={14} /> Eliminar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <h3 className="font-semibold text-slate-900 mb-1">{proyecto.nombre}</h3>
        {proyecto.descripcion && <p className="text-slate-500 text-sm mb-3 line-clamp-2">{proyecto.descripcion}</p>}

        <div className="space-y-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Calendar size={13} />
            <span>{formatFecha(proyecto.fechaInicio)} → {formatFecha(proyecto.fechaFin)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users size={13} />
            <span>{miembrosCount} miembro{miembrosCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function CrearProyectoModal({ empresa, uid, onClose, onCreate }: {
  empresa: Empresa
  uid: string
  onClose: () => void
  onCreate: (id: string) => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [color, setColor] = useState(empresa.color ?? 'indigo')
  const [fechaInicio, setFechaInicio] = useState(today)
  const [fechaFin, setFechaFin] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim() || !fechaFin) return
    setSaving(true)
    try {
      const id = await crearProyecto({
        empresaId: empresa.id,
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        color,
        estado: 'activo',
        fechaInicio: Timestamp.fromDate(new Date(fechaInicio + 'T00:00:00')),
        fechaFin: Timestamp.fromDate(new Date(fechaFin + 'T23:59:59')),
        creadoPor: uid,
        miembros: { [uid]: 'owner' },
      } as Omit<Proyecto, 'id' | 'creadoEn'>)
      onCreate(id)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Nuevo proyecto" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Nombre del proyecto">
          <input className="input-base" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Rediseño web" required />
        </FormField>
        <FormField label="Descripción (opcional)">
          <textarea className="input-base resize-none" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="¿De qué trata el proyecto?" />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Fecha inicio">
            <input className="input-base" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} required />
          </FormField>
          <FormField label="Fecha fin">
            <input className="input-base" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} min={fechaInicio} required />
          </FormField>
        </div>
        <FormField label="Color">
          <div className="flex flex-wrap gap-2">
            {COLORES_PROYECTO.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className={cn(`w-7 h-7 rounded-lg bg-${c}-500 transition-all`, color === c ? 'ring-2 ring-offset-1 ring-slate-900 scale-110' : 'hover:scale-105')}
              />
            ))}
          </div>
        </FormField>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando...' : 'Crear proyecto'}</button>
        </div>
      </form>
    </Modal>
  )
}

type MiembroInfo = { uid: string; rol: Rol; displayName: string; email: string }

const ROL_LABELS: Record<Rol, string> = { owner: 'Propietario', admin: 'Admin', miembro: 'Miembro', viewer: 'Lector' }

function CompartirProyectoModal({ proyecto, miUid, onClose }: {
  proyecto: Proyecto
  miUid: string
  onClose: () => void
}) {
  const [miembros, setMiembros] = useState<MiembroInfo[]>([])
  const [loadingMiembros, setLoadingMiembros] = useState(true)
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<Rol>('miembro')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    async function cargarMiembros() {
      setLoadingMiembros(true)
      const entries = Object.entries(proyecto.miembros)
      const infos = await Promise.all(
        entries.map(async ([uid, r]) => {
          const u = await getUsuario(uid)
          return { uid, rol: r as Rol, displayName: u?.displayName ?? uid, email: u?.email ?? '' }
        })
      )
      setMiembros(infos)
      setLoadingMiembros(false)
    }
    cargarMiembros()
  }, [proyecto.id])

  const handleAgregar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    const emailLower = email.trim().toLowerCase()
    if (!emailLower) return
    setSaving(true)
    try {
      const usuario = await buscarUsuarioPorEmail(emailLower) as (UsuarioApp & { id: string }) | null
      if (!usuario) {
        setError('No se encontró ningún usuario con ese email. Asegúrate de que ya haya iniciado sesión en la app.')
        return
      }
      const uid = usuario.uid ?? (usuario as unknown as { id: string }).id
      await agregarMiembroProyecto(proyecto.id, uid, rol, emailLower)
      setMiembros((prev) => {
        const exists = prev.find((m) => m.uid === uid)
        if (exists) return prev.map((m) => m.uid === uid ? { ...m, rol } : m)
        return [...prev, { uid, rol, displayName: usuario.displayName, email: usuario.email }]
      })
      setEmail('')
      setSuccess(`${usuario.displayName} ahora tiene acceso al proyecto.`)
    } finally {
      setSaving(false)
    }
  }

  const handleRemover = async (uid: string, email: string) => {
    await removerMiembroProyecto(proyecto.id, uid, email)
    setMiembros((prev) => prev.filter((m) => m.uid !== uid))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Share2 size={18} className="text-indigo-500" /> Compartir proyecto
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">{proyecto.nombre}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={18} />
          </button>
        </div>

        {/* Agregar persona */}
        <form onSubmit={handleAgregar} className="space-y-3">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <UserPlus size={14} /> Agregar persona
          </label>
          <input
            type="email"
            className="input-base"
            placeholder="email@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="flex gap-2">
            <select
              className="input-base flex-1"
              value={rol}
              onChange={(e) => setRol(e.target.value as Rol)}
            >
              <option value="miembro">Miembro</option>
              <option value="viewer">Lector</option>
            </select>
            <button type="submit" disabled={saving || !email.trim()} className="btn-primary px-5">
              {saving ? '...' : 'Agregar'}
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          {success && <p className="text-xs text-emerald-600">{success}</p>}
        </form>

        {/* Lista de miembros actuales */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">Acceso actual</p>
          {loadingMiembros ? (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {miembros.map((m) => (
                <li key={m.uid} className="flex items-center gap-3 py-1">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-600 flex-shrink-0">
                    {m.displayName[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{m.displayName}</p>
                    <p className="text-xs text-slate-400 truncate">{m.email}</p>
                  </div>
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full flex-shrink-0">
                    {ROL_LABELS[m.rol]}
                  </span>
                  {m.uid !== miUid && (
                    <button
                      onClick={() => handleRemover(m.uid, m.email)}
                      className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                      title="Quitar acceso"
                    >
                      <X size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-slate-400">
          Los miembros de la empresa ya tienen acceso automático a todos sus proyectos. Aquí puedes compartir este proyecto con personas externas a la empresa.
        </p>
      </div>
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {children}
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

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
        <FolderKanban size={28} className="text-indigo-500" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">Sin proyectos todavía</h3>
      <p className="text-slate-500 text-sm mb-6 max-w-sm">Crea tu primer proyecto para empezar a organizar el trabajo con cronogramas y tareas.</p>
      <button onClick={onNew} className="btn-primary flex items-center gap-2">
        <Plus size={16} /> Crear primer proyecto
      </button>
    </div>
  )
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
