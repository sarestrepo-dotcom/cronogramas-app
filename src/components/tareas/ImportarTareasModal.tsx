import { useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import {
  ClipboardPaste, Download, AlertCircle, CheckCircle2, X,
  Link, Loader2, Sheet, Sparkles, ChevronRight,
} from 'lucide-react'
import { crearTarea } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import type { Tarea, TipoTarea, EstadoTarea } from '@/types'

// ─── Campo types ──────────────────────────────────────────────────────────────
type CampoImport =
  | 'titulo' | 'fechaInicio' | 'fechaFin' | 'prioridad'
  | 'tipo' | 'responsable' | 'descripcion' | 'progreso'
  | 'fase' | 'notas' | 'estado' | 'ignorar'

const CAMPO_LABELS: Record<CampoImport, string> = {
  titulo:      'Título',
  fase:        'Fase',
  fechaInicio: 'Fecha inicio',
  fechaFin:    'Fecha fin',
  responsable: 'Responsable',
  estado:      'Estado',
  prioridad:   'Prioridad',
  tipo:        'Tipo (T/S)',
  progreso:    'Progreso %',
  notas:       'Notas / IA',
  descripcion: 'Descripción',
  ignorar:     '— Ignorar',
}

const CAMPOS_ORDEN: CampoImport[] = [
  'titulo', 'fase', 'fechaInicio', 'fechaFin', 'responsable',
  'estado', 'prioridad', 'tipo', 'progreso', 'notas', 'descripcion', 'ignorar',
]

// ─── FilaTarea ────────────────────────────────────────────────────────────────
interface FilaTarea {
  titulo: string
  fase: string
  fechaInicio: string
  fechaFin: string
  prioridad: Tarea['prioridad']
  tipo: TipoTarea
  estado: EstadoTarea
  responsable: string
  descripcion: string
  notas: string
  progreso: number
  valida: boolean
  error?: string
}

// ─── Parsers ──────────────────────────────────────────────────────────────────
const PRIORIDADES_MAP: Record<string, Tarea['prioridad']> = {
  baja: 'baja', low: 'baja',
  media: 'media', medium: 'media', normal: 'media',
  alta: 'alta', high: 'alta',
  critica: 'critica', crítica: 'critica', critical: 'critica', urgente: 'critica',
}

const ESTADOS_MAP: Record<string, EstadoTarea> = {
  pendiente: 'pendiente', pending: 'pendiente', 'por hacer': 'pendiente', 'no iniciado': 'pendiente',
  'en_progreso': 'en_progreso', 'en progreso': 'en_progreso', 'in progress': 'en_progreso',
  'en proceso': 'en_progreso', iniciado: 'en_progreso', activo: 'en_progreso',
  completada: 'completada', completado: 'completada', done: 'completada', finalizado: 'completada',
  terminado: 'completada', listo: 'completada', cerrado: 'completada', closed: 'completada',
  bloqueada: 'bloqueada', bloqueado: 'bloqueada', blocked: 'bloqueada', detenido: 'bloqueada',
}

const TIPOS_MAP: Record<string, TipoTarea> = {
  tarea: 'tarea', task: 'tarea', s: 'tarea',           // S = subtarea
  hito: 'hito', milestone: 'hito', h: 'hito',
  grupo: 'grupo', group: 'grupo', padre: 'grupo',
  t: 'grupo', g: 'grupo',                               // T = tarea padre (grupo)
}

function parsearFecha(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  const ddmm = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (ddmm) {
    const [, d, m, y] = ddmm
    return `${y.length === 2 ? '20' + y : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const yyyymm = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (yyyymm) {
    const [, y, m, d] = yyyymm
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  return ''
}

function validarFecha(s: string): boolean {
  return !!s && !isNaN(new Date(s).getTime())
}

// ─── Column detection heuristics ─────────────────────────────────────────────
const CAMPO_KEYWORDS: Record<Exclude<CampoImport, 'ignorar'>, string[]> = {
  titulo:      ['titulo', 'tarea', 'subtarea', 'task', 'nombre', 'name', 'actividad', 'activity', 'item', 'concepto'],
  fase:        ['fase', 'phase', 'frente', 'etapa', 'sprint', 'modulo', 'categoria'],
  fechaInicio: ['inicio', 'start', 'begin', 'comienzo', 'arranque', 'desde', 'from', 'fecha inicio', 'fecha de inicio'],
  fechaFin:    ['fin', 'end', 'termino', 'deadline', 'vencimiento', 'hasta', 'cierre', 'entrega', 'due', 'fecha fin', 'fecha de fin'],
  responsable: ['responsable', 'assigned', 'owner', 'assignee', 'persona', 'ejecutor', 'encargado', 'quien', 'asignado'],
  estado:      ['estado', 'status', 'estatus', 'situacion', 'estado actual'],
  prioridad:   ['prioridad', 'priority', 'urgencia', 'importancia'],
  tipo:        ['tipo', 'type', 'clase'],
  descripcion: ['descripcion', 'description', 'detalle', 'detail'],
  progreso:    ['progreso', 'progress', 'avance', 'porcentaje', 'percent'],
  notas:       ['notas', 'notes', 'ia', 'observaciones', 'comentarios', 'contexto', 'nota'],
}

function normalizar(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s%]/g, '').trim()
}

function detectarCampo(header: string): CampoImport {
  const norm = normalizar(header)
  if (!norm) return 'ignorar'
  let bestField: CampoImport = 'ignorar'
  let bestScore = 0
  for (const [campo, keywords] of Object.entries(CAMPO_KEYWORDS) as [Exclude<CampoImport, 'ignorar'>, string[]][]) {
    for (const kw of keywords) {
      if (norm === kw)           { bestField = campo; return campo }  // exact match wins
      if (norm.startsWith(kw) || kw.startsWith(norm) || norm.includes(kw)) {
        const score = kw.length
        if (score > bestScore) { bestScore = score; bestField = campo }
      }
    }
  }
  return bestField
}

function detectarSep(line: string): string {
  return (line.match(/\t/g)?.length ?? 0) >= (line.match(/,/g)?.length ?? 0) ? '\t' : ','
}

function esHeaderRow(line: string, sep: string): boolean {
  const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''))
  const textuales = cols.filter(c =>
    isNaN(Number(c)) &&
    !c.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/) &&
    !c.match(/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/)
  )
  return textuales.length >= Math.ceil(cols.length * 0.5)
}

function detectarMapping(headers: string[], sep: string): Record<number, CampoImport> {
  const cols = headers[0].split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''))
  const mapping: Record<number, CampoImport> = {}
  const usados = new Set<CampoImport>()
  cols.forEach((h, i) => {
    const campo = detectarCampo(h)
    if (campo !== 'ignorar' && usados.has(campo)) {
      mapping[i] = 'ignorar'
    } else {
      mapping[i] = campo
      if (campo !== 'ignorar') usados.add(campo)
    }
  })
  return mapping
}

function parsearConMapeo(line: string, sep: string, mapping: Record<number, CampoImport>): FilaTarea {
  const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''))
  let titulo = '', fase = '', fechaInicio = '', fechaFin = '', responsable = '', descripcion = '', notas = ''
  let prioridadRaw = '', tipoRaw = '', progresoRaw = '', estadoRaw = ''
  let hayFechaInicio = false, hayFechaFin = false

  for (const [idxStr, campo] of Object.entries(mapping)) {
    const val = cols[Number(idxStr)] ?? ''
    switch (campo) {
      case 'titulo':      titulo = val; break
      case 'fase':        fase = val; break
      case 'fechaInicio': fechaInicio = parsearFecha(val); if (val.trim()) hayFechaInicio = true; break
      case 'fechaFin':    fechaFin    = parsearFecha(val); if (val.trim()) hayFechaFin    = true; break
      case 'responsable': responsable = val; break
      case 'descripcion': descripcion = val; break
      case 'notas':       notas = val; break
      case 'prioridad':   prioridadRaw = val; break
      case 'tipo':        tipoRaw = val; break
      case 'progreso':    progresoRaw = val.replace('%', ''); break
      case 'estado':      estadoRaw = val; break
    }
  }

  const prioridad = PRIORIDADES_MAP[prioridadRaw.toLowerCase()] ?? 'media'
  const estado: EstadoTarea = ESTADOS_MAP[estadoRaw.toLowerCase().trim()] ?? 'pendiente'
  const tipoExplicito = TIPOS_MAP[tipoRaw.toLowerCase().trim()]
  const sinFechas = !hayFechaInicio && !hayFechaFin
  const tipo: TipoTarea = tipoExplicito ?? (sinFechas ? 'grupo' : 'tarea')
  const progreso = Math.min(100, Math.max(0, parseInt(progresoRaw) || 0))

  let error: string | undefined
  if (!titulo.trim()) error = 'Título requerido'
  else if (tipo !== 'grupo' && !validarFecha(fechaInicio)) error = 'Fecha inicio inválida'
  else if (tipo !== 'grupo' && !validarFecha(fechaFin))    error = 'Fecha fin inválida'

  return { titulo, fase, fechaInicio, fechaFin, prioridad, tipo, estado, responsable, descripcion, notas, progreso, valida: !error, error }
}

// ─── Google Sheets fetcher ────────────────────────────────────────────────────
function extractSheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return m ? m[1] : null
}
function extractGid(url: string): string | undefined {
  const m = url.match(/[#&?]gid=(\d+)/)
  return m ? m[1] : undefined
}
async function fetchSheetCsv(sheetId: string, gid?: string): Promise<string> {
  let url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`
  if (gid) url += `&gid=${gid}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Error ${res.status}: La hoja no es accesible. Asegúrate de compartirla como "Cualquier persona con el enlace".`)
  return res.text()
}

function descargarPlantilla() {
  const contenido = [
    'Título\tFase\tFecha inicio\tFecha fin\tEstado\tPrioridad\tTipo\tResponsable\tDescripción\tProgreso',
    // F1 – Descubrimiento y estrategia
    'F1 - Descubrimiento y Estrategia\tF1 - Descubrimiento y Estrategia\t02/06/2026\t20/06/2026\tcompletada\talta\tgrupo\t\t\t100',
    'Kickoff y alineación con el cliente\tF1 - Descubrimiento y Estrategia\t02/06/2026\t03/06/2026\tcompletada\talta\thito\tSergei Restrepo\tReunión de arranque del proyecto\t100',
    'Levantamiento de requerimientos\tF1 - Descubrimiento y Estrategia\t03/06/2026\t07/06/2026\tcompletada\talta\ttarea\tSergei Restrepo\tEntrevistas con stakeholders y documentación\t100',
    'Definición de arquitectura de información\tF1 - Descubrimiento y Estrategia\t08/06/2026\t12/06/2026\tcompletada\talta\ttarea\tMarín\tSitemap y flujos de navegación\t100',
    'Revisión y aprobación de requerimientos\tF1 - Descubrimiento y Estrategia\t13/06/2026\t20/06/2026\tcompletada\tmedia\thito\tSergei Restrepo\tAprobación formal del cliente\t100',
    // F2 – Diseño UX/UI
    'F2 - Diseño UX/UI\tF2 - Diseño UX/UI\t15/06/2026\t10/07/2026\ten progreso\talta\tgrupo\t\t\t45',
    'Wireframes de páginas principales\tF2 - Diseño UX/UI\t15/06/2026\t22/06/2026\tcompletada\talta\ttarea\tMarín\tWireframes en Figma — Home, Servicios, Contacto\t100',
    'Diseño visual (brandbook aplicado)\tF2 - Diseño UX/UI\t23/06/2026\t04/07/2026\ten progreso\talta\ttarea\tMarín\tAplicar identidad visual al diseño UI\t60',
    'Diseño responsive (mobile-first)\tF2 - Diseño UX/UI\t25/06/2026\t06/07/2026\ten progreso\tmedia\ttarea\tMarín\tAdaptaciones para móvil y tablet\t30',
    'Revisión de diseño con cliente\tF2 - Diseño UX/UI\t07/07/2026\t10/07/2026\tpendiente\talta\thito\tSergei Restrepo\tPresentación y ajustes finales de diseño\t0',
    // F3 – Desarrollo
    'F3 - Desarrollo\tF3 - Desarrollo\t07/07/2026\t08/08/2026\tpendiente\tcritica\tgrupo\t\t\t0',
    'Setup entorno y repositorio\tF3 - Desarrollo\t07/07/2026\t08/07/2026\tpendiente\talta\ttarea\tEquipo Web\tConfiguración inicial del proyecto\t0',
    'Desarrollo frontend — páginas estáticas\tF3 - Desarrollo\t09/07/2026\t22/07/2026\tpendiente\talta\ttarea\tEquipo Web\tHTML/CSS/JS según diseño aprobado\t0',
    'Integración CMS\tF3 - Desarrollo\t14/07/2026\t25/07/2026\tpendiente\talta\ttarea\tEquipo Web\tConfiguración de gestor de contenidos\t0',
    'Formularios y funcionalidades\tF3 - Desarrollo\t21/07/2026\t01/08/2026\tpendiente\tmedia\ttarea\tEquipo Web\tContacto, cotizador, newsletter\t0',
    'Integración Analytics y SEO técnico\tF3 - Desarrollo\t28/07/2026\t05/08/2026\tpendiente\tmedia\ttarea\tEquipo Web\tGA4, Search Console, metadatos\t0',
    // F4 – QA y lanzamiento
    'F4 - QA y Lanzamiento\tF4 - QA y Lanzamiento\t04/08/2026\t22/08/2026\tpendiente\tcritica\tgrupo\t\t\t0',
    'Pruebas funcionales y de compatibilidad\tF4 - QA y Lanzamiento\t04/08/2026\t11/08/2026\tpendiente\talta\ttarea\tSergei Restrepo\tCross-browser, dispositivos, formularios\t0',
    'Corrección de bugs\tF4 - QA y Lanzamiento\t11/08/2026\t15/08/2026\tpendiente\talta\ttarea\tEquipo Web\tResolución de observaciones del QA\t0',
    'Capacitación en CMS al cliente\tF4 - QA y Lanzamiento\t14/08/2026\t15/08/2026\tpendiente\tmedia\ttarea\tSergei Restrepo\tSesión de entrenamiento para administrar contenidos\t0',
    'Deploy a producción\tF4 - QA y Lanzamiento\t18/08/2026\t18/08/2026\tpendiente\tcritica\thito\tEquipo Web\tPublicación en servidor de producción\t0',
    'Entrega formal al cliente\tF4 - QA y Lanzamiento\t22/08/2026\t22/08/2026\tpendiente\tcritica\thito\tSergei Restrepo\tCierre de proyecto y acta de entrega\t0',
  ].join('\n')
  const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'plantilla_proyecto_web.txt'
  a.click()
}

// ─── Component ────────────────────────────────────────────────────────────────
type Modo = 'pegar' | 'sheets'
type Paso = 'entrada' | 'mapeo' | 'preview'

interface ImportarTareasModalProps {
  proyectoId: string
  empresaId: string
  uid: string
  onClose: () => void
  onImportado: (count: number) => void
}

export function ImportarTareasModal({ proyectoId, empresaId, uid, onClose, onImportado }: ImportarTareasModalProps) {
  const [modo, setModo]           = useState<Modo>('pegar')
  const [paso, setPaso]           = useState<Paso>('entrada')
  const [texto, setTexto]         = useState('')
  const [sheetUrl, setSheetUrl]   = useState('')
  const [cargando, setCargando]   = useState(false)
  const [errorSheet, setErrorSheet] = useState('')
  const [importando, setImportando] = useState(false)

  // Raw lines after loading (excluding header if present)
  const [dataLines, setDataLines]   = useState<string[]>([])
  const [sep, setSep]               = useState('\t')
  const [headers, setHeaders]       = useState<string[]>([])
  const [mapping, setMapping]       = useState<Record<number, CampoImport>>({})
  const [filas, setFilas]           = useState<FilaTarea[]>([])

  const filaValidas = filas.filter(f => f.valida)

  // ── Step 1→2: Analyse raw text ──────────────────────────────────────────────
  const analizarTexto = (raw: string) => {
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    if (lines.length === 0) return

    const detSep = detectarSep(lines[0])
    setSep(detSep)

    let headerRow: string | null = null
    let dataStart = 0

    if (esHeaderRow(lines[0], detSep)) {
      headerRow = lines[0]
      dataStart = 1
    }

    const dLines = lines.slice(dataStart)
    setDataLines(dLines)

    if (headerRow) {
      const cols = headerRow.split(detSep).map(c => c.trim().replace(/^["']|["']$/g, ''))
      setHeaders(cols)
      setMapping(detectarMapping([headerRow], detSep))
    } else {
      // No header row → use positional defaults
      const ncols = Math.max(...dLines.map(l => l.split(detSep).length))
      const defaultMapping: Record<number, CampoImport> = {}
      const defaults: CampoImport[] = ['titulo', 'fechaInicio', 'fechaFin', 'prioridad', 'tipo', 'responsable', 'descripcion', 'progreso']
      for (let i = 0; i < ncols; i++) defaultMapping[i] = defaults[i] ?? 'ignorar'
      setMapping(defaultMapping)
      setHeaders(Array.from({ length: ncols }, (_, i) => `Columna ${i + 1}`))
    }

    setPaso('mapeo')
  }

  const handlePegar = () => analizarTexto(texto)

  const handleCargarSheet = async () => {
    setErrorSheet('')
    const sheetId = extractSheetId(sheetUrl)
    if (!sheetId) { setErrorSheet('URL no válida. Copia la URL completa de Google Sheets.'); return }
    setCargando(true)
    try {
      const csv = await fetchSheetCsv(sheetId, extractGid(sheetUrl))
      analizarTexto(csv)
    } catch (e: unknown) {
      setErrorSheet(e instanceof Error ? e.message : 'Error al cargar la hoja.')
    } finally {
      setCargando(false)
    }
  }

  // ── Step 2→3: Parse with confirmed mapping ──────────────────────────────────
  const previsualizar = () => {
    const parsed = dataLines.map(l => parsearConMapeo(l, sep, mapping))
    setFilas(parsed)
    setPaso('preview')
  }

  const setColMapping = (colIdx: number, campo: CampoImport) => {
    setMapping(prev => {
      const next = { ...prev }
      // Un-assign the previous owner of this campo (unless it's 'ignorar')
      if (campo !== 'ignorar') {
        for (const k of Object.keys(next)) {
          if (next[Number(k)] === campo && Number(k) !== colIdx) next[Number(k)] = 'ignorar'
        }
      }
      next[colIdx] = campo
      return next
    })
  }

  // ── Import ───────────────────────────────────────────────────────────────────
  const toTS = (dateStr: string, end: boolean) => {
    const d = new Date(dateStr + (end ? 'T23:59:59' : 'T00:00:00'))
    if (isNaN(d.getTime())) throw new Error(`Fecha inválida: "${dateStr}"`)
    return Timestamp.fromDate(d)
  }

  const handleImportar = async () => {
    setImportando(true)
    try {
      const hoy = new Date().toISOString().split('T')[0]
      const grupoIdByIndex = new Map<number, string>()

      // First pass: create grupos and record their Firestore IDs
      for (let i = 0; i < filaValidas.length; i++) {
        const f = filaValidas[i]
        if (f.tipo !== 'grupo') continue
        const id = await crearTarea({
          titulo: f.titulo, descripcion: f.descripcion,
          fechaInicio: toTS(f.fechaInicio || hoy, false),
          fechaFin: toTS(f.fechaFin || f.fechaInicio || hoy, true),
          estado: f.estado, prioridad: f.prioridad, tipo: 'grupo',
          asignadoA: f.responsable.trim() || undefined, progreso: f.progreso,
          fase: f.fase.trim() || undefined,
          notas: f.notas.trim() || undefined,
          orden: i,
          proyectoId, empresaId, dependencias: [], creadoPor: uid,
        } as Omit<Tarea, 'id' | 'creadoEn' | 'actualizadoEn'>)
        grupoIdByIndex.set(i, id)
      }

      // Second pass: create non-grupo tasks preserving sheet order via `orden`
      for (let i = 0; i < filaValidas.length; i++) {
        const f = filaValidas[i]
        if (f.tipo === 'grupo') continue
        let parentId: string | undefined
        for (let j = i - 1; j >= 0; j--) {
          if (filaValidas[j].tipo === 'grupo') { parentId = grupoIdByIndex.get(j); break }
        }
        const fin = f.tipo === 'hito' ? f.fechaInicio : (f.fechaFin || f.fechaInicio)
        await crearTarea({
          titulo: f.titulo, descripcion: f.descripcion,
          fechaInicio: toTS(f.fechaInicio, false), fechaFin: toTS(fin, true),
          estado: f.estado, prioridad: f.prioridad, tipo: f.tipo, parentId,
          asignadoA: f.responsable.trim() || undefined, progreso: f.progreso,
          orden: i,
          fase: f.fase.trim() || undefined,
          notas: f.notas.trim() || undefined,
          proyectoId, empresaId, dependencias: [], creadoPor: uid,
        } as Omit<Tarea, 'id' | 'creadoEn' | 'actualizadoEn'>)
      }

      onImportado(filaValidas.length)
      onClose()
    } finally {
      setImportando(false)
    }
  }

  // ── UI ───────────────────────────────────────────────────────────────────────
  const titulosMapped = Object.values(mapping).filter(c => c !== 'ignorar').length
  const tieneTitulo   = Object.values(mapping).includes('titulo')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Importar tareas</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {paso === 'entrada' ? 'Elige cómo quieres importar' :
               paso === 'mapeo'   ? 'Confirma el mapeo de columnas' :
               `${filas.length} filas · ${filaValidas.length} válidas`}
            </p>
          </div>
          {/* Steps indicator */}
          <div className="hidden sm:flex items-center gap-1 text-xs text-slate-400 mr-4">
            {(['entrada', 'mapeo', 'preview'] as Paso[]).map((p, i) => (
              <>
                <span key={p} className={cn('font-medium', paso === p ? 'text-indigo-600' : paso > p ? 'text-emerald-500' : '')}>
                  {i + 1}. {p === 'entrada' ? 'Datos' : p === 'mapeo' ? 'Columnas' : 'Preview'}
                </span>
                {i < 2 && <ChevronRight size={12} key={`arr-${i}`} />}
              </>
            ))}
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── PASO 1: Entrada ── */}
          {paso === 'entrada' && (
            <div className="space-y-5">
              <div className="flex items-center bg-slate-100 rounded-xl p-1 w-fit">
                <button onClick={() => setModo('pegar')}
                  className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    modo === 'pegar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                  <ClipboardPaste size={15} /> Pegar desde Excel/Sheets
                </button>
                <button onClick={() => setModo('sheets')}
                  className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    modo === 'sheets' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                  <Link size={15} /> Link de Google Sheets
                </button>
              </div>

              {/* Smart detection banner */}
              <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                <Sparkles size={16} className="text-indigo-500 flex-shrink-0" />
                <p className="text-sm text-indigo-700">
                  <strong>Detección automática de columnas</strong> — no importa el orden. Si tu hoja tiene encabezados, el sistema los detecta y los asigna al campo correcto. Podrás ajustar el mapeo antes de importar.
                </p>
              </div>

              <button onClick={descargarPlantilla}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 px-3 py-2 rounded-xl transition-colors">
                <Download size={15} /> Descargar plantilla de referencia
              </button>

              {modo === 'pegar' ? (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Pega el contenido aquí</label>
                  <textarea
                    className="w-full h-48 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-mono text-slate-700 focus:outline-none focus:border-indigo-400 resize-none placeholder:text-slate-400"
                    placeholder={'Copia las celdas en Sheets/Excel (Ctrl+C) y pega aquí (Ctrl+V)\n\nPuede tener encabezados o no. El orden de columnas no importa.'}
                    value={texto}
                    onChange={e => setTexto(e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">URL de Google Sheets</label>
                    <div className="flex gap-2">
                      <input className="input-base flex-1" placeholder="https://docs.google.com/spreadsheets/d/..."
                        value={sheetUrl} onChange={e => { setSheetUrl(e.target.value); setErrorSheet('') }} />
                      <button onClick={handleCargarSheet} disabled={!sheetUrl.trim() || cargando}
                        className="btn-primary flex items-center gap-2 flex-shrink-0">
                        {cargando ? <Loader2 size={15} className="animate-spin" /> : <Sheet size={15} />}
                        {cargando ? 'Cargando...' : 'Cargar'}
                      </button>
                    </div>
                    {errorSheet && <p className="text-xs text-red-600 flex items-center gap-1.5 mt-1"><AlertCircle size={13} />{errorSheet}</p>}
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
                    <p className="font-semibold">Requisito:</p>
                    <p>La hoja debe estar compartida como <strong>"Cualquier persona con el enlace puede ver"</strong>.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PASO 2: Mapeo de columnas ── */}
          {paso === 'mapeo' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <Sparkles size={14} className="text-indigo-500 flex-shrink-0" />
                Asigna cada columna al campo correspondiente. El sistema pre-detectó lo que pudo — ajusta donde sea necesario.
              </div>

              <div className="space-y-2">
                {headers.map((header, colIdx) => {
                  const campo = mapping[colIdx] ?? 'ignorar'
                  // Sample values from first 2 data rows
                  const samples = dataLines.slice(0, 2)
                    .map(l => l.split(sep)[colIdx]?.trim().replace(/^["']|["']$/g, '') ?? '')
                    .filter(Boolean)

                  return (
                    <div key={colIdx} className={cn(
                      'grid grid-cols-[1fr_auto_1fr] items-center gap-3 p-3 rounded-xl border transition-colors',
                      campo === 'ignorar' ? 'border-slate-100 bg-slate-50 opacity-60' : 'border-indigo-100 bg-indigo-50/40'
                    )}>
                      {/* Column info */}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                          Col. {colIdx + 1}
                        </p>
                        <p className="text-sm font-medium text-slate-800 truncate">{header || `(vacío)`}</p>
                        {samples.length > 0 && (
                          <p className="text-xs text-slate-400 truncate mt-0.5">
                            Ej: {samples.join(' · ')}
                          </p>
                        )}
                      </div>

                      <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />

                      {/* Field selector */}
                      <select
                        value={campo}
                        onChange={e => setColMapping(colIdx, e.target.value as CampoImport)}
                        className={cn(
                          'text-sm border rounded-xl px-3 py-2 font-medium transition-colors w-full',
                          campo === 'ignorar'
                            ? 'border-slate-200 text-slate-400 bg-white'
                            : 'border-indigo-300 text-indigo-700 bg-white'
                        )}
                      >
                        {CAMPOS_ORDEN.map(c => (
                          <option key={c} value={c}>{CAMPO_LABELS[c]}</option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>

              {!tieneTitulo && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                  <AlertCircle size={14} />
                  Asigna al menos una columna como <strong>Título</strong> para continuar.
                </div>
              )}

              <p className="text-xs text-slate-400">
                {titulosMapped} campo{titulosMapped !== 1 ? 's' : ''} mapeado{titulosMapped !== 1 ? 's' : ''} · {dataLines.length} fila{dataLines.length !== 1 ? 's' : ''} de datos
              </p>
            </div>
          )}

          {/* ── PASO 3: Preview ── */}
          {paso === 'preview' && (
            <div className="space-y-1">
              {(() => {
                let lastGrupoIdx = -1
                return filas.map((fila, i) => {
                  if (fila.tipo === 'grupo' && fila.valida) lastGrupoIdx = i
                  const parentGrupo = (fila.tipo !== 'grupo' && lastGrupoIdx >= 0) ? filas[lastGrupoIdx] : null
                  return (
                    <div key={i} className={cn('flex items-start gap-3 p-3 rounded-xl border text-sm',
                      parentGrupo ? 'ml-6' : '',
                      fila.valida ? 'bg-white border-slate-200' : 'bg-red-50 border-red-200')}>
                      <div className="flex-shrink-0 mt-0.5">
                        {fila.valida
                          ? <CheckCircle2 size={16} className="text-emerald-500" />
                          : <AlertCircle  size={16} className="text-red-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={cn('font-medium truncate', fila.valida ? 'text-slate-900' : 'text-red-700')}>
                            {fila.titulo || '(sin título)'}
                          </p>
                          <span className={cn('text-xs px-1.5 py-0.5 rounded-full capitalize font-medium',
                            fila.tipo === 'grupo' ? 'bg-indigo-100 text-indigo-700' :
                            fila.tipo === 'hito'  ? 'bg-rose-100 text-rose-700' :
                            'bg-slate-100 text-slate-600')}>
                            {fila.tipo === 'grupo' ? '▶ grupo' : fila.tipo === 'hito' ? '◆ hito' : '— tarea'}
                          </span>
                          {parentGrupo && (
                            <span className="text-xs text-indigo-500">↳ {parentGrupo.titulo}</span>
                          )}
                        </div>
                        {fila.valida ? (
                          <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
                            {fila.fase && <span className="text-indigo-600 font-medium">{fila.fase}</span>}
                            {fila.fechaInicio && <span>{fila.fechaInicio} → {fila.fechaFin}</span>}
                            <span className={cn('px-1.5 py-0.5 rounded-full font-medium',
                              fila.estado === 'completada'  ? 'bg-emerald-100 text-emerald-700' :
                              fila.estado === 'en_progreso' ? 'bg-blue-100 text-blue-700' :
                              fila.estado === 'bloqueada'   ? 'bg-red-100 text-red-700' :
                              'bg-slate-100 text-slate-600')}>
                              {fila.estado === 'en_progreso' ? 'En progreso' :
                               fila.estado === 'completada'  ? 'Completada' :
                               fila.estado === 'bloqueada'   ? 'Bloqueada' : 'Pendiente'}
                            </span>
                            <span>· {fila.prioridad}</span>
                            {fila.responsable && <span>· 👤 {fila.responsable}</span>}
                            {fila.progreso > 0 && <span>· {fila.progreso}%</span>}
                            {fila.notas && <span>· 📝 {fila.notas.slice(0, 40)}{fila.notas.length > 40 ? '…' : ''}</span>}
                          </p>
                        ) : (
                          <p className="text-xs text-red-600 mt-0.5">{fila.error}</p>
                        )}
                      </div>
                    </div>
                  )
                })
              })()}
              {filas.length === 0 && (
                <div className="text-center py-8 text-slate-500 text-sm">No se detectaron filas.</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex-shrink-0">
          <div>
            {paso !== 'entrada' && (
              <button onClick={() => setPaso(paso === 'preview' ? 'mapeo' : 'entrada')}
                className="text-sm text-slate-600 hover:text-slate-900">← Volver</button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="btn-secondary">Cancelar</button>

            {paso === 'entrada' && modo === 'pegar' && (
              <button onClick={handlePegar} disabled={!texto.trim()}
                className="btn-primary flex items-center gap-2 disabled:opacity-50">
                <Sparkles size={15} /> Analizar columnas
              </button>
            )}

            {paso === 'mapeo' && (
              <button onClick={previsualizar} disabled={!tieneTitulo}
                className="btn-primary flex items-center gap-2 disabled:opacity-50">
                <CheckCircle2 size={15} /> Previsualizar
              </button>
            )}

            {paso === 'preview' && (
              <button onClick={handleImportar} disabled={filaValidas.length === 0 || importando}
                className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {importando ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {importando ? 'Importando...' : `Importar ${filaValidas.length} tarea${filaValidas.length !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
