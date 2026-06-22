import { useState, useEffect } from 'react'
import { X, Save, Trash2, Plus, LayoutTemplate, Copy } from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import { guardarPlantilla, suscribirPlantillas, eliminarPlantilla, crearTarea } from '@/lib/firestore'
import { formatFecha, cn } from '@/lib/utils'
import type { Plantilla, PlantillaTarea, Tarea } from '@/types'

function tareasAPlantilla(tareas: Tarea[]): PlantillaTarea[] {
  const grupos = tareas.filter((t) => t.tipo === 'grupo')
  const nonGrupo = tareas.filter((t) => t.tipo !== 'grupo')
  const all = [...grupos, ...nonGrupo].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))

  const inicioProyecto = Math.min(...all.map((t) => t.fechaInicio?.seconds ?? 0))

  return all.map((t) => {
    const offsetDesdeInicio = Math.round(((t.fechaInicio?.seconds ?? inicioProyecto) - inicioProyecto) / 86400)
    const duracionDias = Math.max(0, Math.round(((t.fechaFin?.seconds ?? t.fechaInicio?.seconds ?? inicioProyecto) - (t.fechaInicio?.seconds ?? inicioProyecto)) / 86400))
    const parentIndex = t.parentId ? all.findIndex((p) => p.id === t.parentId) : undefined
    const depIndexes = (t.dependencias ?? []).map((depId) => all.findIndex((p) => p.id === depId)).filter((idx) => idx >= 0)

    return Object.fromEntries(Object.entries({
      titulo: t.titulo,
      descripcion: t.descripcion,
      tipo: t.tipo,
      fase: t.fase,
      parentIndex: parentIndex !== undefined && parentIndex >= 0 ? parentIndex : undefined,
      asignadosA: t.asignadosA?.length ? t.asignadosA : t.asignadoA ? [t.asignadoA] : undefined,
      prioridad: t.prioridad,
      duracionDias,
      offsetDesdeInicio,
      dependenciasIndexes: depIndexes.length > 0 ? depIndexes : undefined,
    }).filter(([, v]) => v !== undefined)) as unknown as PlantillaTarea
  })
}

async function aplicarPlantilla(
  plantilla: Plantilla,
  proyectoId: string,
  empresaId: string,
  uid: string,
  nuevaFechaInicio: Date
): Promise<void> {
  const idCreados: string[] = []

  for (const t of plantilla.tareas) {
    const inicio = new Date(nuevaFechaInicio)
    inicio.setDate(inicio.getDate() + t.offsetDesdeInicio)
    const fin = new Date(inicio)
    fin.setDate(fin.getDate() + t.duracionDias)

    const parentId = t.parentIndex !== undefined && t.parentIndex >= 0
      ? idCreados[t.parentIndex]
      : undefined

    const depIds = (t.dependenciasIndexes ?? []).map((i) => idCreados[i]).filter(Boolean)

    const id = await crearTarea({
      proyectoId,
      empresaId,
      titulo: t.titulo,
      descripcion: t.descripcion,
      tipo: t.tipo ?? 'tarea',
      fase: t.fase,
      parentId,
      asignadoA: t.asignadosA?.[0],
      asignadosA: t.asignadosA,
      prioridad: t.prioridad ?? 'media',
      estado: 'pendiente',
      progreso: 0,
      dependencias: depIds,
      fechaInicio: Timestamp.fromDate(inicio),
      fechaFin: Timestamp.fromDate(fin),
      orden: idCreados.length * 1000,
      creadoPor: uid,
    })
    idCreados.push(id)
  }
}

export function PlantillasModal({
  empresaId,
  proyectoId,
  uid,
  tareas,
  onClose,
  onAplicada,
}: {
  empresaId: string
  proyectoId: string
  uid: string
  tareas: Tarea[]
  onClose: () => void
  onAplicada: (count: number) => void
}) {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [selected, setSelected] = useState<Plantilla | null>(null)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [showApplyForm, setShowApplyForm] = useState(false)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [nuevaFecha, setNuevaFecha] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    return suscribirPlantillas(empresaId, (list) => {
      setPlantillas(list)
      if (list.length === 0) setShowSaveForm(true)
    })
  }, [empresaId])

  const handleGuardar = async () => {
    if (!nombre.trim() || tareas.length === 0) return
    setSaving(true)
    try {
      const plantillaTareas = tareasAPlantilla(tareas)
      const inicioProyecto = Math.min(...tareas.map((t) => t.fechaInicio?.seconds ?? 0))
      const finProyecto = Math.max(...tareas.map((t) => t.fechaFin?.seconds ?? 0))
      const duracionTotalDias = Math.round((finProyecto - inicioProyecto) / 86400)
      await guardarPlantilla({
        empresaId,
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        creadoPor: uid,
        tareas: plantillaTareas,
        duracionTotalDias,
      } as Omit<Plantilla, 'id' | 'creadoEn'>)
      setNombre('')
      setDescripcion('')
      setShowSaveForm(false)
    } finally {
      setSaving(false)
    }
  }

  const handleAplicar = async () => {
    if (!selected || !nuevaFecha) return
    setApplying(true)
    try {
      await aplicarPlantilla(selected, proyectoId, empresaId, uid, new Date(nuevaFecha + 'T00:00:00'))
      onAplicada(selected.tareas.length)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <LayoutTemplate size={20} className="text-indigo-500" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Plantillas de proyecto</h2>
              <p className="text-xs text-slate-500">Guarda estructuras reutilizables o aplica una existente</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar */}
          <div className="w-60 border-r border-slate-200 flex flex-col flex-shrink-0">
            <div className="p-3 space-y-1.5 border-b border-slate-100">
              <button
                onClick={() => { setShowSaveForm(true); setShowApplyForm(false); setSelected(null) }}
                className="w-full flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-xl transition-colors"
              >
                <Save size={13} /> Guardar actual como plantilla
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {plantillas.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">Sin plantillas guardadas</p>
              )}
              {plantillas.map((p) => (
                <button key={p.id}
                  onClick={() => { setSelected(p); setShowSaveForm(false); setShowApplyForm(false) }}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors border',
                    selected?.id === p.id ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'hover:bg-slate-50 text-slate-700 border-transparent'
                  )}>
                  <p className="font-medium truncate">{p.nombre}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{p.tareas.length} tareas · {p.duracionTotalDias}d</p>
                </button>
              ))}
            </div>
          </div>

          {/* Main */}
          <div className="flex-1 min-w-0 overflow-y-auto p-6">
            {showSaveForm ? (
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-900">Guardar plantilla</h3>
                <p className="text-sm text-slate-500">
                  Se guardará la estructura de <strong>{tareas.length} tareas</strong> del cronograma actual.
                  Las fechas se convierten en duraciones relativas.
                </p>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Nombre de la plantilla</label>
                  <input className="input-base w-full" value={nombre} onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej: Proyecto de construcción estándar" autoFocus />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Descripción (opcional)</label>
                  <textarea className="input-base w-full resize-none" rows={2} value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)} placeholder="Cuándo usar esta plantilla..." />
                </div>
                <button onClick={handleGuardar} disabled={!nombre.trim() || saving}
                  className="btn-primary flex items-center gap-2">
                  <Save size={14} /> {saving ? 'Guardando...' : 'Guardar plantilla'}
                </button>
              </div>
            ) : selected ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">{selected.nombre}</h3>
                    {selected.descripcion && <p className="text-sm text-slate-500 mt-0.5 italic">"{selected.descripcion}"</p>}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                      <span>{selected.tareas.length} tareas</span>
                      <span>·</span>
                      <span>Duración aprox. {selected.duracionTotalDias} días</span>
                      {selected.creadoEn && <span>· Creada {formatFecha(selected.creadoEn)}</span>}
                    </div>
                  </div>
                  <button onClick={async () => {
                    if (confirm(`¿Eliminar la plantilla "${selected.nombre}"?`)) {
                      await eliminarPlantilla(selected.id); setSelected(null)
                    }
                  }} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* Preview tareas */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Estructura de tareas
                  </div>
                  <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {selected.tareas.map((t, i) => (
                      <div key={i} className="px-4 py-2 flex items-center gap-3"
                        style={{ paddingLeft: t.parentIndex !== undefined ? 32 : 16 }}>
                        <span className="text-xs text-slate-400">{t.tipo === 'grupo' ? '▶' : t.tipo === 'hito' ? '◆' : '—'}</span>
                        <span className="text-sm text-slate-700 flex-1 truncate">{t.titulo}</span>
                        <span className="text-xs text-slate-400 flex-shrink-0">{t.duracionDias}d</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Apply section */}
                {!showApplyForm ? (
                  <button onClick={() => setShowApplyForm(true)}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
                    <Copy size={14} /> Aplicar al proyecto actual
                  </button>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-medium text-amber-800">
                      Esto agregará {selected.tareas.length} tareas al proyecto actual.
                    </p>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Fecha de inicio del cronograma</label>
                      <input type="date" className="input-base w-full" value={nuevaFecha}
                        onChange={(e) => setNuevaFecha(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={handleAplicar} disabled={applying}
                        className="btn-primary flex items-center gap-2">
                        <Plus size={14} /> {applying ? 'Aplicando...' : 'Confirmar y crear tareas'}
                      </button>
                      <button onClick={() => setShowApplyForm(false)} className="btn-secondary">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-10">
                <LayoutTemplate size={32} className="text-slate-200 mb-3" />
                <p className="text-sm font-medium text-slate-500">Selecciona una plantilla</p>
                <p className="text-xs text-slate-400 mt-1">O guarda el cronograma actual como plantilla</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
