import { useState, useEffect } from 'react'
import { X, Link2, Plus, Copy, CheckCircle2, Trash2, ExternalLink, MessageSquare, GitPullRequest, ThumbsUp, Check, Clock, RefreshCw } from 'lucide-react'
import {
  crearTokenPortal, listarPortalesPorProyecto, revocarPortal,
  getAprobaciones, getComentariosPortal, getSolicitudesCambio, actualizarEstadoSolicitud,
  type Aprobacion, type ComentarioPortal, type SolicitudCambio,
} from '@/lib/firestore'
import { crearTarea } from '@/lib/firestore'
import type { Timestamp } from 'firebase/firestore'
import { cn, formatFecha } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

interface Portal {
  token: string
  nombre: string
  activo: boolean
  creadoEn: Timestamp
}

interface PortalModalProps {
  proyectoId: string
  empresaId: string
  onClose: () => void
}

type Tab = 'links' | 'actividad'

const ESTADO_SOLICITUD: Record<SolicitudCambio['estado'], { label: string; color: string; icon: React.ReactNode }> = {
  pendiente:  { label: 'Pendiente',  color: 'text-amber-600 bg-amber-50',   icon: <Clock size={11} /> },
  revisada:   { label: 'Revisada',   color: 'text-slate-600 bg-slate-100',  icon: <Check size={11} /> },
  convertida: { label: 'Convertida', color: 'text-emerald-600 bg-emerald-50', icon: <CheckCircle2 size={11} /> },
}

export function PortalModal({ proyectoId, empresaId, onClose }: PortalModalProps) {
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('links')
  const [portales, setPortales]       = useState<Portal[]>([])
  const [loading, setLoading]         = useState(true)
  const [nombre, setNombre]           = useState('Portal cliente')
  const [creating, setCreating]       = useState(false)
  const [copied, setCopied]           = useState<string | null>(null)
  const [activeToken, setActiveToken] = useState<string | null>(null)
  const [aprobaciones, setAprobaciones] = useState<Record<string, Aprobacion>>({})
  const [comentarios, setComentarios]   = useState<ComentarioPortal[]>([])
  const [solicitudes, setSolicitudes]   = useState<SolicitudCambio[]>([])
  const [loadingActividad, setLoadingActividad] = useState(false)
  const [convirtiendo, setConvirtiendo] = useState<string | null>(null)

  const origin = window.location.origin

  const cargar = async () => {
    setLoading(true)
    const lista = await listarPortalesPorProyecto(proyectoId)
    const activos = lista.filter(p => p.activo).sort((a, b) => (b.creadoEn?.seconds ?? 0) - (a.creadoEn?.seconds ?? 0))
    setPortales(activos)
    setLoading(false)
    if (activos.length > 0 && !activeToken) setActiveToken(activos[0].token)
  }

  const cargarActividad = async (token: string) => {
    setLoadingActividad(true)
    const [aprs, comts, sols] = await Promise.all([
      getAprobaciones(token),
      getComentariosPortal(token),
      getSolicitudesCambio(token),
    ])
    setAprobaciones(aprs)
    setComentarios(comts)
    setSolicitudes(sols)
    setLoadingActividad(false)
  }

  useEffect(() => { cargar() }, [proyectoId])

  useEffect(() => {
    if (tab === 'actividad' && activeToken) cargarActividad(activeToken)
  }, [tab, activeToken])

  const crear = async () => {
    if (!nombre.trim()) return
    setCreating(true)
    const token = await crearTokenPortal(proyectoId, nombre.trim())
    setNombre('Portal cliente')
    await cargar()
    setActiveToken(token)
    setCreating(false)
  }

  const revocar = async (token: string) => {
    if (!confirm('¿Desactivar este enlace? El cliente ya no podrá acceder.')) return
    await revocarPortal(token)
    if (activeToken === token) setActiveToken(null)
    await cargar()
  }

  const copiar = (token: string) => {
    const url = `${origin}/portal/${token}`
    navigator.clipboard.writeText(url)
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  const cambiarEstadoSolicitud = async (solicitudId: string, estado: SolicitudCambio['estado']) => {
    if (!activeToken) return
    await actualizarEstadoSolicitud(activeToken, solicitudId, estado)
    setSolicitudes(prev => prev.map(s => s.id === solicitudId ? { ...s, estado } : s))
  }

  const convertirEnTarea = async (sol: SolicitudCambio) => {
    if (!activeToken) return
    setConvirtiendo(sol.id)
    try {
      await crearTarea({
        titulo: sol.descripcion.slice(0, 80),
        descripcion: `Solicitud de cambio de cliente (${sol.autor}): ${sol.descripcion}`,
        proyectoId,
        empresaId,
        estado: 'pendiente',
        tipo: 'tarea',
        progreso: 0,
        orden: 9999,
      } as any)
      await cambiarEstadoSolicitud(sol.id, 'convertida')
      toast('Tarea creada a partir de la solicitud', 'success')
    } catch {
      toast('Error al crear la tarea', 'error')
    } finally {
      setConvirtiendo(null)
    }
  }

  const totalActividad = Object.keys(aprobaciones).length + comentarios.length + solicitudes.filter(s => s.estado === 'pendiente').length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Link2 size={15} className="text-indigo-500" /> Portal del cliente
          </h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-6 flex-shrink-0">
          {([['links', 'Enlaces'], ['actividad', 'Actividad']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex items-center gap-1.5 px-1 py-3 text-sm font-medium border-b-2 mr-5 transition-colors',
                tab === t ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              {label}
              {t === 'actividad' && totalActividad > 0 && tab !== 'actividad' && (
                <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">{totalActividad}</span>
              )}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* ── TAB LINKS ── */}
          {tab === 'links' && (
            <>
              <p className="text-xs text-slate-500">
                Genera un enlace único para que tu cliente vea el avance del proyecto sin cuenta. El cliente podrá aprobar hitos, dejar comentarios y solicitar cambios.
              </p>

              {/* Crear nuevo */}
              <div className="flex gap-2">
                <input
                  className="input-base flex-1 text-sm"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  placeholder='Ej: "Vista Acme Corp"'
                  onKeyDown={e => e.key === 'Enter' && crear()}
                />
                <button onClick={crear} disabled={creating || !nombre.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl">
                  <Plus size={14} /> Generar
                </button>
              </div>

              {/* Lista de portales */}
              {loading ? (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : portales.length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-400">
                  No hay portales activos. Genera uno arriba.
                </div>
              ) : (
                <div className="space-y-2">
                  {portales.map(p => {
                    const url = `${origin}/portal/${p.token}`
                    return (
                      <div key={p.token} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-800">{p.nombre}</span>
                          <span className="text-[10px] text-slate-400">{p.creadoEn ? formatFecha(p.creadoEn) : ''}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-[10px] text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-1.5 truncate font-mono">
                            {url}
                          </code>
                          <button onClick={() => copiar(p.token)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 hover:border-indigo-300 rounded-lg transition-colors">
                            {copied === p.token ? <CheckCircle2 size={12} className="text-emerald-500" /> : <Copy size={12} />}
                            {copied === p.token ? 'Copiado' : 'Copiar'}
                          </button>
                          <a href={url} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                            <ExternalLink size={13} />
                          </a>
                          <button onClick={() => revocar(p.token)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <p className="text-[10px] text-slate-400">
                El enlace es público — cualquier persona con el link puede ver el proyecto. Desactívalo si ya no lo necesitas.
              </p>
            </>
          )}

          {/* ── TAB ACTIVIDAD ── */}
          {tab === 'actividad' && (
            <>
              {/* Selector de portal */}
              {portales.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {portales.map(p => (
                    <button
                      key={p.token}
                      onClick={() => setActiveToken(p.token)}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors',
                        activeToken === p.token
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'text-slate-600 border-slate-200 hover:border-indigo-300'
                      )}
                    >
                      {p.nombre}
                    </button>
                  ))}
                </div>
              )}

              {portales.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-400">
                  Crea un portal primero para ver su actividad.
                </div>
              ) : loadingActividad ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-6">

                  {/* Aprobaciones */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <ThumbsUp size={13} className="text-emerald-500" />
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Hitos aprobados</h4>
                      <span className="text-xs text-slate-400">({Object.keys(aprobaciones).length})</span>
                    </div>
                    {Object.keys(aprobaciones).length === 0 ? (
                      <p className="text-xs text-slate-400 pl-5">Ningún hito aprobado aún.</p>
                    ) : (
                      <div className="space-y-2">
                        {Object.values(aprobaciones).map(a => (
                          <div key={a.hitoId} className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                            <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{a.hitoId}</p>
                              <p className="text-[11px] text-emerald-600">Aprobado por {a.nombre} · {a.aprobadoEn ? formatFecha(a.aprobadoEn) : ''}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Solicitudes de cambio */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <GitPullRequest size={13} className="text-indigo-500" />
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Solicitudes de cambio</h4>
                        <span className="text-xs text-slate-400">({solicitudes.length})</span>
                      </div>
                      {activeToken && (
                        <button onClick={() => cargarActividad(activeToken)} className="p-1 text-slate-400 hover:text-slate-600">
                          <RefreshCw size={12} />
                        </button>
                      )}
                    </div>
                    {solicitudes.length === 0 ? (
                      <p className="text-xs text-slate-400 pl-5">Sin solicitudes.</p>
                    ) : (
                      <div className="space-y-2">
                        {solicitudes.map(s => {
                          const cfg = ESTADO_SOLICITUD[s.estado]
                          return (
                            <div key={s.id} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm text-slate-800 flex-1 leading-snug">{s.descripcion}</p>
                                <span className={cn('flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0', cfg.color)}>
                                  {cfg.icon} {cfg.label}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400">
                                {s.autor} · {s.creadoEn ? formatFecha(s.creadoEn) : ''}
                              </p>
                              {s.estado === 'pendiente' && (
                                <div className="flex gap-2 pt-1">
                                  <button
                                    onClick={() => convertirEnTarea(s)}
                                    disabled={convirtiendo === s.id}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[11px] font-semibold rounded-lg transition-colors"
                                  >
                                    {convirtiendo === s.id
                                      ? <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                                      : <Plus size={11} />}
                                    Convertir en tarea
                                  </button>
                                  <button
                                    onClick={() => cambiarEstadoSolicitud(s.id, 'revisada')}
                                    className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-600 text-[11px] font-medium rounded-lg transition-colors"
                                  >
                                    <Check size={11} /> Marcar revisada
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Comentarios */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <MessageSquare size={13} className="text-slate-500" />
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Comentarios</h4>
                      <span className="text-xs text-slate-400">({comentarios.length})</span>
                    </div>
                    {comentarios.length === 0 ? (
                      <p className="text-xs text-slate-400 pl-5">Sin comentarios.</p>
                    ) : (
                      <div className="space-y-2">
                        {comentarios.map(c => (
                          <div key={c.id} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-slate-800">{c.autor}</span>
                              {c.creadoEn && <span className="text-[10px] text-slate-400">{formatFecha(c.creadoEn)}</span>}
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed">{c.texto}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
