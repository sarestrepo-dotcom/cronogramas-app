import { useEffect, useState } from 'react'
import { X, Link2, Copy, Check, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn, tsToDate } from '@/lib/utils'
import type { Proyecto } from '@/types'

interface Props {
  proyecto: Proyecto
  onClose: () => void
}

const ARCHIVOS = {
  codigo: '/integraciones/cronogramas-cor.gs',
  manifiesto: '/integraciones/appsscript.json',
}

const MAPEO: Array<[string, string]> = [
  ['Tarea', 'Título y descripción'],
  ['Estado', 'Nueva → Pendiente · En proceso → En progreso · Estancada o Suspendida → Bloqueada · Finalizada → Completada'],
  ['Motivo del bloqueo', 'Último mensaje de la tarea en COR que empiece por "Bloqueo cliente: …", "Bloqueo interno: …" o "Bloqueo: …". Llena la nota (la ve el cliente en el portal) y el tipo de bloqueo'],
  ['Prioridad', 'Baja / Media / Alta / Urgente → Crítica'],
  ['Fechas', 'Fecha de inicio (si COR la envía) y fecha de entrega (deadline)'],
  ['Responsables', 'Colaboradores asignados a la tarea'],
  ['Horas', 'Horas registradas por tarea (y estimadas si COR las envía)'],
  ['No se trae', 'Tareas cuyo título empiece por "[Interno]" (reuniones, seguimientos del equipo) y todas sus subtareas'],
  ['Jerarquía', 'Tarea raíz con subtareas (p. ej. "SPRINT 01") → Fase · tarea madre intermedia ("Kick off") → ▶ Grupo · subtareas → tareas del grupo'],
  ['Fase', 'Etiqueta de COR que empiece por "Fase" o "F1, F2…" (p. ej. "Fase 1 · Kickoff"). Si no hay, la categoría; o el título con prefijo "[Fase 1] …"'],
  ['Sprint', 'Sprint de la tarea cuando existe'],
]

export function CorSyncModal({ proyecto, onClose }: Props) {
  const [copiado, setCopiado] = useState<string | null>(null)
  const [textos, setTextos] = useState<Record<string, string>>({})
  const urlProyecto = `${window.location.origin}/empresa/${proyecto.empresaId}/proyecto/${proyecto.id}`
  const sync = proyecto.corSync

  useEffect(() => {
    Promise.all(Object.entries(ARCHIVOS).map(async ([k, url]) => [k, await (await fetch(url, { cache: 'no-store' })).text()] as const))
      .then(pares => setTextos(Object.fromEntries(pares)))
      .catch(() => {})
  }, [])

  const copiar = async (clave: string, texto?: string) => {
    if (!texto) return
    await navigator.clipboard.writeText(texto)
    setCopiado(clave)
    setTimeout(() => setCopiado(null), 2000)
  }
  const Btn = ({ clave, texto, label }: { clave: string; texto?: string; label: string }) => (
    <button onClick={() => copiar(clave, texto)} disabled={!texto}
      className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1 rounded-lg disabled:opacity-50">
      {copiado === clave ? <><Check size={12} className="text-emerald-500" /> Copiado</> : <><Copy size={12} /> {label}</>}
    </button>
  )

  const pasos: Array<[string, React.ReactNode]> = [
    ['Crea un Google Sheet "Panel COR" (una sola vez para todas tus empresas)',
      'Desde ahí se administran las conexiones con COR. Usa la cuenta de Google que administra Firebase.'],
    ['Pega el código en Extensiones → Apps Script', (
      <div className="space-y-2">
        <p>Reemplaza <code>Código.gs</code> con:</p>
        <Btn clave="codigo" texto={textos.codigo} label="Copiar código COR" />
        <p>En ⚙️ Configuración del proyecto activa "Mostrar appsscript.json" y reemplázalo con:</p>
        <Btn clave="manifiesto" texto={textos.manifiesto} label="Copiar appsscript.json" />
        <p>Guarda y recarga el Sheet: aparecerá el menú <b>COR</b>.</p>
      </div>
    )],
    ['Agrega cada instancia de COR', (
      <p>Menú <b>COR → Agregar instancia…</b>: un nombre (p. ej. "SM Digital"), el <b>API key</b> y el <b>client secret</b> de esa empresa.
        Las llaves se guardan en las propiedades privadas del script, nunca en la hoja.</p>
    )],
    ['Vincula el proyecto de COR con este proyecto', (
      <div className="space-y-2">
        <p><b>COR → Ver proyectos de COR…</b> lista los proyectos con su ID. Luego <b>COR → Vincular proyecto…</b> con la instancia, el ID del proyecto de COR y este enlace:</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 truncate text-[11px] bg-slate-100 rounded-lg px-2 py-1">{urlProyecto}</code>
          <Btn clave="url" texto={urlProyecto} label="Copiar" />
        </div>
      </div>
    )],
    ['Activa la sincronización automática (la cuenta administradora)', (
      <div className="space-y-1">
        <p><b>COR → Activar sincronización automática</b>: cada 10 minutos, con la cuenta que tiene acceso a Firebase.</p>
        <p>Otras personas del equipo (incluso de otros dominios, p. ej. @triciclo.mx) pueden usar el mismo Panel: agregar instancias,
          vincular proyectos y pedir <b>Sincronizar ahora</b>. Sus solicitudes las ejecuta la cuenta administradora en menos de 1 minuto.</p>
      </div>
    )],
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center"><Link2 size={17} className="text-sky-600" /></div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Sincronizar con COR</h2>
              <p className="text-xs text-slate-500">COR manda: las tareas del proyecto de COR se reflejan aquí cada 10 minutos</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          {sync && (
            <div className={cn('rounded-xl border px-4 py-3 text-sm flex items-start gap-3',
              sync.error ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-sky-50 border-sky-200 text-sky-800')}>
              {sync.error ? <AlertTriangle size={16} className="mt-0.5" /> : <CheckCircle2 size={16} className="mt-0.5" />}
              <div>
                <p className="font-semibold">Vinculado con "{sync.nombre}" ({sync.instancia}) · {sync.tareas} tareas</p>
                <p className="text-xs opacity-80">
                  Última sincronización {sync.ultimaSync ? formatDistanceToNow(tsToDate(sync.ultimaSync), { addSuffix: true, locale: es }) : '—'}
                  {sync.error ? ` · Error: ${sync.error}` : ''}
                </p>
              </div>
            </div>
          )}

          <ol className="space-y-4">
            {pasos.map(([titulo, detalle], i) => (
              <li key={i} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0 text-sm text-slate-600 space-y-1">
                  <p className="font-semibold text-slate-800">{titulo}</p>
                  <div className="text-xs leading-relaxed">{detalle}</div>
                </div>
              </li>
            ))}
          </ol>

          <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
            <p className="font-semibold text-slate-600 mb-1">Qué se trae de COR</p>
            <table className="w-full"><tbody>
              {MAPEO.map(([k, v]) => <tr key={k}><td className="pr-3 py-0.5 font-medium text-slate-600 whitespace-nowrap align-top">{k}</td><td className="py-0.5">{v}</td></tr>)}
            </tbody></table>
            <p className="mt-2">Las tareas archivadas o eliminadas en COR se eliminan aquí. Los cambios quedan en el historial de cada tarea y el portal del cliente se actualiza solo.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
