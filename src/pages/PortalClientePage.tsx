import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { useParams } from 'react-router-dom'
import {
  CalendarRange, CheckCircle2, Clock, AlertTriangle, Circle,
  Calendar, ThumbsUp, Send, Plus,
  Ban, StickyNote, List, GanttChartSquare,
} from 'lucide-react'
import {
  suscribirPortalPublico, suscribirAprobacionesPortal,
  aprobarHitoPortal, solicitarCambioPortal,
  type Aprobacion, type PortalPublico,
} from '@/lib/firestore'
import { enrichTareas, buildHierarchy, computeNumeros } from '@/lib/hierarchyUtils'
// El Gantt solo se descarga si el cliente lo abre
const GanttVisual = lazy(() => import('@/components/gantt/GanttVisual').then(m => ({ default: m.GanttVisual })))
import { cn, formatFecha, ESTADO_COLORS, ESTADO_LABELS, isVencida, diasBloqueada, textoDiasBloqueada } from '@/lib/utils'
import type { Tarea } from '@/types'

// Las reglas rechazan escrituras demasiado seguidas (anti-spam) o con datos inválidos
function mensajeError(e: unknown): string {
  if ((e as { code?: string }).code === 'permission-denied') {
    return 'No se pudo enviar. Espera unos segundos e intenta de nuevo (máx. 2.000 caracteres).'
  }
  return 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.'
}

export function PortalClientePage() {
  const { token } = useParams<{ token: string }>()
  const [estado, setEstado] = useState<'cargando' | 'invalido' | 'ok'>(token ? 'cargando' : 'invalido')
  const [portal, setPortal] = useState<PortalPublico | null>(null)
  const proyecto = portal?.datos?.proyecto ?? null
  const tareas = useMemo(() => portal?.datos?.tareas ?? [], [portal])
  const nombrePortal = portal?.nombrePortal ?? ''

  // Interacción
  const [aprobaciones, setAprobaciones] = useState<Record<string, Aprobacion>>({})
  const [aprobando, setAprobando]       = useState<string | null>(null)
  const [nombreCliente, setNombreCliente] = useState('')
  const [showNombre, setShowNombre]     = useState(false)
  const [pendingAccion, setPendingAccion] = useState<'aprobar' | 'solicitar' | null>(null)
  const [pendingHitoId, setPendingHitoId] = useState<string | null>(null)
  const [showSolicitud, setShowSolicitud] = useState(false)
  const [descripcionSolicitud, setDescripcionSolicitud] = useState('')
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false)
  const [solicitudEnviada, setSolicitudEnviada] = useState(false)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [vistaCrono, setVistaCrono] = useState<'lista' | 'gantt'>('lista')

  // Todo en tiempo real: el cliente ve los cambios del equipo apenas se publican
  useEffect(() => {
    if (!token) return
    const unsubs = [
      suscribirPortalPublico(token, p => { setPortal(p); setEstado(p ? 'ok' : 'invalido') }),
      suscribirAprobacionesPortal(token, setAprobaciones),
    ]
    return () => unsubs.forEach(u => u())
  }, [token])

  const enriched = useMemo(() => enrichTareas(tareas), [tareas])
  const numeros  = useMemo(() => computeNumeros(enriched), [enriched])
  const rows     = useMemo(() => buildHierarchy(enriched), [enriched])
  const hitos    = useMemo(() => enriched.filter(t => t.tipo === 'hito').sort((a, b) => (a.fechaFin?.seconds ?? 0) - (b.fechaFin?.seconds ?? 0)), [enriched])
  const bloqueadas = useMemo(() => enriched
    .filter(t => t.tipo !== 'grupo' && t.estado === 'bloqueada')
    .sort((a, b) => (a.fechaFin?.seconds ?? 0) - (b.fechaFin?.seconds ?? 0)), [enriched])
  const grupoDe = (t: Tarea) => enriched.find(g => g.id === t.parentId && g.tipo === 'grupo')?.titulo ?? t.fase

  const activas     = enriched.filter(t => t.tipo !== 'grupo')
  const completadas = activas.filter(t => t.estado === 'completada').length
  const enProgreso  = activas.filter(t => t.estado === 'en_progreso').length
  const avance      = activas.length > 0 ? Math.round((completadas / activas.length) * 100) : 0

  const hoy = new Date()
  const diasProy = proyecto ? Math.round((new Date((proyecto.fechaFin as any)?.seconds * 1000).getTime() - hoy.getTime()) / 86400000) : null

  // Solicitar nombre antes de acción
  const pedirNombreYHacer = (accion: 'aprobar' | 'solicitar', hitoId?: string) => {
    if (nombreCliente.trim()) {
      ejecutarAccion(accion, nombreCliente.trim(), hitoId)
    } else {
      setPendingAccion(accion)
      setPendingHitoId(hitoId ?? null)
      setShowNombre(true)
    }
  }

  const ejecutarAccion = (accion: 'aprobar' | 'solicitar', nombre: string, hitoId?: string) => {
    setShowNombre(false)
    if (accion === 'aprobar' && hitoId) doAprobar(hitoId, nombre)
    if (accion === 'solicitar') setShowSolicitud(true)
  }

  const doAprobar = async (hitoId: string, nombre: string) => {
    if (!token) return
    setAprobando(hitoId)
    setErrorAccion(null)
    try {
      await aprobarHitoPortal(token, hitoId, nombre)
    } catch (e) {
      setErrorAccion(mensajeError(e))
    } finally {
      setAprobando(null)
    }
  }

  const doSolicitud = async () => {
    if (!token || !portal || !descripcionSolicitud.trim() || !nombreCliente.trim()) return
    setEnviandoSolicitud(true)
    setErrorAccion(null)
    try {
      await solicitarCambioPortal(token, portal, descripcionSolicitud.trim(), nombreCliente.trim())
      setDescripcionSolicitud('')
      setSolicitudEnviada(true)
      setTimeout(() => { setSolicitudEnviada(false); setShowSolicitud(false) }, 3000)
    } catch (e) {
      setErrorAccion(mensajeError(e))
    } finally {
      setEnviandoSolicitud(false)
    }
  }

  if (estado === 'cargando') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (estado === 'invalido') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={24} className="text-red-400" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Enlace no válido</h1>
          <p className="text-slate-500 text-sm">Este enlace de portal no existe o ha sido desactivado.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <CalendarRange size={16} className="text-white" />
            </div>
            <div>
              <p className="text-xs text-slate-400 leading-none">{nombrePortal}</p>
              <h1 className="text-base font-semibold text-slate-900 leading-tight">{proyecto?.nombre}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => pedirNombreYHacer('solicitar')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              <Plus size={12} /> Solicitar cambio
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {!portal?.datos && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-4 py-3">
            El equipo está preparando el cronograma de este portal. Vuelve a intentarlo en unos minutos.
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Avance global',  value: `${avance}%`,                                                          color: 'indigo',  icon: <CheckCircle2 size={18} /> },
            { label: 'En progreso',    value: enProgreso,                                                             color: 'blue',    icon: <Clock size={18} /> },
            { label: 'Completadas',    value: completadas,                                                            color: 'emerald', icon: <CheckCircle2 size={18} /> },
            { label: diasProy !== null && diasProy < 0 ? 'Días de retraso' : 'Días al cierre',
              value: diasProy !== null ? Math.abs(diasProy) : '—',
              color: diasProy !== null && diasProy < 0 ? 'rose' : 'slate',
              icon: <Calendar size={18} /> },
          ].map(({ label, value, color, icon }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', `bg-${color}-50`)}>
                <span className={cn(`text-${color}-500`)}>{icon}</span>
              </div>
              <p className={cn('text-2xl font-bold', `text-${color}-600`)}>{value}</p>
              <p className="text-xs text-slate-500 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Barra de progreso */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-700">Avance del proyecto</p>
            <span className="text-lg font-bold text-indigo-600">{avance}%</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', avance === 100 ? 'bg-emerald-500' : 'bg-indigo-500')}
              style={{ width: `${avance}%` }}
            />
          </div>
          {proyecto && (
            <div className="flex justify-between mt-2 text-xs text-slate-400">
              <span>{formatFecha(proyecto.fechaInicio ?? undefined)}</span>
              <span>{formatFecha(proyecto.fechaFin ?? undefined)}</span>
            </div>
          )}
        </div>

        {errorAccion && !showSolicitud && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
            <AlertTriangle size={15} /> {errorAccion}
          </div>
        )}

        {/* Tareas bloqueadas */}
        {bloqueadas.length > 0 && (
          <div className="bg-white rounded-2xl border border-red-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Ban size={15} className="text-red-500" />
              <h2 className="text-sm font-semibold text-slate-700">Tareas bloqueadas</h2>
              <span className="text-[10px] font-bold bg-red-100 text-red-700 rounded-full px-1.5 py-0.5 leading-none">{bloqueadas.length}</span>
            </div>
            <div className="space-y-3">
              {bloqueadas.map(t => {
                const grupo = grupoDe(t)
                const venc = isVencida(t.fechaFin)
                return (
                  <div key={t.id} className="rounded-xl border border-red-100 bg-red-50/40 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {grupo && <p className="text-[11px] text-slate-400 font-medium truncate">▶ {grupo}</p>}
                        <p className="text-sm font-medium text-slate-800">{t.tipo === 'hito' ? '◆ ' : ''}{t.titulo}</p>
                        {t.bloqueo === 'cliente' && (
                          <span className="inline-block mt-1 text-[11px] font-semibold bg-amber-100 text-amber-800 rounded-md px-1.5 py-0.5">Requiere acción de su parte</span>
                        )}
                        {diasBloqueada(t) !== null && (
                          <span className="inline-block mt-1 ml-1 text-[11px] text-slate-500">{textoDiasBloqueada(diasBloqueada(t))}</span>
                        )}
                        {t.bloqueo === 'interno' && (
                          <span className="inline-block mt-1 text-[11px] font-semibold bg-violet-100 text-violet-700 rounded-md px-1.5 py-0.5">En gestión del equipo</span>
                        )}
                      </div>
                      <span className={cn('text-xs flex-shrink-0', venc ? 'text-red-500 font-semibold' : 'text-slate-400')}>
                        {formatFecha(t.fechaFin)}
                      </span>
                    </div>
                    {t.notas?.trim() && (
                      <div className="mt-2 flex gap-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">
                        <StickyNote size={14} className="flex-shrink-0 mt-0.5 text-slate-400" />
                        <p className="whitespace-pre-wrap leading-relaxed">{t.notas.trim()}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Hitos con aprobación */}
        {hitos.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Hitos y aprobaciones</h2>
            <div className="space-y-3">
              {hitos.map(t => {
                const ec = ESTADO_COLORS[t.estado]
                const venc = isVencida(t.fechaFin)
                const aprobado = aprobaciones[t.id]
                const completado = t.estado === 'completada'
                return (
                  <div key={t.id} className={cn(
                    'flex items-center gap-3 py-3 px-4 rounded-xl border',
                    aprobado ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                  )}>
                    <div className={cn('w-2 h-2 rounded-full flex-shrink-0', ec.dot)} />
                    <span className={cn('flex-1 text-sm font-medium', !completado && 'text-slate-800', completado && !aprobado && 'text-slate-500')}>{t.titulo}</span>
                    <span className={cn('text-xs flex-shrink-0', venc && !completado ? 'text-red-500 font-semibold' : 'text-slate-400')}>{formatFecha(t.fechaFin)}</span>
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0', ec.bg, ec.text)}>{ESTADO_LABELS[t.estado]}</span>
                    {aprobado ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <CheckCircle2 size={14} className="text-emerald-500" />
                        <span className="text-[11px] text-emerald-600 font-medium">Aprobado por {aprobado.nombre}</span>
                      </div>
                    ) : completado ? (
                      <button
                        onClick={() => pedirNombreYHacer('aprobar', t.id)}
                        disabled={aprobando === t.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-semibold rounded-lg flex-shrink-0 transition-colors"
                      >
                        {aprobando === t.id
                          ? <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                          : <ThumbsUp size={12} />}
                        Aprobar
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic flex-shrink-0">Pendiente</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Cronograma */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-700">Cronograma</h2>
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              {([['lista', 'Lista', <List size={13} key="l" />], ['gantt', 'Gantt', <GanttChartSquare size={13} key="g" />]] as const).map(([v, label, icon]) => (
                <button key={v} onClick={() => setVistaCrono(v)}
                  className={cn('flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    vistaCrono === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>
          {vistaCrono === 'gantt' ? (
            <div className="h-[640px]">
              <Suspense fallback={<div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>}>
                <GanttVisual tareas={enriched} />
              </Suspense>
            </div>
          ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row, i) => {
              if (row.kind === 'fase_header') {
                return (
                  <div key={`fase-${i}`} className="bg-indigo-600 px-5 py-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">{row.label}</span>
                  </div>
                )
              }
              const { tarea, nivel } = row
              const isGrupo = tarea.tipo === 'grupo'
              const ec = ESTADO_COLORS[tarea.estado]
              const num = numeros.get(tarea.id)
              return (
                <div key={tarea.id}
                  style={{ paddingLeft: 20 + nivel * 20 }}
                  className={cn('flex items-center gap-3 px-5 py-2.5', isGrupo ? 'bg-slate-50' : '')}
                >
                  {num && <span className="text-[10px] font-mono text-slate-300 w-6 flex-shrink-0 text-right">{num}</span>}
                  {isGrupo
                    ? <span className="text-[10px] text-indigo-500 font-bold flex-shrink-0">▶</span>
                    : tarea.tipo === 'hito'
                      ? <span className="text-[10px] text-rose-500 font-bold flex-shrink-0">◆</span>
                      : <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5', ec.dot)} />
                  }
                  <span className={cn('flex-1 text-sm min-w-0 truncate', isGrupo ? 'font-semibold text-slate-700' : 'text-slate-800')}>{tarea.titulo}</span>
                  {!isGrupo && (
                    <>
                      {tarea.fase && <span className="text-[10px] text-indigo-500 font-medium hidden sm:block">{tarea.fase}</span>}
                      <span className="text-xs text-slate-400 hidden sm:block flex-shrink-0">{formatFecha(tarea.fechaFin)}</span>
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0', ec.bg, ec.text)}>{ESTADO_LABELS[tarea.estado]}</span>
                      {tarea.progreso > 0 && (
                        <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden hidden sm:block flex-shrink-0">
                          <div className={cn('h-full rounded-full', tarea.progreso === 100 ? 'bg-emerald-500' : 'bg-indigo-500')} style={{ width: `${tarea.progreso}%` }} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
            {rows.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Circle size={24} className="text-slate-200 mb-2" />
                <p className="text-sm text-slate-400">Sin tareas aún</p>
              </div>
            )}
          </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-300 pb-4">
          Vista de cliente generada con Cronogramas App · Solo lectura
        </p>
      </div>

      {/* Modal: pedir nombre */}
      {showNombre && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowNombre(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">¿Cómo te llamas?</h3>
            <p className="text-sm text-slate-500">Tu nombre aparecerá junto a esta acción.</p>
            <input
              autoFocus
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="Tu nombre o empresa"
              value={nombreCliente}
              onChange={e => setNombreCliente(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && nombreCliente.trim() && pendingAccion) {
                  ejecutarAccion(pendingAccion, nombreCliente.trim(), pendingHitoId ?? undefined)
                }
              }}
            />
            <div className="flex gap-2">
              <button onClick={() => setShowNombre(false)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (nombreCliente.trim() && pendingAccion)
                    ejecutarAccion(pendingAccion, nombreCliente.trim(), pendingHitoId ?? undefined)
                }}
                disabled={!nombreCliente.trim()}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: solicitar cambio */}
      {showSolicitud && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { if (!enviandoSolicitud) setShowSolicitud(false) }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Solicitar un cambio</h3>
            <p className="text-sm text-slate-500">
              Describe el cambio que necesitas. El equipo lo revisará y decidirá si se incorpora al plan.
            </p>
            {solicitudEnviada ? (
              <div className="flex flex-col items-center py-6 text-center">
                <CheckCircle2 size={32} className="text-emerald-500 mb-3" />
                <p className="text-sm font-semibold text-slate-800">¡Solicitud enviada!</p>
                <p className="text-xs text-slate-500 mt-1">El equipo la revisará pronto.</p>
              </div>
            ) : (
              <>
                <textarea
                  autoFocus
                  rows={4}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  placeholder="Ej: Necesitamos añadir una fase de pruebas antes de la entrega final..."
                  value={descripcionSolicitud}
                  onChange={e => setDescripcionSolicitud(e.target.value)}
                />
                {errorAccion && <p className="text-xs text-rose-600">{errorAccion}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setShowSolicitud(false)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                    Cancelar
                  </button>
                  <button
                    onClick={doSolicitud}
                    disabled={!descripcionSolicitud.trim() || enviandoSolicitud}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors"
                  >
                    {enviandoSolicitud
                      ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                      : <><Send size={13} /> Enviar</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
