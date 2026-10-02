import { useEffect, useState } from 'react'
import { X, Sheet, Copy, Check, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn, tsToDate } from '@/lib/utils'
import type { Proyecto } from '@/types'

interface Props {
  proyecto: Proyecto
  onClose: () => void
}

// El código del Apps Script se sirve como archivo estático (public/integraciones)
const ARCHIVOS = {
  codigo: '/integraciones/cronogramas-sheets.gs',
  manifiesto: '/integraciones/appsscript.json',
}

export function SheetsSyncModal({ proyecto, onClose }: Props) {
  const [copiado, setCopiado] = useState<string | null>(null)
  const [textos, setTextos] = useState<Record<string, string>>({})
  const urlProyecto = `${window.location.origin}/empresa/${proyecto.empresaId}/proyecto/${proyecto.id}`
  const sync = proyecto.sheetSync

  useEffect(() => {
    Promise.all(Object.entries(ARCHIVOS).map(async ([k, url]) => [k, await (await fetch(url, { cache: 'no-store' })).text()] as const))
      .then(pares => setTextos(Object.fromEntries(pares)))
      .catch(() => {})
  }, [])

  const copiar = async (clave: string, texto: string) => {
    await navigator.clipboard.writeText(texto)
    setCopiado(clave)
    setTimeout(() => setCopiado(null), 2000)
  }

  const BotonCopiar = ({ clave, texto, label }: { clave: string; texto?: string; label: string }) => (
    <button onClick={() => texto && copiar(clave, texto)} disabled={!texto}
      className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50">
      {copiado === clave ? <><Check size={12} className="text-emerald-500" /> Copiado</> : <><Copy size={12} /> {label}</>}
    </button>
  )

  const pasos: Array<{ titulo: string; detalle: React.ReactNode }> = [
    {
      titulo: 'Abre tu Google Sheet y ve a Extensiones → Apps Script',
      detalle: 'Usa la cuenta de Google que administra Firebase (la del proyecto cronogramas-bluemartech).',
    },
    {
      titulo: 'Pega el código',
      detalle: (
        <div className="space-y-2">
          <p>Reemplaza todo el contenido de <code>Código.gs</code> con este código:</p>
          <BotonCopiar clave="codigo" texto={textos.codigo} label="Copiar código" />
          <p>Luego, en ⚙️ <b>Configuración del proyecto</b>, activa <i>"Mostrar el archivo de manifiesto appsscript.json"</i>, ábrelo y reemplázalo con:</p>
          <BotonCopiar clave="manifiesto" texto={textos.manifiesto} label="Copiar appsscript.json" />
          <p>Guarda (💾) y vuelve al Sheet. Recarga la página: aparecerá el menú <b>Cronogramas</b>.</p>
        </div>
      ),
    },
    {
      titulo: 'Vincula la pestaña con este proyecto',
      detalle: (
        <div className="space-y-2">
          <p>Ubícate en la pestaña que tiene el cronograma → menú <b>Cronogramas → Vincular con proyecto…</b> y pega este enlace:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate text-[11px] bg-slate-100 rounded-lg px-2 py-1">{urlProyecto}</code>
            <BotonCopiar clave="url" texto={urlProyecto} label="Copiar" />
          </div>
          <p>Google pedirá autorizar el script la primera vez (si dice "app no verificada": <i>Configuración avanzada → Ir a…</i>; es tu propio script).</p>
        </div>
      ),
    },
    {
      titulo: 'Marca las filas que van a la app',
      detalle: (
        <p>
          El script agrega las columnas <b>Sincronizar</b> (casilla) e <b>ID App</b> (no la edites). Solo las filas marcadas
          llegan al proyecto; el resto de la hoja puede tener lo que quieras. Desde ese momento cada cambio se refleja en segundos.
        </p>
      ),
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Sheet size={17} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Sincronizar con Google Sheets</h2>
              <p className="text-xs text-slate-500">El Sheet manda: lo que cambie allá se refleja aquí en tiempo real</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          {sync && (
            <div className={cn('rounded-xl border px-4 py-3 text-sm flex items-start gap-3',
              sync.error ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800')}>
              {sync.error ? <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> : <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <p className="font-semibold">
                  Vinculado con "{sync.nombre}" · {sync.filas} fila{sync.filas === 1 ? '' : 's'}
                </p>
                <p className="text-xs opacity-80">
                  Última sincronización {sync.ultimaSync ? formatDistanceToNow(tsToDate(sync.ultimaSync), { addSuffix: true, locale: es }) : '—'}
                  {sync.error ? ` · Error: ${sync.error}` : ''}
                </p>
              </div>
              <a href={sync.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium underline flex-shrink-0">
                Abrir Sheet <ExternalLink size={11} />
              </a>
            </div>
          )}

          <ol className="space-y-4">
            {pasos.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0 text-sm text-slate-600 space-y-1">
                  <p className="font-semibold text-slate-800">{p.titulo}</p>
                  <div className="text-xs leading-relaxed">{p.detalle}</div>
                </div>
              </li>
            ))}
          </ol>

          <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-3 space-y-1">
            <p className="font-semibold text-slate-600">Cómo funciona</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Reconoce las columnas por su nombre: Número, Título/Actividad, Tipo, Fase, Padre, Fecha inicio, Fecha fin, Responsable, Estado, Prioridad, Progreso, Dependencia, Notas, Descripción.</li>
              <li>Solo actualiza los campos cuyas columnas existen en la hoja. Las demás columnas no viajan.</li>
              <li>Si borras o desmarcas una fila, la tarea se elimina del proyecto.</li>
              <li>Las tareas creadas aquí en la app no se tocan.</li>
              <li>Menú Cronogramas → <i>Marcar todas las filas</i> o <i>Sincronizar ahora</i> cuando lo necesites.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
