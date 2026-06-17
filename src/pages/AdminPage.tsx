import { useState, useEffect } from 'react'
import {
  Users, UserPlus, Trash2, X, CheckCircle2, XCircle,
  Crown, User, Building2, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import {
  suscribirPermitidos, crearPermiso, actualizarPermiso, eliminarPermiso,
  suscribirEmpresasDeUsuario, buscarUsuarioPorEmail,
  agregarMiembroEmpresa, removerMiembroEmpresa,
} from '@/lib/firestore'
import type { Empresa, UsuarioPermitido } from '@/types'

export function AdminPage() {
  const { user, isAdmin } = useAuth()
  const [permitidos, setPermitidos]   = useState<UsuarioPermitido[]>([])
  const [showAdd, setShowAdd]         = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [gestionando, setGestionando] = useState<UsuarioPermitido | null>(null)
  const [saving, setSaving]           = useState<string | null>(null)

  useEffect(() => suscribirPermitidos(setPermitidos), [])

  if (!isAdmin) return null

  const admins  = permitidos.filter(p => p.rol === 'admin')
  const activos = permitidos.filter(p => p.activo)

  const toggleActivo = async (p: UsuarioPermitido) => {
    if (p.email === user?.email) return
    if (p.rol === 'admin' && admins.length === 1) return
    setSaving(p.email)
    await actualizarPermiso(p.email, { activo: !p.activo })
    setSaving(null)
  }

  const toggleRol = async (p: UsuarioPermitido) => {
    if (p.email === user?.email) return
    if (p.rol === 'admin' && admins.length === 1) return
    setSaving(p.email)
    await actualizarPermiso(p.email, { rol: p.rol === 'admin' ? 'usuario' : 'admin' })
    setSaving(null)
  }

  const handleDelete = async (email: string) => {
    if (email === user?.email) return
    await eliminarPermiso(email)
    setConfirmDelete(null)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Control de acceso</h1>
          <p className="text-sm text-slate-500 mt-1">
            Solo los usuarios en esta lista pueden entrar a la app
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <UserPlus size={15} /> Agregar usuario
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard icon={<Users size={18} className="text-slate-500" />}      label="Total usuarios"   value={permitidos.length} />
        <StatCard icon={<Crown size={18} className="text-amber-500" />}      label="Administradores"  value={admins.length} />
        <StatCard icon={<CheckCircle2 size={18} className="text-emerald-500" />} label="Acceso activo" value={activos.length} />
      </div>

      {/* Users table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Usuario', 'Rol', 'Estado', 'Empresas', 'Acciones'].map(h => (
                <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {permitidos
              .sort((a, b) => {
                if (a.rol === 'admin' && b.rol !== 'admin') return -1
                if (b.rol === 'admin' && a.rol !== 'admin') return 1
                return a.email.localeCompare(b.email)
              })
              .map(p => {
                const isMe       = p.email === user?.email
                const isSaving   = saving === p.email
                const isLastAdmin = p.rol === 'admin' && admins.length === 1
                const nEmpresas  = (p.empresas ?? []).length

                return (
                  <tr key={p.email} className={cn('hover:bg-slate-50/50', !p.activo && 'opacity-60')}>
                    {/* Usuario */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                          p.rol === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'
                        )}>
                          {p.nombre.split(' ').slice(0, 2).map(n => n[0] ?? '').join('').toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">
                            {p.nombre}
                            {isMe && <span className="ml-2 text-xs text-indigo-500 font-normal">(tú)</span>}
                          </p>
                          <p className="text-xs text-slate-400">{p.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Rol */}
                    <td className="px-5 py-4">
                      <button
                        onClick={() => !isMe && !isLastAdmin && toggleRol(p)}
                        disabled={isMe || isLastAdmin || isSaving}
                        title={isLastAdmin ? 'No puedes quitar el único admin' : isMe ? 'No puedes cambiar tu propio rol' : 'Click para cambiar rol'}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors',
                          p.rol === 'admin'
                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                          (isMe || isLastAdmin) && 'cursor-not-allowed opacity-70',
                        )}
                      >
                        {p.rol === 'admin' ? <Crown size={10} /> : <User size={10} />}
                        {p.rol === 'admin' ? 'Admin' : 'Usuario'}
                      </button>
                    </td>

                    {/* Estado */}
                    <td className="px-5 py-4">
                      <button
                        onClick={() => !isMe && !isLastAdmin && toggleActivo(p)}
                        disabled={isMe || (isLastAdmin && p.activo) || isSaving}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all',
                          p.activo ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-red-100 text-red-600 hover:bg-red-200',
                          isMe && 'cursor-not-allowed',
                          isSaving && 'animate-pulse',
                        )}
                      >
                        {p.activo
                          ? <><CheckCircle2 size={10} /> Activo</>
                          : <><XCircle size={10} /> Inactivo</>}
                      </button>
                    </td>

                    {/* Empresas */}
                    <td className="px-5 py-4">
                      <button
                        onClick={() => setGestionando(p)}
                        className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        <Building2 size={13} />
                        {p.rol === 'admin'
                          ? <span className="text-xs text-amber-600 font-medium">Todas (admin)</span>
                          : <span className="text-xs">{nEmpresas === 0 ? 'Ninguna' : `${nEmpresas} empresa${nEmpresas !== 1 ? 's' : ''}`}</span>
                        }
                        <ChevronRight size={12} className="text-slate-400" />
                      </button>
                    </td>

                    {/* Acciones */}
                    <td className="px-5 py-4">
                      {!isMe && (
                        <button
                          onClick={() => setConfirmDelete(p.email)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar acceso"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>

        {permitidos.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">
            <Users size={28} className="mx-auto mb-3 opacity-30" />
            Sin usuarios configurados
          </div>
        )}
      </div>

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-slate-900 mb-2">¿Eliminar acceso?</h3>
            <p className="text-sm text-slate-500 mb-5">
              Se le quitará el acceso a <strong>{confirmDelete}</strong>. No elimina la cuenta de Firebase Auth.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={() => handleDelete(confirmDelete)}
                className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add user modal */}
      {showAdd && (
        <AgregarUsuarioModal
          onClose={() => setShowAdd(false)}
          uid={user?.uid ?? ''}
          existing={permitidos.map(p => p.email)}
        />
      )}

      {/* Gestionar empresas modal */}
      {gestionando && (
        <GestionarEmpresasModal
          permiso={gestionando}
          onClose={() => setGestionando(null)}
        />
      )}
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4">
      <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center flex-shrink-0">{icon}</div>
      <div>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  )
}

// ─── Gestionar empresas modal ─────────────────────────────────────────────────

function GestionarEmpresasModal({ permiso, onClose }: {
  permiso: UsuarioPermitido
  onClose: () => void
}) {
  const { user } = useAuth()
  const [todas, setTodas]       = useState<Empresa[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(permiso.empresas ?? []))
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    if (!user) return
    const unsub = suscribirEmpresasDeUsuario(user.uid, (empresas) => {
      setTodas(empresas)
      setLoading(false)
    })
    return unsub
  }, [user?.uid])

  const toggle = (id: string) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const handleSave = async () => {
    setSaving(true)
    try {
      const prevIds = new Set(permiso.empresas ?? [])
      const toAdd    = [...selected].filter(id => !prevIds.has(id))
      const toRemove = [...prevIds].filter(id => !selected.has(id))

      // Sync empresa.miembros so Firestore rules and queries work for this user
      const usuario = await buscarUsuarioPorEmail(permiso.email)
      const uid = usuario?.uid ?? (usuario as unknown as { id?: string })?.id ?? null

      if (uid) {
        await Promise.all([
          // Add as viewer to newly assigned empresas (only if not already a member)
          ...toAdd.map(async (id) => {
            const emp = todas.find(e => e.id === id)
            if (emp && !(uid in (emp.miembros ?? {}))) {
              await agregarMiembroEmpresa(id, uid, 'viewer')
            }
          }),
          // Remove from unassigned empresas
          ...toRemove.map(id => removerMiembroEmpresa(id, uid)),
        ])
      }

      await actualizarPermiso(permiso.email, { empresas: [...selected] })
    } finally {
      setSaving(false)
      onClose()
    }
  }

  const isAdmin = permiso.rol === 'admin'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-slate-900">Acceso a empresas</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-5">
          <span className="font-medium text-slate-700">{permiso.nombre}</span> · {permiso.email}
        </p>

        {isAdmin ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
            <Crown size={14} />
            Los administradores tienen acceso a todas las empresas automáticamente.
          </div>
        ) : loading ? (
          <div className="py-8 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : todas.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No hay empresas creadas aún.</p>
        ) : (
          <>
            <div className="space-y-2 max-h-72 overflow-y-auto mb-5">
              {todas.map(e => {
                const checked = selected.has(e.id)
                return (
                  <label key={e.id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
                      checked ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(e.id)}
                      className="accent-indigo-600 w-4 h-4 flex-shrink-0"
                    />
                    <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0', `bg-${e.color}-500`)}>
                      {e.nombre[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{e.nombre}</p>
                      {e.descripcion && <p className="text-xs text-slate-400 truncate">{e.descripcion}</p>}
                    </div>
                  </label>
                )
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-xs text-slate-400">
                {selected.size === 0 ? 'Sin acceso a ninguna empresa' : `${selected.size} empresa${selected.size !== 1 ? 's' : ''} seleccionada${selected.size !== 1 ? 's' : ''}`}
              </span>
              <div className="flex gap-3">
                <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </>
        )}

        {isAdmin && (
          <div className="mt-4 flex justify-end">
            <button onClick={onClose} className="btn-secondary text-sm">Cerrar</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Agregar usuario modal ────────────────────────────────────────────────────

function AgregarUsuarioModal({ onClose, uid, existing }: {
  onClose: () => void
  uid: string
  existing: string[]
}) {
  const [email, setEmail]   = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol]       = useState<'admin' | 'usuario'>('usuario')
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const emailClean = email.trim().toLowerCase()
    if (!emailClean.includes('@')) { setError('Email inválido'); return }
    if (existing.includes(emailClean)) { setError('Ese email ya tiene acceso'); return }
    if (!nombre.trim()) { setError('El nombre es requerido'); return }
    setSaving(true)
    try {
      await crearPermiso({ email: emailClean, nombre: nombre.trim(), rol, activo: true, empresas: [], agregadoPor: uid })
      onClose()
    } catch {
      setError('Error al guardar. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900">Agregar usuario</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Email</label>
            <input className="input-base" type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="usuario@empresa.com" required />
            <p className="text-xs text-slate-400">
              El usuario accede con Google o email+contraseña usando esta dirección.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Nombre</label>
            <input className="input-base" value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Nombre completo" required />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Rol</label>
            <div className="flex gap-3">
              {(['usuario', 'admin'] as const).map(r => (
                <button key={r} type="button" onClick={() => setRol(r)}
                  className={cn(
                    'flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all',
                    rol === r
                      ? r === 'admin' ? 'bg-amber-50 text-amber-700 border-amber-400' : 'bg-indigo-50 text-indigo-700 border-indigo-400'
                      : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                  )}>
                  {r === 'admin' ? '👑 Admin' : '👤 Usuario'}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              {rol === 'admin'
                ? 'Los admins pueden gestionar usuarios y acceden a todas las empresas.'
                : 'Después de agregar, asígnale las empresas que puede ver.'}
            </p>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Guardando...' : 'Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
