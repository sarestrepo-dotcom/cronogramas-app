import { useState, useEffect } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { Plus, Folder, FolderOpen, MoreVertical, Trash2, Pencil, Building2, X, LayoutDashboard } from 'lucide-react'
import { useEmpresas } from '@/hooks/useEmpresas'
import { useAuth } from '@/hooks/useAuth'
import { useClientes } from '@/hooks/useClientes'
import { useProyectos } from '@/hooks/useProyectos'
import { crearCliente, actualizarCliente, eliminarCliente } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { COLORES_EMPRESAS as COLORES_MAP } from '@/types'
import type { Empresa, Cliente, Rol } from '@/types'

export function ClientesPage() {
  const { empresaId } = useParams<{ empresaId: string }>()
  const { setEmpresaActiva } = useOutletContext<{ empresaActiva: Empresa | null; setEmpresaActiva: (e: Empresa) => void }>()
  const { user } = useAuth()
  const { empresas } = useEmpresas()
  const { clientes, loading: loadingClientes } = useClientes(empresaId ?? null)
  const { proyectos, loading: loadingProyectos } = useProyectos(empresaId ?? null)
  const navigate = useNavigate()

  const [showModal, setShowModal] = useState(false)
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const empresa = empresas.find((e) => e.id === empresaId)
  const miRol = empresa?.miembros[user!.uid] as Rol | undefined
  const puedoEditar = miRol === 'owner' || miRol === 'admin'

  useEffect(() => {
    if (empresa) setEmpresaActiva(empresa)
  }, [empresa])

  // Auto-crear cliente interno si no existe ninguno (solo admins)
  useEffect(() => {
    if (!empresa || loadingClientes || clientes.length > 0 || !puedoEditar) return
    crearCliente({
      empresaId: empresa.id,
      nombre: empresa.nombre,
      esInterno: true,
      creadoPor: user!.uid,
    })
  }, [empresa, loadingClientes, clientes.length, puedoEditar])

  const coloresEmpresa = COLORES_MAP[empresa?.color ?? 'indigo'] ?? COLORES_MAP.indigo

  const proyectosPorCliente = (clienteId: string) =>
    proyectos.filter((p) => p.clienteId === clienteId).length

  const sinCliente = proyectos.filter((p) => !p.clienteId).length

  const loading = loadingClientes || loadingProyectos

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // Empty state: no clientes y no proyectos accesibles
  if (clientes.length === 0 && proyectos.length === 0) return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        {empresa && (
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm', coloresEmpresa.bg)}>
            {empresa.nombre[0]}
          </div>
        )}
        <h1 className="text-2xl font-bold text-slate-900">{empresa?.nombre ?? 'Proyectos'}</h1>
      </div>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
          <LayoutDashboard size={24} className="text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-700 mb-1">Sin proyectos aún</h3>
        <p className="text-sm text-slate-400 max-w-xs mb-6">
          {puedoEditar
            ? 'Crea un cliente para organizar tus proyectos, o crea un proyecto directamente.'
            : 'No tienes proyectos asignados en esta empresa. Contacta al administrador.'}
        </p>
        {puedoEditar && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <Plus size={16} /> Nuevo cliente
          </button>
        )}
      </div>
      {(showModal || editingCliente) && empresa && (
        <ClienteModal empresa={empresa} uid={user!.uid} cliente={editingCliente ?? undefined}
          onClose={() => { setShowModal(false); setEditingCliente(null) }} />
      )}
    </div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            {empresa && (
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm', coloresEmpresa.bg)}>
                {empresa.nombre[0]}
              </div>
            )}
            <h1 className="text-2xl font-bold text-slate-900">{empresa?.nombre ?? 'Clientes'}</h1>
          </div>
          <p className="text-slate-500 text-sm">{clientes.length} cliente{clientes.length !== 1 ? 's' : ''}</p>
        </div>
        {puedoEditar && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <Plus size={16} /> Nuevo cliente
          </button>
        )}
      </div>

      {/* Grid de clientes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clientes
          .sort((a, b) => (a.esInterno ? 1 : 0) - (b.esInterno ? 1 : 0) || a.nombre.localeCompare(b.nombre))
          .map((cliente) => {
            const count = proyectosPorCliente(cliente.id)
            return (
              <div
                key={cliente.id}
                className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer"
                onClick={() => navigate(`/empresa/${empresaId}/cliente/${cliente.id}/proyectos`)}
              >
                <div className={cn('h-1.5 rounded-t-2xl', coloresEmpresa.bg)} />
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center',
                      cliente.esInterno ? 'bg-slate-100' : 'bg-indigo-50'
                    )}>
                      {cliente.esInterno
                        ? <Building2 size={20} className="text-slate-500" />
                        : <Folder size={20} className="text-indigo-500" />
                      }
                    </div>
                    {puedoEditar && (
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setMenuOpen(menuOpen === cliente.id ? null : cliente.id)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical size={15} />
                        </button>
                        {menuOpen === cliente.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                            <div className="absolute right-0 top-8 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-40">
                              <button
                                onClick={() => { setEditingCliente(cliente); setMenuOpen(null) }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                              >
                                <Pencil size={13} /> Editar
                              </button>
                              {!cliente.esInterno && (
                                <button
                                  onClick={async () => {
                                    if (confirm(`¿Eliminar cliente "${cliente.nombre}"? Sus proyectos quedarán sin cliente.`)) {
                                      await eliminarCliente(cliente.id)
                                    }
                                    setMenuOpen(null)
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 size={13} /> Eliminar
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <h3 className="font-semibold text-slate-900 mb-0.5">{cliente.nombre}</h3>
                  {cliente.esInterno && (
                    <p className="text-xs text-slate-400 mb-2">Proyectos internos</p>
                  )}

                  <div className="flex items-center gap-1.5 mt-3">
                    <FolderOpen size={13} className="text-slate-400" />
                    <span className="text-xs text-slate-500">
                      {count} proyecto{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}

        {/* Tarjeta proyectos sin cliente */}
        {sinCliente > 0 && (
          <div
            className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 hover:border-slate-300 transition-colors cursor-pointer p-5"
            onClick={() => navigate(`/empresa/${empresaId}/cliente/_sin_cliente/proyectos`)}
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
              <Folder size={20} className="text-slate-400" />
            </div>
            <h3 className="font-semibold text-slate-500 mb-0.5">Sin cliente</h3>
            <p className="text-xs text-slate-400">{sinCliente} proyecto{sinCliente !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>

      {/* Modal nuevo/editar cliente */}
      {(showModal || editingCliente) && empresa && (
        <ClienteModal
          empresa={empresa}
          uid={user!.uid}
          cliente={editingCliente ?? undefined}
          onClose={() => { setShowModal(false); setEditingCliente(null) }}
        />
      )}
    </div>
  )
}

function ClienteModal({ empresa, uid, cliente, onClose }: {
  empresa: Empresa
  uid: string
  cliente?: Cliente
  onClose: () => void
}) {
  const isEdit = !!cliente
  const [nombre, setNombre] = useState(cliente?.nombre ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    setError('')
    try {
      if (isEdit && cliente) {
        await actualizarCliente(cliente.id, { nombre: nombre.trim() })
      } else {
        await crearCliente({ empresaId: empresa.id, nombre: nombre.trim(), creadoPor: uid })
      }
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('permission') || msg.includes('PERMISSION_DENIED')) {
        setError('Sin permisos. Las reglas de Firestore para clientes aún no están desplegadas.')
      } else {
        setError(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900">{isEdit ? 'Editar cliente' : 'Nuevo cliente'}</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Nombre del cliente</label>
            <input
              className="input-base w-full"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Bancolombia, TigoUne..."
              autoFocus
              required
            />
          </div>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={!nombre.trim() || saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear cliente'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
