import { useState } from 'react'
import { deleteField } from 'firebase/firestore'
import { Trash2, AlertTriangle, Sheet } from 'lucide-react'
import { eliminarTarea, actualizarTarea } from '@/lib/firestore'
import type { Tarea } from '@/types'

interface Props {
  ids: string[]
  tareas: Tarea[]
  onClose: () => void
  onDone: (eliminadas: number) => void
}

// Todas las subtareas (cualquier nivel) de las tareas indicadas
function descendientes(ids: string[], tareas: Tarea[]): Tarea[] {
  const out: Tarea[] = []
  const vistos = new Set(ids)
  let frontera = ids
  while (frontera.length) {
    const hijos = tareas.filter(t => t.parentId && frontera.includes(t.parentId) && !vistos.has(t.id))
    hijos.forEach(h => { vistos.add(h.id); out.push(h) })
    frontera = hijos.map(h => h.id)
  }
  return out
}

/**
 * Confirmación de borrado. Si alguna tarea tiene subtareas, deja elegir entre borrarlas
 * también o conservarlas subiéndolas un nivel (antes quedaban sueltas como tareas raíz).
 */
export function EliminarTareasModal({ ids, tareas, onClose, onDone }: Props) {
  const [borrando, setBorrando] = useState(false)
  const seleccion = tareas.filter(t => ids.includes(t.id))
  const hijos = descendientes(ids, tareas)
  const delSheet = [...seleccion, ...hijos].filter(t => t.origen === 'sheets').length
  const delCor = [...seleccion, ...hijos].filter(t => t.origen === 'cor').length

  const ejecutar = async (conHijos: boolean) => {
    setBorrando(true)
    try {
      if (conHijos) {
        await Promise.all([...ids, ...hijos.map(h => h.id)].map(id => eliminarTarea(id)))
        onDone(ids.length + hijos.length)
      } else {
        // Hijos directos suben al padre de la tarea borrada (o a la raíz)
        const padreDe = new Map(seleccion.map(t => [t.id, t.parentId]))
        const directos = tareas.filter(t => t.parentId && ids.includes(t.parentId))
        await Promise.all(directos.map(h => {
          let nuevo = padreDe.get(h.parentId!)
          while (nuevo && ids.includes(nuevo)) nuevo = padreDe.get(nuevo)
          return actualizarTarea(h.id, { parentId: nuevo ?? (deleteField() as unknown as string) })
        }))
        await Promise.all(ids.map(id => eliminarTarea(id)))
        onDone(ids.length)
      }
    } finally {
      setBorrando(false)
      onClose()
    }
  }

  const titulo = ids.length === 1 ? `"${seleccion[0]?.titulo ?? 'esta tarea'}"` : `${ids.length} tareas`

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !borrando && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <Trash2 size={18} className="text-red-500" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">¿Eliminar {titulo}?</h3>
            <p className="text-sm text-slate-500 mt-1">Esta acción no se puede deshacer.</p>
          </div>
        </div>

        {hijos.length > 0 && (
          <div className="flex gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
            <p>Tiene <b>{hijos.length} subtarea{hijos.length === 1 ? '' : 's'}</b>. Elige si se eliminan también o se conservan subiendo un nivel.</p>
          </div>
        )}
        {delSheet > 0 && (
          <div className="flex gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <Sheet size={14} className="flex-shrink-0 mt-0.5" />
            <p>{delSheet} tarea{delSheet === 1 ? ' viene' : 's vienen'} del Google Sheet: si no se borra{delSheet === 1 ? '' : 'n'} o desmarca{delSheet === 1 ? '' : 'n'} allá, volverá{delSheet === 1 ? '' : 'n'} a aparecer en la próxima sincronización.</p>
          </div>
        )}

        {delCor > 0 && (
          <div className="flex gap-2 text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <p>{delCor} tarea{delCor === 1 ? ' viene' : 's vienen'} de COR: volverá{delCor === 1 ? '' : 'n'} a aparecer en la próxima sincronización. Archívala{delCor === 1 ? '' : 's'} o bórrala{delCor === 1 ? '' : 's'} en COR.</p>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1">
          {hijos.length > 0 ? (
            <>
              <button onClick={() => ejecutar(true)} disabled={borrando}
                className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
                Eliminar todo ({ids.length + hijos.length})
              </button>
              <button onClick={() => ejecutar(false)} disabled={borrando}
                className="w-full px-4 py-2.5 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 rounded-xl text-sm font-medium">
                Eliminar solo {ids.length === 1 ? 'la tarea' : 'las tareas'} y conservar subtareas
              </button>
            </>
          ) : (
            <button onClick={() => ejecutar(true)} disabled={borrando}
              className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
              Eliminar
            </button>
          )}
          <button onClick={onClose} disabled={borrando} className="w-full px-4 py-2 text-sm text-slate-500 hover:text-slate-700">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
