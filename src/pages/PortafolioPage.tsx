import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Activity, Ban, RefreshCw, Copy, Check, ArrowRight, StickyNote } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useEmpresas } from '@/hooks/useEmpresas'
import {
  fetchTareasGlobal, fetchProyectosGlobal, fetchClientesGlobal, fetchProyectosPorIds, fetchTareasDeProyectos,
} from '@/lib/firestore'
import { calcularSalud, SEMAFORO_ESTILOS } from '@/lib/saludUtils'
import { BarraAvance } from '@/components/proyecto/BarraAvance'
import {
  cn, formatFecha, diasBloqueada, textoDiasBloqueada, UMBRAL_BLOQUEO_DIAS, BLOQUEO_LABELS, BLOQUEO_COLORS,
} from '@/lib/utils'
import type { Tarea, Proyecto, Cliente, Empresa } from '@/types'

type Tab = 'salud' | 'bloqueos'
type Lado = 'todos' | 'cliente' | 'interno' | 'sin'

const ORDEN_SEMAFORO = { rojo: 0, amarillo: 1, verde: 2, sin_datos: 3 }

export function PortafolioPage() {
  const { permiso } = useAuth()
  const { empresas, loading: loadingEmpresas } = useEmpresas()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('tab') as Tab | null) ?? 'salud'
  const setTab = (t: Tab) => setSearchParams(p => { p.set('tab', t); return p }, { replace: true })

  const [datos, setDatos] = useState<{ proyectos: Proyecto[]; tareas: Tarea[]; clientes: Cliente[] } | null>(null)
  const [cargando, setCargando] = useState(true)
  const [version, setVersion] = useState(0)
  const empresaIds = useMemo(() => empresas.map(e => e.id), [empresas])
  const compartidos = permiso?.proyectosCompartidos ?? []

  useEffect(() => {
    if (loadingEmpresas) return
    let cancel = false
    Promise.all([
      fetchProyectosGlobal(empresaIds),
      fetchTareasGlobal(empresaIds),
      fetchClientesGlobal(empresaIds),
      fetchProyectosPorIds(compartidos.filter(Boolean)),
      fetchTareasDeProyectos(compartidos.filter(Boolean)),
    ]).then(([ps, ts, cs, psC, tsC]) => {
      if (cancel) return
      const proyectos = [...new Map([...ps, ...psC].map(p => [p.id, p])).values()]
      const tareas = [...new Map([...ts, ...tsC].map(t => [t.id, t])).values()]
      setDatos({ proyectos, tareas, clientes: cs })
      setCargando(false)
    }).catch(() => { if (!cancel) setCargando(false) })
    return () => { cancel = true }
  }, [loadingEmpresas, empresaIds.join(','), compartidos.join(','), version])

  const recargar = () => { setCargando(true); setVersion(v => v + 1) }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Portafolio</h1>
          <p className="text-sm text-slate-500">Salud de todos tus proyectos y bloqueos pendientes, en un solo lugar</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 rounded-xl p-1">
            {([['salud', 'Salud de proyectos', <Activity size={14} key="a" />], ['bloqueos', 'Bloqueos', <Ban size={14} key="b" />]] as const).map(([t, label, icon]) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                {icon} {label}
              </button>
            ))}
          </div>
          <button onClick={recargar} title="Actualizar"
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50">
            <RefreshCw size={15} className={cn(cargando && 'animate-spin')} />
          </button>
        </div>
      </div>

      {cargando && !datos ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !datos ? (
        <p className="text-sm text-slate-500">No se pudo cargar el portafolio.</p>
      ) : tab === 'salud' ? (
        <SaludTab {...datos} empresas={empresas} />
      ) : (
        <BloqueosTab {...datos} empresas={empresas} />
      )}
    </div>
  )
}

// ─── Salud ────────────────────────────────────────────────────────────────────

function rutaProyecto(p: Proyecto) {
  return p.clienteId ? `/empresa/${p.empresaId}/cliente/${p.clienteId}/proyecto/${p.id}` : `/empresa/${p.empresaId}/proyecto/${p.id}`
}

function SaludTab({ proyectos, tareas, clientes, empresas }: { proyectos: Proyecto[]; tareas: Tarea[]; clientes: Cliente[]; empresas: Empresa[] }) {
  const navigate = useNavigate()
  const [verTodos, setVerTodos] = useState(false)

  const filas = useMemo(() => {
    const porProyecto = new Map<string, Tarea[]>()
    tareas.forEach(t => { if (!porProyecto.has(t.proyectoId)) porProyecto.set(t.proyectoId, []); porProyecto.get(t.proyectoId)!.push(t) })
    return proyectos
      .filter(p => verTodos || p.estado === 'activo')
      // Proyecto global: su salud sale de las tareas propias + las de sus subproyectos
      .map(p => ({ p, salud: calcularSalud([p.id, ...(p.subproyectos ?? [])].flatMap(id => porProyecto.get(id) ?? [])) }))
      .sort((a, b) => ORDEN_SEMAFORO[a.salud.semaforo] - ORDEN_SEMAFORO[b.salud.semaforo] || a.salud.diferencia - b.salud.diferencia)
  }, [proyectos, tareas, verTodos])

  const conteo = { rojo: 0, amarillo: 0, verde: 0, sin_datos: 0 }
  filas.forEach(f => { conteo[f.salud.semaforo]++ })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['rojo', 'amarillo', 'verde', 'sin_datos'] as const).map(s => (
          <div key={s} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className={cn('w-2.5 h-2.5 rounded-full', SEMAFORO_ESTILOS[s].dot)} />
              <span className="text-xs text-slate-500">{SEMAFORO_ESTILOS[s].label}</span>
            </div>
            <p className="text-2xl font-bold text-slate-800 mt-1">{conteo[s]}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <p>Avance real vs. lo que debería llevar hoy según las fechas de cada tarea.</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={verTodos} onChange={e => setVerTodos(e.target.checked)} className="accent-indigo-600" />
          Incluir pausados y completados
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Salud', 'Proyecto', 'Avance real / esperado', 'Dif.', 'Vencidas', 'Bloqueadas', 'Fin'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map(({ p, salud }) => {
              const est = SEMAFORO_ESTILOS[salud.semaforo]
              const cliente = clientes.find(c => c.id === p.clienteId)?.nombre
              const empresa = empresas.find(e => e.id === p.empresaId)?.nombre
              return (
                <tr key={p.id} onClick={() => navigate(rutaProyecto(p) + '?tab=dashboard')} className="hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full', est.bg, est.text)} title={salud.motivo}>
                      <span className={cn('w-2 h-2 rounded-full', est.dot)} /> {est.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{p.nombre}{p.subproyectos?.length ? <span className="ml-1.5 text-[10px] font-semibold text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5">GLOBAL · {p.subproyectos.length}</span> : null}</p>
                    <p className="text-[11px] text-slate-400">{[cliente, empresa].filter(Boolean).join(' · ')}</p>
                    <p className="text-[11px] text-slate-500">{salud.motivo}</p>
                  </td>
                  <td className="px-4 py-3 w-56">
                    <BarraAvance salud={salud} />
                  </td>
                  <td className={cn('px-4 py-3 font-semibold', salud.diferencia < -8 ? 'text-red-600' : salud.diferencia < 0 ? 'text-amber-600' : 'text-emerald-600')}>
                    {salud.diferencia > 0 ? '+' : ''}{salud.diferencia}
                  </td>
                  <td className={cn('px-4 py-3', salud.vencidas ? 'text-red-600 font-semibold' : 'text-slate-400')}>{salud.vencidas}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {salud.bloqueadas}{salud.bloqueadasCliente ? <span className="text-[11px] text-amber-700"> ({salud.bloqueadasCliente} cliente)</span> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatFecha(p.fechaFin)}</td>
                </tr>
              )
            })}
            {filas.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No hay proyectos activos</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Bloqueos ─────────────────────────────────────────────────────────────────

function BloqueosTab({ proyectos, tareas, clientes, empresas }: { proyectos: Proyecto[]; tareas: Tarea[]; clientes: Cliente[]; empresas: Empresa[] }) {
  const navigate = useNavigate()
  const [lado, setLado] = useState<Lado>('cliente')
  const [empresaId, setEmpresaId] = useState('')
  const [soloViejos, setSoloViejos] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)

  const proyectoPorId = useMemo(() => new Map(proyectos.map(p => [p.id, p])), [proyectos])
  const bloqueadas = useMemo(() => tareas.filter(t =>
    t.tipo !== 'grupo' && t.estado === 'bloqueada' && proyectoPorId.has(t.proyectoId) &&
    proyectoPorId.get(t.proyectoId)!.estado !== 'archivado'
  ), [tareas, proyectoPorId])

  const conteo = {
    todos: bloqueadas.length,
    cliente: bloqueadas.filter(t => t.bloqueo === 'cliente').length,
    interno: bloqueadas.filter(t => t.bloqueo === 'interno').length,
    sin: bloqueadas.filter(t => !t.bloqueo).length,
  }
  const viejas = bloqueadas.filter(t => (diasBloqueada(t) ?? 0) >= UMBRAL_BLOQUEO_DIAS).length

  // Agrupar por cliente (o empresa si el proyecto no tiene cliente)
  const grupos = useMemo(() => {
    const filtradas = bloqueadas.filter(t => {
      const p = proyectoPorId.get(t.proyectoId)!
      if (empresaId && p.empresaId !== empresaId) return false
      if (lado !== 'todos' && (lado === 'sin' ? !!t.bloqueo : t.bloqueo !== lado)) return false
      if (soloViejos && (diasBloqueada(t) ?? 0) < UMBRAL_BLOQUEO_DIAS) return false
      return true
    })
    const map = new Map<string, { nombre: string; tareas: Tarea[] }>()
    for (const t of filtradas) {
      const p = proyectoPorId.get(t.proyectoId)!
      const cliente = clientes.find(c => c.id === p.clienteId)
      const key = cliente?.id ?? `emp:${p.empresaId}`
      const nombre = cliente?.nombre ?? `${empresas.find(e => e.id === p.empresaId)?.nombre ?? 'Empresa'} (sin cliente)`
      if (!map.has(key)) map.set(key, { nombre, tareas: [] })
      map.get(key)!.tareas.push(t)
    }
    return [...map.entries()]
      .map(([key, g]) => ({ key, ...g, tareas: g.tareas.sort((a, b) => (diasBloqueada(b) ?? 0) - (diasBloqueada(a) ?? 0)) }))
      .sort((a, b) => b.tareas.length - a.tareas.length)
  }, [bloqueadas, proyectoPorId, clientes, empresas, empresaId, lado, soloViejos])

  const copiar = async (key: string, nombre: string, ts: Tarea[]) => {
    const texto = [
      `Pendientes bloqueados — ${nombre}`,
      '',
      ...ts.flatMap(t => [
        `⛔ ${t.titulo} (${proyectoPorId.get(t.proyectoId)?.nombre})`,
        `   ${textoDiasBloqueada(diasBloqueada(t))}${t.bloqueo ? ` · ${BLOQUEO_LABELS[t.bloqueo]}` : ''}`,
        `   Motivo: ${t.notas?.trim() || 'Sin motivo registrado'}`,
        '',
      ]),
    ].join('\n')
    await navigator.clipboard.writeText(texto)
    setCopiado(key)
    setTimeout(() => setCopiado(null), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {([['Bloqueadas', conteo.todos, 'text-slate-800'], ['Del cliente', conteo.cliente, 'text-amber-700'], ['Internas', conteo.interno, 'text-violet-700'],
           ['Sin clasificar', conteo.sin, 'text-slate-500'], [`${UMBRAL_BLOQUEO_DIAS}+ días`, viejas, 'text-red-600']] as const).map(([l, v, c]) => (
          <div key={l} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{l}</p>
            <p className={cn('text-2xl font-bold mt-1', c)}>{v}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {([['cliente', 'Del cliente'], ['interno', 'Internos'], ['sin', 'Sin clasificar'], ['todos', 'Todos']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setLado(v)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              lado === v ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
            {label} ({conteo[v]})
          </button>
        ))}
        <select value={empresaId} onChange={e => setEmpresaId(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 bg-white">
          <option value="">Todas las empresas</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" checked={soloViejos} onChange={e => setSoloViejos(e.target.checked)} className="accent-red-600" />
          Solo con {UMBRAL_BLOQUEO_DIAS}+ días
        </label>
      </div>

      {grupos.length === 0 ? (
        <p className="text-sm text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center">No hay bloqueos con estos filtros 🎉</p>
      ) : grupos.map(g => (
        <div key={g.key} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800">{g.nombre} <span className="text-slate-400 font-normal">· {g.tareas.length}</span></p>
            <button onClick={() => copiar(g.key, g.nombre, g.tareas)}
              className="flex items-center gap-1.5 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-2.5 py-1 rounded-lg">
              {copiado === g.key ? <><Check size={12} className="text-emerald-500" /> Copiado</> : <><Copy size={12} /> Copiar para seguimiento</>}
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {g.tareas.map(t => {
              const p = proyectoPorId.get(t.proyectoId)!
              const dias = diasBloqueada(t)
              return (
                <button key={t.id} onClick={() => navigate(`${rutaProyecto(p)}?tarea=${t.id}`)}
                  className="w-full text-left px-5 py-3 hover:bg-slate-50 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-slate-400">{p.nombre}</p>
                    <p className="text-sm font-medium text-slate-800">{t.titulo}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-1 text-[11px]">
                      {dias !== null && (
                        <span className={cn('px-1.5 py-0.5 rounded-md font-semibold', dias >= UMBRAL_BLOQUEO_DIAS ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700')}>
                          ⏱ {textoDiasBloqueada(dias)}
                        </span>
                      )}
                      {t.bloqueo
                        ? <span className={cn('px-1.5 py-0.5 rounded-md font-semibold', BLOQUEO_COLORS[t.bloqueo].bg, BLOQUEO_COLORS[t.bloqueo].text)}>{BLOQUEO_LABELS[t.bloqueo]}</span>
                        : <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">Sin clasificar</span>}
                      <span className="text-slate-500">👤 {(t.asignadosA?.length ? t.asignadosA : t.asignadoA ? [t.asignadoA] : []).join(', ') || 'Sin asignar'}</span>
                    </div>
                    <p className={cn('text-xs mt-1.5 flex gap-1.5', t.notas?.trim() ? 'text-slate-600' : 'text-amber-700')}>
                      <StickyNote size={12} className="flex-shrink-0 mt-0.5 opacity-60" />
                      {t.notas?.trim() || 'Sin motivo registrado'}
                    </p>
                  </div>
                  <ArrowRight size={14} className="text-slate-300 mt-1 flex-shrink-0" />
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
