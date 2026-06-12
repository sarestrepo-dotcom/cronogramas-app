import { useState, useEffect } from 'react'
import { Timestamp } from 'firebase/firestore'
import {
  X, Sparkles, CheckCircle2, AlertCircle, Loader2,
  ArrowRight, ToggleLeft, ToggleRight, Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { actualizarTarea, crearTarea, getEmailConfig } from '@/lib/firestore'
import { parsearEmailConGroq, parsearFechaIA } from '@/lib/groqUtils'
import { useAuth } from '@/hooks/useAuth'
import type { CambioPropuesto, TareaNuevaPropuesta, Tarea } from '@/types'

const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente', en_progreso: 'En progreso',
  completada: 'Completada', bloqueada: 'Bloqueada',
}
const ESTADO_BADGE: Record<string, string> = {
  pendiente:   'bg-slate-100 text-slate-600',
  en_progreso: 'bg-blue-100 text-blue-700',
  completada:  'bg-emerald-100 text-emerald-700',
  bloqueada:   'bg-red-100 text-red-700',
}
const CAMPO_LABEL: Record<string, string> = {
  estado: 'Estado', progreso: 'Progreso', notas: 'Notas',
  fechaInicio: 'Fecha inicio', fechaFin: 'Fecha fin', responsable: 'Responsable',
}
const CAMPO_ICON: Record<string, string> = {
  estado: '🔄', progreso: '📊', notas: '📝', fechaInicio: '📅', fechaFin: '📅', responsable: '👤',
}

interface Props {
  proyectoId: string
  empresaId: string
  uid: string
  tareas: Tarea[]
  onClose: () => void
  onAplicado: (count: number) => void
}

export function ProcesarEmailModal({ proyectoId, empresaId, uid, tareas, onClose, onAplicado }: Props) {
  const { user } = useAuth()
  const [texto, setTexto]           = useState('')
  const [paso, setPaso]             = useState<'entrada' | 'preview'>('entrada')
  const [cambios, setCambios]       = useState<CambioPropuesto[]>([])
  const [nuevas, setNuevas]         = useState<TareaNuevaPropuesta[]>([])
  const [groqKey, setGroqKey]       = useState<string | null>(null)
  const [keyLoading, setKeyLoading] = useState(true)
  const [analizando, setAnalizando] = useState(false)
  const [aplicando, setAplicando]   = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    if (!user) return
    getEmailConfig(user.uid).then(cfg => {
      setGroqKey(cfg?.groqApiKey ?? null)
      setKeyLoading(false)
    })
  }, [user?.uid])

  const analizar = async () => {
    if (!texto.trim() || !groqKey) return
    setAnalizando(true); setError('')
    try {
      const resultado = await parsearEmailConGroq(texto.trim(), tareas, groqKey)
      if (resultado.cambios.length === 0 && resultado.nuevasTareas.length === 0) {
        setError('No se detectaron cambios ni tareas nuevas. Sé más específico: menciona el nombre de la tarea y el cambio.')
        return
      }
      setCambios(resultado.cambios)
      setNuevas(resultado.nuevasTareas)
      setPaso('preview')
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Error desconocido')
    } finally {
      setAnalizando(false)
    }
  }

  const toggleCambio = (i: number) =>
    setCambios(prev => prev.map((c, idx) => idx === i ? { ...c, aplicar: !c.aplicar } : c))
  const toggleNueva = (i: number) =>
    setNuevas(prev => prev.map((n, idx) => idx === i ? { ...n, aplicar: !n.aplicar } : n))

  const aplicar = async () => {
    setAplicando(true); setError('')
    let total = 0
    try {
      // Apply changes to existing tasks
      for (const c of cambios.filter(x => x.aplicar)) {
        const update: Record<string, unknown> = {}
        if (c.campo === 'estado') {
          update.estado = c.valorNuevo
          if (c.valorNuevo === 'completada') update.progreso = 100
        }
        if (c.campo === 'progreso') update.progreso = Number(c.valorNuevo)
        if (c.campo === 'notas')    update.notas    = String(c.valorNuevo)
        if (c.campo === 'fechaInicio') {
          const iso = parsearFechaIA(String(c.valorNuevo))
          if (iso) update.fechaInicio = Timestamp.fromDate(new Date(iso + 'T00:00:00'))
        }
        if (c.campo === 'fechaFin') {
          const iso = parsearFechaIA(String(c.valorNuevo))
          if (iso) update.fechaFin = Timestamp.fromDate(new Date(iso + 'T23:59:59'))
        }
        if (c.campo === 'responsable') {
          update.asignadoA = String(c.valorNuevo).trim() || undefined
        }
        await actualizarTarea(c.tareaId, update)
        total++
      }

      // Create new tasks
      for (const n of nuevas.filter(x => x.aplicar)) {
        const isoInicio = parsearFechaIA(n.fechaInicio)
        const isoFin    = parsearFechaIA(n.fechaFin)
        const hoy = new Date().toISOString().split('T')[0]
        await crearTarea({
          titulo:       n.titulo,
          descripcion:  n.descripcion || '',
          fechaInicio:  Timestamp.fromDate(new Date((isoInicio || hoy) + 'T00:00:00')),
          fechaFin:     Timestamp.fromDate(new Date((isoFin || isoInicio || hoy) + 'T23:59:59')),
          estado:       'pendiente',
          prioridad:    'media',
          tipo:         'tarea',
          asignadoA:    n.responsable || undefined,
          fase:         n.fase || undefined,
          progreso:     0,
          dependencias: [],
          proyectoId,
          empresaId,
          creadoPor:    uid,
        } as Omit<Tarea, 'id' | 'creadoEn' | 'actualizadoEn'>)
        total++
      }

      onAplicado(total)
      onClose()
    } catch (e: unknown) {
      setError(`Error al aplicar: ${(e as Error).message}`)
    } finally {
      setAplicando(false)
    }
  }

  const totalSeleccionados = cambios.filter(c => c.aplicar).length + nuevas.filter(n => n.aplicar).length
  const formatValor = (campo: string, val: string | number) => {
    if (campo === 'estado')   return ESTADO_LABELS[String(val)] ?? String(val)
    if (campo === 'progreso') return `${val}%`
    return String(val).slice(0, 70) + (String(val).length > 70 ? '…' : '')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Sparkles size={16} className="text-violet-500" />
              Procesar respuesta de email con IA
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {paso === 'entrada'
                ? 'Pega el reply del equipo — Groq detecta cambios de estado, fechas, responsables y tareas nuevas'
                : `${cambios.length} cambio${cambios.length !== 1 ? 's' : ''} · ${nuevas.length} tarea${nuevas.length !== 1 ? 's' : ''} nueva${nuevas.length !== 1 ? 's' : ''} detectada${nuevas.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* PASO 1: Entrada */}
          {paso === 'entrada' && (
            <div className="space-y-4">
              {/* API key status */}
              {!keyLoading && (
                <div className={cn('flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm',
                  groqKey ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                          : 'bg-amber-50 border border-amber-200 text-amber-700')}>
                  {groqKey
                    ? <><CheckCircle2 size={14} /> Groq configurado y listo</>
                    : <><AlertCircle size={14} /> Falta la clave de Groq.{' '}
                        <a href="/settings" onClick={onClose} className="font-semibold underline ml-1">
                          Ir a Configuración → Email semanal
                        </a></>}
                </div>
              )}

              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-700 space-y-2">
                <p className="font-semibold">Groq detecta automáticamente:</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {[
                    ['🔄', 'Cambios de estado',    '"ya terminé", "está bloqueada"'],
                    ['📊', 'Avance / progreso',    '"voy al 70%", "80% listo"'],
                    ['📅', 'Cambios de fecha',      '"se corre al 15/07", "hasta agosto"'],
                    ['👤', 'Cambio de responsable', '"pasar las tareas de Andrés a Sergio"'],
                    ['➕', 'Tareas nuevas',         '"hay que agregar...", "nueva tarea:"'],
                  ].map(([icon, label, ejemplo]) => (
                    <div key={label} className="flex flex-col gap-0.5">
                      <span className="font-medium">{icon} {label}</span>
                      <span className="text-indigo-500 italic">{ejemplo}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Texto del email de respuesta</label>
                <textarea
                  className="w-full h-56 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-700 focus:outline-none focus:border-indigo-400 resize-none placeholder:text-slate-400 font-mono"
                  placeholder={'Pega aquí el reply recibido. Ejemplo:\n\nHola! Las actualizaciones de esta semana:\n- PPT credenciales: lista al 100%\n- Levantamiento de procesos: voy al 60%\n- La fecha de entrega de documentación se corre al 30/06\n- La documentación está bloqueada, necesito el formato\n- Hay que agregar una tarea de capacitación el 15/07\n\nSaludos!'}
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  <AlertCircle size={15} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {/* PASO 2: Preview */}
          {paso === 'preview' && (
            <div className="space-y-4">

              {/* Cambios en tareas existentes */}
              {cambios.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Cambios en tareas existentes ({cambios.length})
                  </h3>
                  <div className="space-y-2">
                    {cambios.map((c, i) => (
                      <div key={i}
                        onClick={() => toggleCambio(i)}
                        className={cn(
                          'flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all',
                          c.aplicar ? 'border-violet-300 bg-violet-50/40' : 'border-slate-200 bg-slate-50 opacity-55'
                        )}>
                        <div className="flex-shrink-0 mt-0.5">
                          {c.aplicar ? <ToggleRight size={20} className="text-violet-600" /> : <ToggleLeft size={20} className="text-slate-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate mb-1">{c.titulo}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                              {CAMPO_ICON[c.campo]} {CAMPO_LABEL[c.campo] ?? c.campo}
                            </span>
                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                              c.campo === 'estado' ? (ESTADO_BADGE[c.valorActual as string] ?? 'bg-slate-100 text-slate-500') : 'bg-slate-100 text-slate-500')}>
                              {formatValor(c.campo, c.valorActual)}
                            </span>
                            <ArrowRight size={11} className="text-slate-400 flex-shrink-0" />
                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold',
                              c.campo === 'estado' ? (ESTADO_BADGE[c.valorNuevo as string] ?? 'bg-violet-100 text-violet-700') : 'bg-violet-100 text-violet-700')}>
                              {formatValor(c.campo, c.valorNuevo)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Nuevas tareas */}
              {nuevas.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Tareas nuevas a crear ({nuevas.length})
                  </h3>
                  <div className="space-y-2">
                    {nuevas.map((n, i) => (
                      <div key={i}
                        onClick={() => toggleNueva(i)}
                        className={cn(
                          'flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all',
                          n.aplicar ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-slate-50 opacity-55'
                        )}>
                        <div className="flex-shrink-0 mt-0.5">
                          {n.aplicar ? <ToggleRight size={20} className="text-emerald-600" /> : <ToggleLeft size={20} className="text-slate-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Plus size={12} className="text-emerald-600 flex-shrink-0" />
                            <p className="text-sm font-semibold text-slate-800 truncate">{n.titulo}</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-xs">
                            {n.fase && (
                              <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                                {n.fase}
                              </span>
                            )}
                            {n.fechaInicio && (
                              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                📅 {n.fechaInicio} → {n.fechaFin || n.fechaInicio}
                              </span>
                            )}
                            {n.responsable && (
                              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                👤 {n.responsable}
                              </span>
                            )}
                            {n.descripcion && (
                              <span className="text-slate-400 italic">
                                {n.descripcion.slice(0, 60)}{n.descripcion.length > 60 ? '…' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  <AlertCircle size={15} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex-shrink-0">
          <div>
            {paso === 'preview' && (
              <button onClick={() => { setPaso('entrada'); setError('') }}
                className="text-sm text-slate-500 hover:text-slate-700">← Volver</button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="btn-secondary">Cancelar</button>
            {paso === 'entrada' && (
              <button onClick={analizar} disabled={!texto.trim() || analizando || keyLoading || !groqKey}
                className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {analizando ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {analizando ? 'Analizando...' : 'Analizar con Groq'}
              </button>
            )}
            {paso === 'preview' && (
              <button onClick={aplicar} disabled={totalSeleccionados === 0 || aplicando}
                className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {aplicando ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {aplicando ? 'Aplicando...' : `Aplicar ${totalSeleccionados} cambio${totalSeleccionados !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
