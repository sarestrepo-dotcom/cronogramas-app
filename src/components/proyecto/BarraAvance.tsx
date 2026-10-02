import type { SaludProyecto } from '@/lib/saludUtils'

// Barra de avance real con una marca en el avance esperado según el cronograma
export function BarraAvance({ salud }: { salud: SaludProyecto }) {
  return (
    <div>
      <div className="relative h-2 bg-slate-100 rounded-full overflow-visible">
        <div className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full" style={{ width: `${salud.avanceReal}%` }} />
        <div className="absolute -top-1 -bottom-1 w-0.5 bg-slate-800" style={{ left: `${salud.avanceEsperado}%` }} title={`Esperado: ${salud.avanceEsperado}%`} />
      </div>
      <p className="text-[11px] text-slate-500 mt-1">{salud.avanceReal}% real · {salud.avanceEsperado}% esperado</p>
    </div>
  )
}
