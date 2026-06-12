import type { Tarea, CambioPropuesto, TareaNuevaPropuesta } from '@/types'
import { tsToDate } from './utils'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL    = 'llama-3.3-70b-versatile'

export interface ResultadoGroq {
  cambios:      CambioPropuesto[]
  nuevasTareas: TareaNuevaPropuesta[]
}

function formatearFechaDDMM(ts: Tarea['fechaInicio'] | undefined): string {
  if (!ts) return ''
  const d = tsToDate(ts)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// Parse DD/MM/YYYY → ISO date string (YYYY-MM-DD)
export function parsearFechaIA(raw: string): string {
  const s = raw.trim()
  // DD/MM/YYYY or DD-MM-YYYY
  const ddmm = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (ddmm) {
    const [, d, m, y] = ddmm
    const year = y.length === 2 ? '20' + y : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // Fallback via Date constructor
  const date = new Date(s)
  if (!isNaN(date.getTime())) return date.toISOString().split('T')[0]
  return ''
}

export async function parsearEmailConGroq(
  emailText: string,
  tareas: Tarea[],
  groqApiKey: string
): Promise<ResultadoGroq> {
  const tareasSimples = tareas
    .filter(t => t.tipo !== 'grupo')
    .map(t => ({
      id:           t.id,
      titulo:       t.titulo,
      estado:       t.estado,
      progreso:     t.progreso ?? 0,
      fase:         t.fase ?? '',
      responsable:  t.asignadoA ?? '',
      fechaInicio:  formatearFechaDDMM(t.fechaInicio),
      fechaFin:     formatearFechaDDMM(t.fechaFin),
    }))

  // Extract unique fases for context when creating new tasks
  const fasesUnicas = [...new Set(tareas.map(t => t.fase).filter(Boolean))]

  const hoy = new Date()
  const hoyStr = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`

  const prompt = `Eres un asistente que extrae actualizaciones y nuevas tareas de un email de respuesta de equipo.
Hoy es ${hoyStr}.

Lista de tareas activas del proyecto (JSON):
${JSON.stringify(tareasSimples, null, 2)}

Fases/grupos existentes en el proyecto: ${fasesUnicas.join(', ') || 'ninguna definida'}

Email recibido:
---
${emailText}
---

Analiza el email y extrae:

1. CAMBIOS en tareas existentes:
   - Estado: "terminé/completé/listo/ya está" → completada | "bloqueado/esperando/no puedo avanzar" → bloqueada | "empecé/en proceso" → en_progreso
   - Progreso: porcentaje explícito ("voy al 60%", "80% listo") → número 0-100
   - Fechas: "la entrega se corre al 15/07", "necesitamos hasta julio", "fecha límite cambia a..." → fechaFin en formato DD/MM/YYYY
     También si mencionan cambio de fecha de inicio: "arrancamos el 20/07" → fechaInicio
   - Responsable: "cambiar responsable de X a Y", "pasar a manos de Z", "todas las tareas de X poner Y", "el encargado ahora es Z" → responsable con el nuevo nombre
   - Notas: comentarios/observaciones sin cambio de estado
   - Si dicen "completada" también pon progreso: 100

2. NUEVAS tareas mencionadas:
   - "hay que agregar", "necesitamos crear", "nueva tarea:", "falta incluir", "agregar actividad"
   - Si no mencionan fecha usa fechas razonables basadas en el contexto del proyecto
   - Asigna la fase más apropiada de las existentes si aplica

Usa los IDs exactos de la lista para tareas existentes. Para fechas usa formato DD/MM/YYYY.
Si alguien menciona "próxima semana", "mes que viene", etc., calcula la fecha aproximada desde hoy (${hoyStr}).

Responde ÚNICAMENTE con JSON válido (sin texto antes ni después):
{
  "cambios": [
    {"tareaId": "id_exacto", "titulo": "titulo sin comillas especiales", "campo": "estado",       "valorNuevo": "completada"},
    {"tareaId": "id_exacto", "titulo": "titulo sin comillas especiales", "campo": "progreso",     "valorNuevo": 75},
    {"tareaId": "id_exacto", "titulo": "titulo sin comillas especiales", "campo": "fechaFin",     "valorNuevo": "30/06/2026"},
    {"tareaId": "id_exacto", "titulo": "titulo sin comillas especiales", "campo": "fechaInicio",  "valorNuevo": "15/07/2026"},
    {"tareaId": "id_exacto", "titulo": "titulo sin comillas especiales", "campo": "responsable",  "valorNuevo": "Nuevo Nombre"},
    {"tareaId": "id_exacto", "titulo": "titulo sin comillas especiales", "campo": "notas",        "valorNuevo": "texto sin saltos de linea"}
  ],
  "nuevasTareas": [
    {
      "titulo": "Nombre de la nueva tarea",
      "fechaInicio": "01/07/2026",
      "fechaFin": "15/07/2026",
      "responsable": "Nombre",
      "fase": "F1 - Cimentar",
      "descripcion": "descripción si fue mencionada"
    }
  ]
}`

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0.1,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => null)
    const msg = err?.error?.message ?? `HTTP ${res.status}`
    if (res.status === 401) throw new Error('Clave de Groq inválida. Verifica en Configuración → Email semanal.')
    if (res.status === 429) throw new Error('Límite de Groq alcanzado, intenta en un momento.')
    throw new Error(`Error de Groq: ${msg}`)
  }

  const json = await res.json()
  const text: string = json.choices?.[0]?.message?.content ?? ''

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Groq no devolvió JSON válido. Intenta de nuevo.')

  let rawJson = jsonMatch[0]
  // Remove trailing commas before } or ] which LLMs sometimes generate
  rawJson = rawJson.replace(/,(\s*[}\]])/g, '$1')
  // Replace literal newlines inside string values to avoid parse errors
  rawJson = rawJson.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (m) =>
    m.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
  )

  type ParsedGroq = {
    cambios?: { tareaId: string; titulo: string; campo: string; valorNuevo: string | number }[]
    nuevasTareas?: { titulo: string; fechaInicio: string; fechaFin: string; responsable: string; fase: string; descripcion: string }[]
  }
  let parsed: ParsedGroq
  try {
    parsed = JSON.parse(rawJson) as ParsedGroq
  } catch {
    throw new Error('Groq devolvió JSON inválido. Intenta de nuevo o simplifica el texto del email.')
  }

  // Process cambios
  const cambios: CambioPropuesto[] = (parsed.cambios ?? [])
    .filter(c => tareasSimples.find(t => t.id === c.tareaId))
    .map(c => {
      const tarea = tareas.find(t => t.id === c.tareaId)!
      const valorActual: string | number =
        c.campo === 'estado'       ? tarea.estado :
        c.campo === 'progreso'     ? (tarea.progreso ?? 0) :
        c.campo === 'fechaInicio'  ? formatearFechaDDMM(tarea.fechaInicio) :
        c.campo === 'fechaFin'     ? formatearFechaDDMM(tarea.fechaFin) :
        c.campo === 'responsable'  ? (tarea.asignadoA ?? '') :
        (tarea.notas ?? '')
      return {
        tareaId:     c.tareaId,
        titulo:      c.titulo,
        campo:       c.campo as CambioPropuesto['campo'],
        valorActual,
        valorNuevo:  c.valorNuevo,
        aplicar:     true,
      }
    })

  // Process nuevasTareas
  const nuevasTareas: TareaNuevaPropuesta[] = (parsed.nuevasTareas ?? [])
    .filter(t => t.titulo?.trim())
    .map(t => ({
      titulo:      t.titulo.trim(),
      fechaInicio: t.fechaInicio ?? '',
      fechaFin:    t.fechaFin ?? '',
      responsable: t.responsable ?? '',
      fase:        t.fase ?? '',
      descripcion: t.descripcion ?? '',
      aplicar:     true,
    }))

  return { cambios, nuevasTareas }
}
