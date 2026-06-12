import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Building2, Users, FolderOpen, MoreVertical, Pencil, Trash2, UserPlus } from 'lucide-react'
import { useEmpresas } from '@/hooks/useEmpresas'
import { useAuth } from '@/hooks/useAuth'
import { crearEmpresa, actualizarEmpresa, eliminarEmpresa, invitarMiembroEmpresa } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import type { Empresa, Rol } from '@/types'
import { COLORES_EMPRESAS } from '@/types'

const COLORES = Object.keys(COLORES_EMPRESAS)

export function EmpresasPage() {
  const { empresas, loading } = useEmpresas()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [showModal, setShowModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState<Empresa | null>(null)
  const [showEditModal, setShowEditModal] = useState<Empresa | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  if (loading) return <PageLoader />

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Empresas</h1>
          <p className="text-slate-500 text-sm mt-1">Gestiona tus organizaciones y sus miembros</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus size={16} />
          Nueva empresa
        </button>
      </div>

      {/* Grid */}
      {empresas.length === 0 ? (
        <EmptyState onNew={() => setShowModal(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {empresas.map((empresa) => (
            <EmpresaCard
              key={empresa.id}
              empresa={empresa}
              uid={user!.uid}
              menuOpen={menuOpen === empresa.id}
              onMenuToggle={() => setMenuOpen(menuOpen === empresa.id ? null : empresa.id)}
              onMenuClose={() => setMenuOpen(null)}
              onAbrir={() => navigate(`/empresa/${empresa.id}/proyectos`)}
              onEditar={() => setShowEditModal(empresa)}
              onInvitar={() => setShowInviteModal(empresa)}
              onEliminar={async () => { if (confirm('¿Eliminar empresa?')) await eliminarEmpresa(empresa.id) }}
            />
          ))}
        </div>
      )}

      {/* Modal crear empresa */}
      {showModal && (
        <CrearEmpresaModal
          uid={user!.uid}
          onClose={() => setShowModal(false)}
          onCreate={(id) => { setShowModal(false); navigate(`/empresa/${id}/proyectos`) }}
        />
      )}

      {/* Modal editar empresa */}
      {showEditModal && (
        <EditarEmpresaModal
          empresa={showEditModal}
          onClose={() => setShowEditModal(null)}
        />
      )}

      {/* Modal invitar */}
      {showInviteModal && (
        <InvitarModal
          empresa={showInviteModal}
          uid={user!.uid}
          onClose={() => setShowInviteModal(null)}
        />
      )}
    </div>
  )
}

function EmpresaCard({
  empresa, uid, menuOpen, onMenuToggle, onMenuClose, onAbrir, onEditar, onInvitar, onEliminar,
}: {
  empresa: Empresa
  uid: string
  menuOpen: boolean
  onMenuToggle: () => void
  onMenuClose: () => void
  onAbrir: () => void
  onEditar: () => void
  onInvitar: () => void
  onEliminar: () => void
}) {
  const miembrosCount = Object.keys(empresa.miembros).length
  const colores = COLORES_EMPRESAS[empresa.color] ?? COLORES_EMPRESAS.indigo
  const esOwner = empresa.miembros[uid] === 'owner'

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Top color band */}
      <div className={cn('h-2', colores.bg)} />

      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg', colores.bg)}>
              {empresa.nombre[0]}
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">{empresa.nombre}</h3>
              <p className="text-xs text-slate-500 capitalize">{empresa.miembros[uid]}</p>
            </div>
          </div>

          {esOwner && (
            <div className="relative">
              <button onClick={onMenuToggle} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                <MoreVertical size={16} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={onMenuClose} />
                  <div className="absolute right-0 top-8 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-44">
                    <button
                      onClick={() => { onInvitar(); onMenuClose() }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <UserPlus size={14} /> Invitar miembro
                    </button>
                    <button
                      onClick={() => { onEditar(); onMenuClose() }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil size={14} /> Editar
                    </button>
                    <button
                      onClick={() => { onEliminar(); onMenuClose() }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={14} /> Eliminar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {empresa.descripcion && (
          <p className="text-sm text-slate-500 mb-4 line-clamp-2">{empresa.descripcion}</p>
        )}

        <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
          <span className="flex items-center gap-1.5"><Users size={13} />{miembrosCount} miembro{miembrosCount !== 1 ? 's' : ''}</span>
        </div>

        <button
          onClick={onAbrir}
          className={cn('w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-colors', colores.light, colores.text, 'hover:opacity-80')}
        >
          <FolderOpen size={15} />
          Ver proyectos
        </button>
      </div>
    </div>
  )
}

function CrearEmpresaModal({ uid, onClose, onCreate }: { uid: string; onClose: () => void; onCreate: (id: string) => void }) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [color, setColor] = useState('indigo')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    try {
      const id = await crearEmpresa({
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        color,
        ownerId: uid,
        miembros: { [uid]: 'owner' },
      } as Omit<Empresa, 'id' | 'creadoEn'>)
      onCreate(id)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Nueva empresa" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Nombre de la empresa">
          <input
            className="input-base"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Triciclo S.A.S."
            required
          />
        </FormField>
        <FormField label="Descripción (opcional)">
          <textarea
            className="input-base resize-none"
            rows={2}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Descripción corta..."
          />
        </FormField>
        <FormField label="Color identificador">
          <div className="flex flex-wrap gap-2">
            {COLORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  `w-8 h-8 rounded-lg bg-${c}-500 transition-all`,
                  color === c ? 'ring-2 ring-offset-2 ring-slate-900 scale-110' : 'hover:scale-105'
                )}
              />
            ))}
          </div>
        </FormField>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando...' : 'Crear empresa'}</button>
        </div>
      </form>
    </Modal>
  )
}

function EditarEmpresaModal({ empresa, onClose }: { empresa: Empresa; onClose: () => void }) {
  const [nombre, setNombre] = useState(empresa.nombre)
  const [descripcion, setDescripcion] = useState(empresa.descripcion ?? '')
  const [color, setColor] = useState(empresa.color)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    try {
      await actualizarEmpresa(empresa.id, {
        nombre: nombre.trim(),
        ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
        color,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Editar empresa" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Nombre de la empresa">
          <input
            className="input-base"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            autoFocus
          />
        </FormField>
        <FormField label="Descripción (opcional)">
          <textarea
            className="input-base resize-none"
            rows={2}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </FormField>
        <FormField label="Color identificador">
          <div className="flex flex-wrap gap-2">
            {COLORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  `w-8 h-8 rounded-lg bg-${c}-500 transition-all`,
                  color === c ? 'ring-2 ring-offset-2 ring-slate-900 scale-110' : 'hover:scale-105'
                )}
              />
            ))}
          </div>
        </FormField>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function InvitarModal({ empresa, uid, onClose }: { empresa: Empresa; uid: string; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<Rol>('miembro')
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    try {
      await invitarMiembroEmpresa(empresa.id, email.trim().toLowerCase(), rol, uid, empresa.nombre)
      setSuccess(true)
      setEmail('')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal title={`Invitar a ${empresa.nombre}`} onClose={onClose}>
      {success ? (
        <div className="text-center py-4 space-y-3">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <UserPlus size={20} className="text-emerald-600" />
          </div>
          <p className="text-slate-700 font-medium">¡Invitación enviada!</p>
          <p className="text-slate-500 text-sm">El usuario recibirá una notificación para unirse.</p>
          <div className="flex gap-3 justify-center pt-2">
            <button onClick={() => setSuccess(false)} className="btn-secondary">Invitar otro</button>
            <button onClick={onClose} className="btn-primary">Listo</button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Correo electrónico">
            <input
              className="input-base"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@empresa.com"
              required
            />
          </FormField>
          <FormField label="Rol">
            <select className="input-base" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              <option value="admin">Admin — puede editar todo</option>
              <option value="miembro">Miembro — puede ver y actualizar tareas</option>
              <option value="viewer">Viewer — solo puede ver</option>
            </select>
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={sending} className="btn-primary">{sending ? 'Enviando...' : 'Enviar invitación'}</button>
          </div>
        </form>
      )}
    </Modal>
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
        <Building2 size={28} className="text-indigo-500" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">Sin empresas todavía</h3>
      <p className="text-slate-500 text-sm mb-6 max-w-sm">Crea tu primera empresa para empezar a gestionar proyectos y cronogramas.</p>
      <button onClick={onNew} className="btn-primary flex items-center gap-2">
        <Plus size={16} /> Crear primera empresa
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
