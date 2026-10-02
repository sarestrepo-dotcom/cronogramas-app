/**
 * Cronogramas ⇄ Google Sheets — sincronización Sheet → App
 *
 * El Sheet manda: cada cambio en la pestaña vinculada se refleja en el proyecto en segundos.
 * Solo se sincronizan las filas con la casilla "Sincronizar" marcada; el resto de la hoja
 * puede tener cualquier información que no va a la app.
 *
 * - Columnas reconocidas (por nombre del encabezado, igual que el importador de la app):
 *   Número, Título/Tarea, Tipo, Fase, Padre, Fecha inicio, Fecha fin, Responsable, Estado,
 *   Prioridad, Progreso, Dependencia, Notas, Descripción. Las demás columnas se ignoran.
 * - El script agrega dos columnas de control: "Sincronizar" (casilla) e "ID App" (no editar).
 * - Si una fila se borra o se desmarca, la tarea se elimina del proyecto.
 * - Solo toca tareas creadas desde este Sheet: las tareas creadas en la app se respetan.
 * - Solo escribe los campos cuyas columnas existen en la hoja.
 *
 * Instalación: Extensiones → Apps Script → pegar este archivo y appsscript.json →
 * guardar → volver al Sheet → menú "Cronogramas" → "Vincular con proyecto…".
 */

const FIREBASE_PROJECT = 'cronogramas-bluemartech'
const FS = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT + '/databases/(default)/documents'
const COL_SYNC = 'Sincronizar'
const COL_ID = 'ID App'

function props() { return PropertiesService.getDocumentProperties() }

// ─── Menú ─────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Cronogramas')
    .addItem('Vincular con proyecto…', 'vincular')
    .addItem('Sincronizar ahora', 'sincronizarAhora')
    .addSeparator()
    .addItem('Marcar todas las filas para sincronizar', 'marcarTodas')
    .addItem('Ver estado de la vinculación', 'verEstado')
    .addItem('Desvincular', 'desvincular')
    .addToUi()
}

function vincular() {
  const ui = SpreadsheetApp.getUi()
  const r = ui.prompt('Vincular con proyecto',
    'Pega el enlace del proyecto en Cronogramas (ábrelo en la app y copia la URL).\n' +
    'La pestaña activa ("' + SpreadsheetApp.getActiveSheet().getName() + '") será la que se sincronice.',
    ui.ButtonSet.OK_CANCEL)
  if (r.getSelectedButton() !== ui.Button.OK) return
  const m = r.getResponseText().match(/\/empresa\/([^/?#]+)\/(?:cliente\/[^/?#]+\/)?proyecto\/([^/?#]+)/)
  if (!m) { ui.alert('El enlace no parece de un proyecto. Debe contener /empresa/…/proyecto/…'); return }
  const empresaId = m[1], proyectoId = m[2]

  let proyecto
  try {
    proyecto = fsGet('proyectos/' + proyectoId)
  } catch (err) {
    ui.alert('Tu cuenta de Google no tiene acceso al proyecto de Firebase "' + FIREBASE_PROJECT + '".\n' +
      'Pide que te den el rol "Usuario de Cloud Datastore" en la consola de Google Cloud (IAM), o vincula la hoja con una cuenta que sea propietaria.\n\n' + err.message)
    return
  }
  if (!proyecto) { ui.alert('No se encontró el proyecto. Revisa el enlace.'); return }
  if (str(proyecto.fields.empresaId) !== empresaId) { ui.alert('El proyecto no pertenece a esa empresa.'); return }

  const sheet = SpreadsheetApp.getActiveSheet()
  props().setProperties({ proyectoId: proyectoId, empresaId: empresaId, sheetId: String(sheet.getSheetId()) })
  asegurarColumnasControl(sheet)
  instalarTriggers()
  const res = sincronizar()
  ui.alert('Vinculado con "' + str(proyecto.fields.nombre) + '".\n\n' + resumen(res) +
    '\n\nMarca la casilla "' + COL_SYNC + '" en las filas que quieras llevar a la app.')
}

function desvincular() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t) })
  const proyectoId = props().getProperty('proyectoId')
  if (proyectoId) fsPatch('proyectos/' + proyectoId, {}, ['sheetSync'])
  props().deleteAllProperties()
  SpreadsheetApp.getUi().alert('Desvinculado. Las tareas ya creadas se quedan en la app (ya no se actualizan desde aquí).')
}

function verEstado() {
  const p = props().getProperties()
  SpreadsheetApp.getUi().alert(p.proyectoId
    ? 'Vinculado al proyecto ' + p.proyectoId + '\nÚltima sincronización: ' + (p.ultimaSync || '—') + '\n' + (p.ultimoResultado || '')
    : 'Esta hoja no está vinculada a ningún proyecto.')
}

function marcarTodas() {
  const sheet = hojaVinculada()
  if (!sheet) return
  asegurarColumnasControl(sheet)
  const { headerRow, cols } = leerEncabezados(sheet)
  const last = sheet.getLastRow()
  if (last <= headerRow) return
  const titulos = sheet.getRange(headerRow + 1, cols.titulo + 1, last - headerRow, 1).getValues()
  sheet.getRange(headerRow + 1, cols[COL_SYNC] + 1, last - headerRow, 1)
    .setValues(titulos.map(function (r) { return [String(r[0]).trim() !== ''] }))
  sincronizar()
}

function sincronizarAhora() {
  SpreadsheetApp.getUi().alert(resumen(sincronizar()))
}

// ─── Triggers ─────────────────────────────────────────────────────────────────

function instalarTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t) })
  const ss = SpreadsheetApp.getActive()
  ScriptApp.newTrigger('alEditar').forSpreadsheet(ss).onEdit().create()
  ScriptApp.newTrigger('alCambiar').forSpreadsheet(ss).onChange().create()
  // Respaldo: captura cambios por fórmulas o importaciones que no disparan onEdit
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(10).create()
}

function alEditar(e) {
  if (e && e.range && String(e.range.getSheet().getSheetId()) !== props().getProperty('sheetId')) return
  // Quién editó (para el historial de la tarea). Google solo lo entrega dentro del mismo dominio.
  try {
    const email = e && e.user && e.user.getEmail ? e.user.getEmail() : ''
    if (email) CacheService.getDocumentCache().put('editor', email, 300)
  } catch (err) { /* sin acceso al editor */ }
  sincronizar()
}

function alCambiar() { sincronizar() }

// ─── Sincronización ───────────────────────────────────────────────────────────

function sincronizar() {
  const proyectoId = props().getProperty('proyectoId')
  const empresaId = props().getProperty('empresaId')
  if (!proyectoId) return { error: 'Hoja no vinculada' }

  // Si ya hay una sincronización corriendo, se deja marcada otra para el final
  const lock = LockService.getDocumentLock()
  const cache = CacheService.getDocumentCache()
  if (!lock.tryLock(100)) { cache.put('pendiente', '1', 120); return { pendiente: true } }

  let res
  try {
    let vueltas = 0
    do {
      cache.remove('pendiente')
      res = sincronizarUnaVez(proyectoId, empresaId)
      vueltas++
    } while (cache.get('pendiente') && vueltas < 3)
  } catch (err) {
    res = { error: String(err && err.message || err) }
  } finally {
    lock.releaseLock()
  }

  const ahora = new Date()
  props().setProperties({ ultimaSync: ahora.toLocaleString(), ultimoResultado: resumen(res) })
  try {
    fsPatch('proyectos/' + proyectoId, {
      sheetSync: { mapValue: { fields: {
        url: { stringValue: SpreadsheetApp.getActive().getUrl() },
        nombre: { stringValue: SpreadsheetApp.getActive().getName() },
        ultimaSync: { timestampValue: ahora.toISOString() },
        filas: { integerValue: String(res.filas || 0) },
        error: res.error ? { stringValue: res.error } : { nullValue: null },
      } } },
    }, ['sheetSync'])
  } catch (e) { /* el estado es informativo */ }
  return res
}

function sincronizarUnaVez(proyectoId, empresaId) {
  const sheet = hojaVinculada()
  if (!sheet) return { error: 'No se encontró la pestaña vinculada' }
  asegurarColumnasControl(sheet)
  const enc = leerEncabezados(sheet)
  const cols = enc.cols
  if (cols.titulo === undefined) return { error: 'No se encontró una columna de Título/Tarea' }

  const last = sheet.getLastRow()
  const nFilas = Math.max(0, last - enc.headerRow)
  const valores = nFilas ? sheet.getRange(enc.headerRow + 1, 1, nFilas, sheet.getLastColumn()).getValues() : []
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone()

  // Casillas en filas nuevas
  if (nFilas) {
    const rangoSync = sheet.getRange(enc.headerRow + 1, cols[COL_SYNC] + 1, nFilas, 1)
    rangoSync.insertCheckboxes()
  }

  // 1) Filas marcadas → tareas deseadas (con ID estable en la columna "ID App")
  const existentes = listarTareasDelProyecto(proyectoId)
  const idsUsados = {}
  const nuevosIds = []
  const filas = []
  valores.forEach(function (row, i) {
    const titulo = String(row[cols.titulo] || '').trim()
    if (row[cols[COL_SYNC]] !== true || !titulo) return
    let id = String(row[cols[COL_ID]] || '').trim()
    const ajeno = id && existentes[id] && existentes[id].origen !== 'sheets'
    if (!id || idsUsados[id] || ajeno) { // fila nueva, duplicada (copiada) o ID de una tarea de la app
      id = nuevoId()
      nuevosIds.push([i, id])
    }
    idsUsados[id] = true
    filas.push(parsearFila(row, cols, tz, id, i))
  })
  nuevosIds.forEach(function (p) { sheet.getRange(enc.headerRow + 1 + p[0], cols[COL_ID] + 1).setValue(p[1]) })

  // Limpiar "ID App" de filas desmarcadas (si se vuelven a marcar, se crea de nuevo)
  valores.forEach(function (row, i) {
    if (row[cols[COL_SYNC]] !== true && String(row[cols[COL_ID]] || '').trim()) {
      sheet.getRange(enc.headerRow + 1 + i, cols[COL_ID] + 1).setValue('')
    }
  })

  // 2) Jerarquía y dependencias (igual que el importador de la app)
  resolverJerarquia(filas)

  // 3) Diferencias contra Firestore
  const campos = camposGestionados(cols)
  const editor = CacheService.getDocumentCache().get('editor') || ''
  const writes = []
  let creadas = 0, actualizadas = 0, eliminadas = 0
  filas.forEach(function (f) {
    const actual = existentes[f.id]
    const camposFila = campos.filter(function (k) { return !((k === 'fechaInicio' || k === 'fechaFin') && !f[k]) })
    const fields = aFirestore(f, camposFila)
    if (!actual) {
      const hoy = new Date().toISOString()
      if (!fields.fechaInicio) fields.fechaInicio = { timestampValue: hoy }
      if (!fields.fechaFin) fields.fechaFin = { timestampValue: hoy }
      fields.proyectoId = { stringValue: proyectoId }
      fields.empresaId = { stringValue: empresaId }
      fields.creadoPor = { stringValue: 'google-sheets' }
      fields.creadoEn = { timestampValue: new Date().toISOString() }
      fields.actualizadoEn = { timestampValue: new Date().toISOString() }
      if (!fields.dependencias) fields.dependencias = { arrayValue: { values: [] } }
      if (!fields.progreso) fields.progreso = { integerValue: '0' }
      writes.push({ update: { name: docName('tareas/' + f.id), fields: fields } })
      creadas++
    } else if (cambio(actual.fields, fields, camposFila)) {
      historial(actual.fields, fields, camposFila).forEach(function (h) {
        writes.push({ update: { name: docName('historial_cambios/' + nuevoId()), fields: {
          tareaId: { stringValue: f.id },
          proyectoId: { stringValue: proyectoId },
          campo: { stringValue: h.campo },
          valorAnterior: { stringValue: h.antes },
          valorNuevo: { stringValue: h.despues },
          cambiadoPor: { stringValue: 'google-sheets' },
          cambiadoPorNombre: { stringValue: 'Google Sheets' + (editor ? ' · ' + editor : '') },
          cambiadoEn: { timestampValue: new Date().toISOString() },
        } } })
      })
      fields.actualizadoEn = { timestampValue: new Date().toISOString() }
      writes.push({
        update: { name: docName('tareas/' + f.id), fields: fields },
        updateMask: { fieldPaths: camposFila.concat(['actualizadoEn']) },
        currentDocument: { exists: true },
      })
      actualizadas++
    }
  })
  Object.keys(existentes).forEach(function (id) {
    if (existentes[id].origen === 'sheets' && !idsUsados[id]) {
      writes.push({ delete: docName('tareas/' + id) })
      eliminadas++
    }
  })

  for (let i = 0; i < writes.length; i += 400) fsCommit(writes.slice(i, i + 400))
  let portales = 0
  if (writes.length) portales = publicarPortales(proyectoId)
  return { filas: filas.length, creadas: creadas, actualizadas: actualizadas, eliminadas: eliminadas, portales: portales }
}

// ─── Lectura de la hoja ───────────────────────────────────────────────────────

const KEYWORDS = {
  numero: ['numero', 'num', 'n', '#', 'numeracion', 'item'],
  titulo: ['titulo', 'tarea', 'subtarea', 'task', 'nombre', 'name', 'actividad', 'activity', 'concepto'],
  fase: ['fase', 'phase', 'frente', 'etapa', 'sprint', 'modulo', 'categoria'],
  padre: ['padre', 'parent', 'grupo padre', 'tarea padre', 'pertenece a', 'grupo'],
  fechaInicio: ['inicio', 'inicial', 'start', 'begin', 'comienzo', 'arranque', 'desde', 'from', 'fecha inicio', 'fecha de inicio', 'fecha inicial'],
  // "entrega" sola NO: chocaría con la columna "Entregable"
  fechaFin: ['fin', 'final', 'end', 'termino', 'deadline', 'vencimiento', 'hasta', 'cierre', 'due', 'fecha fin', 'fecha de fin', 'fecha final', 'fecha entrega', 'fecha de entrega'],
  entregables: ['entregable', 'entregables', 'resultado', 'deliverable'],
  bloqueo: ['bloqueo', 'tipo de bloqueo', 'bloqueado por', 'lado del bloqueo'],
  responsable: ['responsable', 'assigned', 'owner', 'assignee', 'persona', 'ejecutor', 'encargado', 'quien', 'asignado'],
  estado: ['estado', 'status', 'estatus', 'situacion', 'estado actual'],
  prioridad: ['prioridad', 'priority', 'urgencia', 'importancia'],
  tipo: ['tipo', 'type', 'clase'],
  descripcion: ['descripcion', 'description', 'detalle', 'detail'],
  progreso: ['progreso', 'progress', 'avance', 'porcentaje', 'percent'],
  notas: ['notas', 'notes', 'observaciones', 'comentarios', 'contexto', 'nota'],
  dependencia: ['dependencia', 'dependencias', 'dependency', 'depends', 'depende', 'dep', 'predecesora'],
}

function normalizar(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s%#]/g, '').trim()
}

function detectarCampo(header) {
  const norm = normalizar(header)
  if (!norm) return null
  let best = null, bestScore = 0
  for (const campo in KEYWORDS) {
    for (const kw of KEYWORDS[campo]) {
      if (norm === kw) return campo
      if (kw.length > 1 && (norm.startsWith(kw) || norm.includes(kw)) && kw.length > bestScore) {
        bestScore = kw.length; best = campo
      }
    }
  }
  return best
}

// Busca la fila de encabezados en las primeras 10 filas (la primera con columna de título)
function leerEncabezados(sheet) {
  const lastCol = Math.max(1, sheet.getLastColumn())
  const filas = sheet.getRange(1, 1, Math.min(10, Math.max(1, sheet.getLastRow())), lastCol).getValues()
  for (let r = 0; r < filas.length; r++) {
    const cols = {}
    filas[r].forEach(function (h, c) {
      const txt = String(h).trim()
      if (txt === COL_SYNC || txt === COL_ID) { cols[txt] = c; return }
      const campo = detectarCampo(txt)
      if (campo && cols[campo] === undefined) cols[campo] = c
    })
    if (cols.titulo !== undefined) return { headerRow: r + 1, cols: cols }
  }
  return { headerRow: 1, cols: {} }
}

function asegurarColumnasControl(sheet) {
  const enc = leerEncabezados(sheet)
  if (enc.cols.titulo === undefined) return
  let lastCol = sheet.getLastColumn()
  if (enc.cols[COL_SYNC] === undefined) {
    sheet.getRange(enc.headerRow, ++lastCol).setValue(COL_SYNC).setFontWeight('bold')
  }
  if (enc.cols[COL_ID] === undefined) {
    sheet.getRange(enc.headerRow, ++lastCol).setValue(COL_ID).setFontWeight('bold').setFontColor('#94a3b8')
      .setNote('Lo llena el script para enlazar la fila con la tarea. No lo edites.')
  }
}

function hojaVinculada() {
  const id = props().getProperty('sheetId')
  return SpreadsheetApp.getActive().getSheets().filter(function (s) { return String(s.getSheetId()) === id })[0] || null
}

const ESTADOS = {
  pendiente: 'pendiente', pending: 'pendiente', 'por hacer': 'pendiente', 'no iniciado': 'pendiente',
  'en progreso': 'en_progreso', enprogreso: 'en_progreso', 'in progress': 'en_progreso', 'en proceso': 'en_progreso',
  iniciado: 'en_progreso', activo: 'en_progreso',
  completada: 'completada', completado: 'completada', done: 'completada', finalizado: 'completada',
  terminado: 'completada', listo: 'completada', cerrado: 'completada', closed: 'completada',
  bloqueada: 'bloqueada', bloqueado: 'bloqueada', blocked: 'bloqueada', detenido: 'bloqueada',
}
const PRIORIDADES = {
  baja: 'baja', low: 'baja', media: 'media', medium: 'media', normal: 'media',
  alta: 'alta', high: 'alta', critica: 'critica', critical: 'critica', urgente: 'critica',
}
const TIPOS = {
  tarea: 'tarea', task: 'tarea', s: 'tarea', hito: 'hito', milestone: 'hito', h: 'hito',
  grupo: 'grupo', group: 'grupo', padre: 'grupo', t: 'grupo', g: 'grupo',
}
const PROGRESO_ESTADO = { pendiente: 0, en_progreso: 50, completada: 100 }

function celda(row, cols, campo) {
  return cols[campo] === undefined ? '' : row[cols[campo]]
}

function parsearFecha(v, tz, finDeDia) {
  let d = null
  if (v instanceof Date && !isNaN(v)) {
    d = Utilities.formatDate(v, tz, 'yyyy-MM-dd')
  } else {
    const s = String(v || '').trim()
    let m
    if ((m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/))) {
      d = (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2)
    } else if ((m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/))) {
      d = m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2)
    }
  }
  if (!d) return null
  const local = Utilities.parseDate(d + (finDeDia ? ' 23:59:59' : ' 00:00:00'), tz, 'yyyy-MM-dd HH:mm:ss')
  return local.toISOString()
}

// "Cliente", "Del cliente", "Externo" → cliente · "Interno", "Equipo" → interno
function parsearBloqueo(v) {
  const n = normalizar(v)
  if (!n) return ''
  if (n.indexOf('client') >= 0 || n.indexOf('extern') >= 0) return 'cliente'
  if (n.indexOf('intern') >= 0 || n.indexOf('equipo') >= 0) return 'interno'
  return ''
}

function parsearFila(row, cols, tz, id, indice) {
  const numero = String(celda(row, cols, 'numero')).trim()
  const padre = String(celda(row, cols, 'padre')).trim()
  const ini = parsearFecha(celda(row, cols, 'fechaInicio'), tz, false)
  const fin = parsearFecha(celda(row, cols, 'fechaFin'), tz, true)
  const estado = ESTADOS[normalizar(celda(row, cols, 'estado'))] || 'pendiente'
  // Grupo solo si la columna Tipo lo dice o si la fila tiene hijos (ver resolverJerarquia)
  const tipo = TIPOS[normalizar(celda(row, cols, 'tipo'))] || 'tarea'
  const progRaw = celda(row, cols, 'progreso')
  let progreso
  if (cols.progreso !== undefined && String(progRaw).trim() !== '') {
    // Una celda con formato de porcentaje llega como fracción (50% → 0.5)
    const n = typeof progRaw === 'number' ? (progRaw <= 1 ? progRaw * 100 : progRaw)
      : parseFloat(String(progRaw).replace('%', '').replace(',', '.'))
    progreso = Math.min(100, Math.max(0, Math.round(n) || 0))
  } else {
    progreso = PROGRESO_ESTADO[estado] !== undefined ? PROGRESO_ESTADO[estado] : 0
  }
  if (estado === 'completada') progreso = 100
  const responsables = String(celda(row, cols, 'responsable')).split(/[,;]/).map(function (s) { return s.trim() }).filter(Boolean)
  return {
    id: id, indice: indice, numero: numero, padre: padre, tipo: tipo,
    titulo: String(celda(row, cols, 'titulo')).trim(),
    fase: String(celda(row, cols, 'fase')).trim(),
    descripcion: String(celda(row, cols, 'descripcion')).trim(),
    notas: String(celda(row, cols, 'notas')).trim(),
    estado: estado,
    entregables: String(celda(row, cols, 'entregables')).trim(),
    bloqueo: parsearBloqueo(celda(row, cols, 'bloqueo')),
    prioridad: PRIORIDADES[normalizar(celda(row, cols, 'prioridad'))] || 'media',
    progreso: progreso,
    // Sin fechas en la hoja (p. ej. grupos): se conservan las de la tarea (null = no tocar)
    fechaInicio: ini || fin || null,
    fechaFin: tipo === 'hito' ? (ini || fin || null) : (fin || ini || null),
    responsables: responsables,
    dependenciaRaw: String(celda(row, cols, 'dependencia')).trim(),
    orden: indice * 1000,
  }
}

function resolverJerarquia(filas) {
  const parentNum = function (n) { const d = n.lastIndexOf('.'); return d > 0 ? n.slice(0, d) : '' }
  const conHijos = {}, esPadre = {}
  filas.forEach(function (f) {
    if (f.numero.indexOf('.') >= 0) conHijos[parentNum(f.numero)] = true
    if (f.padre) esPadre[f.padre.toLowerCase()] = true
  })
  const porNumero = {}, porTitulo = {}
  filas.forEach(function (f) {
    if (f.tipo !== 'hito' && ((f.numero && conHijos[f.numero]) || esPadre[f.titulo.toLowerCase()])) f.tipo = 'grupo'
    if (f.numero) porNumero[f.numero] = f.id
    porTitulo[f.titulo.toLowerCase()] = f.id
  })
  filas.forEach(function (f, i) {
    let parentId = ''
    if (f.numero) parentId = porNumero[parentNum(f.numero)] || ''
    if (!parentId && f.padre) parentId = porTitulo[f.padre.toLowerCase()] || ''
    if (!parentId && !f.numero) {
      for (let j = i - 1; j >= 0; j--) { if (filas[j].tipo === 'grupo') { parentId = filas[j].id; break } }
    }
    f.parentId = parentId === f.id ? '' : parentId
    f.dependencias = f.dependenciaRaw
      ? f.dependenciaRaw.split(/[,;]/).map(function (r) { r = r.trim(); return porNumero[r] || porTitulo[r.toLowerCase()] || '' })
          .filter(function (d) { return d && d !== f.id })
      : []
  })
}

// Solo se gestionan los campos cuyas columnas existen en la hoja (más los estructurales)
function camposGestionados(cols) {
  const campos = ['titulo', 'tipo', 'parentId', 'orden', 'origen', 'estado', 'progreso', 'fechaInicio', 'fechaFin']
  if (cols.numero !== undefined) campos.push('numero')
  if (cols.fase !== undefined) campos.push('fase')
  if (cols.descripcion !== undefined) campos.push('descripcion')
  if (cols.notas !== undefined) campos.push('notas')
  if (cols.entregables !== undefined) campos.push('entregables')
  if (cols.bloqueo !== undefined) campos.push('bloqueo')
  if (cols.prioridad !== undefined) campos.push('prioridad')
  if (cols.responsable !== undefined) campos.push('asignadoA', 'asignadosA')
  if (cols.dependencia !== undefined) campos.push('dependencias')
  return campos
}

function aFirestore(f, campos) {
  const v = {}
  const set = function (k, val) { if (campos.indexOf(k) >= 0 && val !== undefined) v[k] = val }
  const s = function (x) { return x ? { stringValue: x } : undefined } // vacío → se borra el campo
  set('titulo', { stringValue: f.titulo })
  set('numero', s(f.numero))
  set('tipo', { stringValue: f.tipo })
  set('parentId', s(f.parentId))
  set('orden', { integerValue: String(f.orden) })
  set('origen', { stringValue: 'sheets' })
  set('estado', { stringValue: f.estado })
  set('progreso', { integerValue: String(f.progreso) })
  set('fechaInicio', f.fechaInicio ? { timestampValue: f.fechaInicio } : undefined)
  set('fechaFin', f.fechaFin ? { timestampValue: f.fechaFin } : undefined)
  set('fase', s(f.fase))
  set('descripcion', s(f.descripcion))
  set('notas', s(f.notas))
  set('entregables', s(f.entregables))
  set('bloqueo', s(f.bloqueo))
  set('prioridad', { stringValue: f.prioridad })
  set('asignadoA', s(f.responsables[0]))
  set('asignadosA', f.responsables.length ? { arrayValue: { values: f.responsables.map(function (r) { return { stringValue: r } }) } } : undefined)
  set('dependencias', { arrayValue: { values: f.dependencias.map(function (d) { return { stringValue: d } }) } })
  if (!v.prioridad) v.prioridad = { stringValue: 'media' }
  return v
}

function valorComparable(x) {
  if (!x) return ''
  if (x.timestampValue) return new Date(x.timestampValue).getTime()
  if (x.arrayValue) return JSON.stringify((x.arrayValue.values || []).map(valorComparable))
  if (x.integerValue !== undefined) return Number(x.integerValue)
  if (x.doubleValue !== undefined) return Number(x.doubleValue)
  if (x.stringValue !== undefined) return x.stringValue
  return JSON.stringify(x)
}

// Cambios visibles para el historial de la tarea (mismo formato que registra la app)
const CAMPOS_HISTORIAL = ['titulo', 'estado', 'progreso', 'fechaInicio', 'fechaFin', 'asignadosA', 'prioridad', 'notas', 'fase', 'bloqueo', 'entregables']
const ESTADO_LABEL = { pendiente: 'Pendiente', en_progreso: 'En progreso', completada: 'Completada', bloqueada: 'Bloqueada' }

function legible(campo, x) {
  if (!x) return ''
  if (x.timestampValue) return Utilities.formatDate(new Date(x.timestampValue), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'dd/MM/yyyy')
  if (x.arrayValue) return (x.arrayValue.values || []).map(function (v) { return v.stringValue || '' }).join(', ')
  if (campo === 'progreso') return String(x.integerValue !== undefined ? x.integerValue : x.doubleValue) + '%'
  if (campo === 'estado') return ESTADO_LABEL[x.stringValue] || x.stringValue
  return x.stringValue !== undefined ? x.stringValue : String(x.integerValue || '')
}

function historial(actual, nuevo, campos) {
  return CAMPOS_HISTORIAL
    .filter(function (k) { return campos.indexOf(k) >= 0 && valorComparable(actual[k]) !== valorComparable(nuevo[k]) })
    .map(function (k) { return { campo: k, antes: legible(k, actual[k]).slice(0, 500), despues: legible(k, nuevo[k]).slice(0, 500) } })
    .filter(function (h) { return h.antes !== h.despues })
}

function cambio(actual, nuevo, campos) {
  return campos.some(function (k) { return valorComparable(actual[k]) !== valorComparable(nuevo[k]) })
}

// ─── Portal del cliente ───────────────────────────────────────────────────────
// Misma copia filtrada que publica la app (construirDatosPortal en src/lib/firestore.ts):
// sin valor de venta, responsables, descripciones ni notas internas (notas solo si bloqueada).

function publicarPortales(proyectoId) {
  const proyecto = fsGet('proyectos/' + proyectoId)
  if (!proyecto) return 0
  const pf = proyecto.fields || {}
  const r = UrlFetchApp.fetch(FS + ':runQuery', {
    method: 'post', contentType: 'application/json', headers: headers(), muteHttpExceptions: true,
    payload: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'portales' }],
      where: { fieldFilter: { field: { fieldPath: 'proyectoId' }, op: 'EQUAL', value: { stringValue: proyectoId } } },
    } }),
  })
  if (r.getResponseCode() !== 200) return 0
  const activos = JSON.parse(r.getContentText())
    .filter(function (x) { return x.document && x.document.fields && x.document.fields.activo && x.document.fields.activo.booleanValue === true })
  if (!activos.length) return 0

  const nul = { nullValue: null }
  const copiar = function (v) { return v === undefined ? nul : v }
  const tareas = listarTareasDelProyecto(proyectoId)
  const lista = Object.keys(tareas).map(function (id) {
    const t = tareas[id].fields
    const bloqueada = str(t.estado) === 'bloqueada'
    return { mapValue: { fields: {
      id: { stringValue: id },
      titulo: copiar(t.titulo),
      numero: copiar(t.numero),
      tipo: t.tipo || { stringValue: 'tarea' },
      parentId: copiar(t.parentId),
      orden: copiar(t.orden),
      estado: copiar(t.estado),
      prioridad: t.prioridad || { stringValue: 'media' },
      progreso: t.progreso || { integerValue: '0' },
      fase: copiar(t.fase),
      dependencias: t.dependencias || { arrayValue: { values: [] } },
      fechaInicio: copiar(t.fechaInicio),
      fechaFin: copiar(t.fechaFin),
      notas: bloqueada ? copiar(t.notas) : nul,
      bloqueo: bloqueada ? copiar(t.bloqueo) : nul,
    } } }
  })
  const duenos = Object.keys((pf.miembros && pf.miembros.mapValue && pf.miembros.mapValue.fields) || {})
    .filter(function (uid) { return str(pf.miembros.mapValue.fields[uid]) === 'owner' })
  if (!duenos.length && str(pf.creadoPor)) duenos.push(str(pf.creadoPor))

  const fields = {
    empresaId: copiar(pf.empresaId),
    duenos: { arrayValue: { values: duenos.map(function (u) { return { stringValue: u } }) } },
    publico: { mapValue: { fields: {
      proyecto: { mapValue: { fields: {
        nombre: copiar(pf.nombre), objetivo: copiar(pf.objetivo), estado: copiar(pf.estado),
        fechaInicio: copiar(pf.fechaInicio), fechaFin: copiar(pf.fechaFin),
      } } },
      tareas: { arrayValue: { values: lista } },
      actualizadoEn: { timestampValue: new Date().toISOString() },
    } } },
    // Distinto al hash de la app: cuando alguien abra el proyecto, la app republica una vez
    publicoHash: { stringValue: 'sheets-' + Date.now() },
  }
  const writes = activos.map(function (x) {
    return { update: { name: x.document.name, fields: fields },
      updateMask: { fieldPaths: ['empresaId', 'duenos', 'publico', 'publicoHash'] },
      currentDocument: { exists: true } }
  })
  fsCommit(writes)
  return activos.length
}

// ─── Firestore REST (con la cuenta de Google de quien vinculó la hoja) ────────

function headers() {
  return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
}

function docName(path) {
  return 'projects/' + FIREBASE_PROJECT + '/databases/(default)/documents/' + path
}

function fsGet(path) {
  const r = UrlFetchApp.fetch(FS + '/' + path, { headers: headers(), muteHttpExceptions: true })
  if (r.getResponseCode() === 404) return null
  if (r.getResponseCode() !== 200) throw new Error('Firestore ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300))
  return JSON.parse(r.getContentText())
}

function fsPatch(path, fields, mask) {
  const qs = mask.map(function (m) { return 'updateMask.fieldPaths=' + encodeURIComponent(m) }).join('&')
  const r = UrlFetchApp.fetch(FS + '/' + path + '?' + qs + '&currentDocument.exists=true', {
    method: 'patch', contentType: 'application/json', headers: headers(),
    payload: JSON.stringify({ fields: fields }), muteHttpExceptions: true,
  })
  if (r.getResponseCode() !== 200) throw new Error('Firestore ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300))
}

function fsCommit(writes) {
  if (!writes.length) return
  const r = UrlFetchApp.fetch(FS + ':commit', {
    method: 'post', contentType: 'application/json', headers: headers(),
    payload: JSON.stringify({ writes: writes }), muteHttpExceptions: true,
  })
  if (r.getResponseCode() !== 200) throw new Error('Firestore ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300))
}

function listarTareasDelProyecto(proyectoId) {
  const r = UrlFetchApp.fetch(FS + ':runQuery', {
    method: 'post', contentType: 'application/json', headers: headers(), muteHttpExceptions: true,
    payload: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'tareas' }],
      where: { fieldFilter: { field: { fieldPath: 'proyectoId' }, op: 'EQUAL', value: { stringValue: proyectoId } } },
    } }),
  })
  if (r.getResponseCode() !== 200) throw new Error('Firestore ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300))
  const out = {}
  JSON.parse(r.getContentText()).forEach(function (x) {
    if (!x.document) return
    const id = x.document.name.split('/').pop()
    out[id] = { fields: x.document.fields || {}, origen: str(x.document.fields && x.document.fields.origen) }
  })
  return out
}

function str(v) { return v && v.stringValue !== undefined ? v.stringValue : '' }

function nuevoId() {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 20; i++) id += abc.charAt(Math.floor(Math.random() * abc.length))
  return id
}

function resumen(res) {
  if (!res) return ''
  if (res.error) return '⚠️ Error: ' + res.error
  if (res.pendiente) return 'Sincronización en curso…'
  return '✅ ' + res.filas + ' filas sincronizadas · ' + res.creadas + ' nuevas · ' +
    res.actualizadas + ' actualizadas · ' + res.eliminadas + ' eliminadas' +
    (res.portales ? ' · portal del cliente actualizado' : '')
}
