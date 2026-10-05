/**
 * Cronogramas ⇄ COR — sincronización COR → App
 *
 * Se instala en un Google Sheet "Panel COR" (uno solo para todas las empresas):
 * - Cada instancia de COR (una por empresa) se registra con su API key + client secret.
 *   Las llaves quedan en las propiedades privadas del script, nunca en la hoja.
 * - La pestaña "Vinculaciones" relaciona un proyecto de COR con un proyecto de Cronogramas.
 * - Cada 10 minutos se traen tareas, estado, prioridad, fechas, colaboradores y horas.
 *   COR manda: los cambios hechos en la app sobre estas tareas se sobrescriben.
 *
 * API: https://developers.projectcor.com (OAuth2 client credentials, tokens de 1 h).
 */

const FIREBASE_PROJECT = 'cronogramas-bluemartech'
const FS = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT + '/databases/(default)/documents'
const COR = 'https://api.projectcor.com/v1'
const HOJA_VINC = 'Vinculaciones'
const HOJA_PROY = 'Proyectos COR'
const ENC_VINC = ['Instancia', 'ID proyecto COR', 'Proyecto COR', 'Enlace Cronogramas', 'Última sincronización', 'Resultado']

function props() { return PropertiesService.getScriptProperties() }

// ─── Menú ─────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi().createMenu('COR')
    .addItem('Agregar instancia…', 'agregarInstancia')
    .addItem('Ver proyectos de COR…', 'verProyectos')
    .addItem('Vincular proyecto…', 'vincularProyecto')
    .addSeparator()
    .addItem('Sincronizar ahora', 'sincronizarAhora')
    .addItem('Activar sincronización automática', 'activarAutomatica')
    .addItem('Desactivar sincronización automática', 'desactivarAutomatica')
    .addSeparator()
    .addItem('Ver instancias registradas', 'verInstancias')
    .addItem('Diagnóstico: ver campos que envía COR…', 'diagnostico')
    .addItem('Eliminar instancia…', 'eliminarInstancia')
    .addToUi()
}

function pedir(titulo, texto) {
  const ui = SpreadsheetApp.getUi()
  const r = ui.prompt(titulo, texto, ui.ButtonSet.OK_CANCEL)
  return r.getSelectedButton() === ui.Button.OK ? r.getResponseText().trim() : null
}

function agregarInstancia() {
  const ui = SpreadsheetApp.getUi()
  const nombre = pedir('Instancia de COR', 'Nombre para identificarla (p. ej. "SM Digital"):')
  if (!nombre) return
  const key = pedir('API key', 'API key de COR para "' + nombre + '":')
  if (!key) return
  const secret = pedir('Client secret', 'Client secret de COR para "' + nombre + '":')
  if (!secret) return
  try {
    const token = obtenerToken({ key: key, secret: secret }, true)
    const yo = corGet(token, '/me')
    props().setProperty('cor:' + nombre, JSON.stringify({ key: key, secret: secret }))
    ui.alert('Instancia "' + nombre + '" guardada ✅\nConectado como: ' + ((yo && (yo.first_name || yo.email)) || 'usuario de COR'))
  } catch (e) {
    ui.alert('No se pudo conectar con COR: ' + e.message)
  }
}

function instancias() {
  return props().getKeys().filter(function (k) { return k.indexOf('cor:') === 0 }).map(function (k) { return k.slice(4) })
}

function credenciales(nombre) {
  const raw = props().getProperty('cor:' + nombre)
  if (!raw) throw new Error('La instancia "' + nombre + '" no está registrada (COR → Agregar instancia…)')
  return JSON.parse(raw)
}

function verInstancias() {
  const lista = instancias()
  SpreadsheetApp.getUi().alert(lista.length ? 'Instancias registradas:\n• ' + lista.join('\n• ') : 'No hay instancias. Usa COR → Agregar instancia…')
}

function eliminarInstancia() {
  const nombre = pedir('Eliminar instancia', 'Nombre de la instancia a eliminar (' + instancias().join(', ') + '):')
  if (!nombre) return
  props().deleteProperty('cor:' + nombre)
  SpreadsheetApp.getUi().alert('Instancia "' + nombre + '" eliminada.')
}

function verProyectos() {
  const nombre = pedir('Ver proyectos', 'Instancia (' + instancias().join(', ') + '):')
  if (!nombre) return
  const token = obtenerToken(credenciales(nombre))
  const proyectos = listarTodo(token, '/projects', {})
  const ss = SpreadsheetApp.getActive()
  const hoja = ss.getSheetByName(HOJA_PROY) || ss.insertSheet(HOJA_PROY)
  hoja.clear()
  const filas = [['Instancia', 'ID', 'Proyecto', 'Cliente', 'Estado', 'Inicio', 'Fin', 'Archivado']].concat(
    proyectos.map(function (p) {
      return [nombre, p.id, p.name, (p.client && p.client.name) || '', p.status || '', p.start || '', p.end || '', p.archived ? 'Sí' : 'No']
    }))
  hoja.getRange(1, 1, filas.length, filas[0].length).setValues(filas)
  hoja.getRange(1, 1, 1, filas[0].length).setFontWeight('bold')
  ss.setActiveSheet(hoja)
  SpreadsheetApp.getUi().alert(proyectos.length + ' proyectos de "' + nombre + '" listados en la pestaña "' + HOJA_PROY + '".')
}

function vincularProyecto() {
  const ui = SpreadsheetApp.getUi()
  const inst = pedir('Vincular', 'Instancia de COR (' + instancias().join(', ') + '):')
  if (!inst) return
  const corId = pedir('Vincular', 'ID del proyecto en COR (ver pestaña "' + HOJA_PROY + '"):')
  if (!corId) return
  const url = pedir('Vincular', 'Enlace del proyecto en Cronogramas (Herramientas → COR → Copiar):')
  if (!url) return
  const m = url.match(/\/empresa\/([^/?#]+)\/(?:cliente\/[^/?#]+\/)?proyecto\/([^/?#]+)/)
  if (!m) { ui.alert('El enlace no parece de un proyecto de Cronogramas.'); return }
  try {
    const token = obtenerToken(credenciales(inst))
    const pc = corGet(token, '/projects/' + encodeURIComponent(corId))
    if (!tieneAccesoFirebase()) {
      // Usuario sin acceso a Firebase (p. ej. otro dominio): la cuenta administradora valida y sincroniza
      const hoja = hojaVinculaciones()
      hoja.appendRow([inst, Number(corId), (pc && pc.name) || '', url, '', '⏳ Pendiente: la procesa la cuenta administradora'])
      solicitarSincronizacion()
      ui.alert('Vinculación registrada: "' + ((pc && pc.name) || corId) + '".\n\n' + mensajeSinAcceso())
      return
    }
    const proyecto = fsGet('proyectos/' + m[2])
    if (!proyecto) { ui.alert('No se encontró el proyecto en Cronogramas.'); return }
    if (str(proyecto.fields.empresaId) !== m[1]) { ui.alert('El proyecto no pertenece a esa empresa.'); return }
    const hoja = hojaVinculaciones()
    hoja.appendRow([inst, Number(corId), (pc && pc.name) || '', url, '', ''])
    const res = sincronizarFila(hoja, hoja.getLastRow())
    ui.alert('Vinculado "' + ((pc && pc.name) || corId) + '" → "' + str(proyecto.fields.nombre) + '".\n' + resumen(res) +
      '\n\nActiva COR → Activar sincronización automática para mantenerlo al día.')
  } catch (e) {
    ui.alert('No se pudo vincular: ' + e.message)
  }
}

function hojaVinculaciones() {
  const ss = SpreadsheetApp.getActive()
  let hoja = ss.getSheetByName(HOJA_VINC)
  if (!hoja) {
    hoja = ss.insertSheet(HOJA_VINC, 0)
    hoja.getRange(1, 1, 1, ENC_VINC.length).setValues([ENC_VINC]).setFontWeight('bold')
    hoja.setFrozenRows(1)
  }
  return hoja
}

// Toda escritura en Firebase la hace la cuenta que activó la sincronización automática
// (con acceso IAM al proyecto). Otros usuarios del Panel (p. ej. de otro dominio) solo
// dejan solicitudes, que el trigger de esa cuenta procesa en menos de 1 minuto.
function activarAutomatica() {
  if (!tieneAccesoFirebase()) {
    SpreadsheetApp.getUi().alert('Esta acción debe hacerla una cuenta con acceso al proyecto de Firebase "' + FIREBASE_PROJECT +
      '" (la del administrador). Tu cuenta puede vincular proyectos y pedir sincronizaciones, pero no activar la automática.')
    return
  }
  desactivarAutomatica(true)
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(1).create()
  props().setProperty('autoActiva', new Date().toISOString())
  SpreadsheetApp.getUi().alert('Sincronización automática activada con tu cuenta: cada 10 minutos, y en menos de 1 minuto cuando alguien pida "Sincronizar ahora".')
}

function desactivarAutomatica(silencioso) {
  let borrados = 0
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tick' || t.getHandlerFunction() === 'sincronizarTodo') { ScriptApp.deleteTrigger(t); borrados++ }
  })
  if (borrados) props().deleteProperty('autoActiva')
  if (silencioso !== true) SpreadsheetApp.getUi().alert(borrados ? 'Sincronización automática desactivada.' : 'No hay sincronización automática activada con tu cuenta (solo la puede desactivar quien la activó).')
}

// Trigger de la cuenta administradora: cada minuto revisa si hay solicitudes; cada 10 min sincroniza igual
function tick() {
  const pendiente = props().getProperty('pendiente')
  const ultima = Number(props().getProperty('ultimaAuto') || 0)
  if (!pendiente && Date.now() - ultima < 9.5 * 60 * 1000) return
  props().deleteProperty('pendiente')
  props().setProperty('ultimaAuto', String(Date.now()))
  sincronizarTodo()
}

function solicitarSincronizacion() { props().setProperty('pendiente', String(Date.now())) }

function mensajeSinAcceso() {
  return props().getProperty('autoActiva')
    ? 'Tu cuenta no escribe directo en Cronogramas: la cuenta administradora lo hará en menos de 1 minuto. Revisa la columna "Resultado" de "' + HOJA_VINC + '".'
    : '⚠️ Tu cuenta no tiene acceso directo a Cronogramas y la sincronización automática no está activada. Pide al administrador que ejecute COR → Activar sincronización automática.'
}

function tieneAccesoFirebase() {
  try { fsGet('proyectos/verificacion-acceso-cor'); return true } catch (e) { if (/ 40[13]/.test(e.message)) return false; throw e }
}

function sincronizarAhora() {
  if (!tieneAccesoFirebase()) {
    solicitarSincronizacion()
    SpreadsheetApp.getUi().alert('Solicitud de sincronización enviada.\n\n' + mensajeSinAcceso())
    return
  }
  const res = sincronizarTodo()
  SpreadsheetApp.getUi().alert(res.length ? res.join('\n') : 'No hay vinculaciones. Usa COR → Vincular proyecto…')
}

// Muestra los campos que envía COR para una tarea (para saber de dónde sacar fase, inicio, etc.)
function diagnostico() {
  const inst = pedir('Diagnóstico', 'Instancia de COR (' + instancias().join(', ') + '):')
  if (!inst) return
  const corId = pedir('Diagnóstico', 'ID del proyecto en COR:')
  if (!corId) return
  const token = obtenerToken(credenciales(inst))
  const tareas = listarTodo(token, '/tasks', { projects: [Number(corId)] })
  if (!tareas.length) { SpreadsheetApp.getUi().alert('El proyecto no tiene tareas en COR.'); return }
  // Se muestra una subtarea si la hay (ahí aparece el campo de la tarea madre)
  const t = tareas.filter(function (x) { return padreDe(x) || Object.keys(x).some(function (k) { return /parent|padre|father/i.test(k) && x[k] }) })[0] || tareas[0]
  const resumenCampos = Object.keys(t).map(function (k) {
    const v = t[k]
    return '• ' + k + ': ' + (v && typeof v === 'object' ? JSON.stringify(v).slice(0, 120) : String(v).slice(0, 80))
  }).join('\n')
  SpreadsheetApp.getUi().alert('Campos de la tarea "' + t.title + '" (' + tareas.length + ' tareas en total):\n\n' + resumenCampos +
    '\n\nFase detectada: ' + (faseDeTarea(t).fase || '— (ninguna)') +
    '\nTareas con tarea madre detectada: ' + tareas.filter(function (x) { return padreDe(x) }).length + ' de ' + tareas.length +
    (tareas.some(function (x) { return padreDe(x) }) ? '' : '\n⚠️ No se detectó el campo de tarea madre: envía esta pantalla para ajustarlo.'))
}

// ─── Sincronización ───────────────────────────────────────────────────────────

function sincronizarTodo() {
  const lock = LockService.getScriptLock()
  if (!lock.tryLock(1000)) return ['Ya hay una sincronización en curso']
  const out = []
  try {
    const hoja = hojaVinculaciones()
    for (let fila = 2; fila <= hoja.getLastRow(); fila++) {
      if (!String(hoja.getRange(fila, 1).getValue()).trim()) continue
      const res = sincronizarFila(hoja, fila)
      out.push(hoja.getRange(fila, 3).getValue() + ': ' + resumen(res))
    }
  } finally {
    lock.releaseLock()
  }
  return out
}

function sincronizarFila(hoja, fila) {
  const [inst, corProjectId, nombreCor, url] = hoja.getRange(fila, 1, 1, 4).getValues()[0]
  const m = String(url).match(/\/empresa\/([^/?#]+)\/(?:cliente\/[^/?#]+\/)?proyecto\/([^/?#]+)/)
  let res
  try {
    if (!m) throw new Error('Enlace de Cronogramas inválido')
    const p = fsGet('proyectos/' + m[2])
    if (!p) throw new Error('El proyecto de Cronogramas no existe (revisa el enlace)')
    if (str(p.fields.empresaId) !== m[1]) throw new Error('El proyecto no pertenece a la empresa del enlace')
    res = sincronizarProyecto(String(inst), Number(corProjectId), m[1], m[2])
  } catch (e) {
    res = { error: String(e && e.message || e) }
  }
  hoja.getRange(fila, 5, 1, 2).setValues([[new Date(), resumen(res)]])
  if (m) {
    try {
      fsPatch('proyectos/' + m[2], {
        corSync: { mapValue: { fields: {
          instancia: { stringValue: String(inst) },
          corProjectId: { integerValue: String(Number(corProjectId) || 0) },
          nombre: { stringValue: String(nombreCor || corProjectId) },
          ultimaSync: { timestampValue: new Date().toISOString() },
          tareas: { integerValue: String(res.tareas || 0) },
          error: res.error ? { stringValue: res.error } : { nullValue: null },
        } } },
      }, ['corSync'])
    } catch (e) { /* informativo */ }
  }
  return res
}

const ESTADOS = { nueva: 'pendiente', en_proceso: 'en_progreso', estancada: 'bloqueada', finalizada: 'completada' }
const PRIORIDADES = ['baja', 'media', 'alta', 'critica']

function sincronizarProyecto(inst, corProjectId, empresaId, proyectoId) {
  if (!corProjectId) throw new Error('Falta el ID del proyecto de COR')
  const token = obtenerToken(credenciales(inst))
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone()

  // 1) Tareas y horas del proyecto en COR
  const tareasCor = listarTodo(token, '/tasks', { projects: [corProjectId] })
    .filter(function (t) { return Number(t.project_id) === corProjectId && !t.archived })
  const horas = {}
  listarTodo(token, '/hours', { projects: [corProjectId] }).forEach(function (h) {
    const tid = (h.task && h.task.id) || h.task_id
    if (tid) horas[tid] = (horas[tid] || 0) + (parseFloat(h.duration) || 0)
  })
  const colaboradores = colaboradoresDe(token, tareasCor.map(function (t) { return t.id }))

  // 2) Estado actual en Firestore
  const existentes = listarTareasDelProyecto(proyectoId)
  const hoyIso = new Date().toISOString()
  const writes = []
  let creadas = 0, actualizadas = 0, eliminadas = 0
  const vistos = {}

  // Jerarquía de COR (tareas madre / subtareas):
  // - raíz con subtareas y sin fase propia (p. ej. "SPRINT 01") → es la FASE de sus descendientes
  //   (no se crea como tarea)
  // - tarea madre intermedia ("Kick off") → GRUPO; subtareas → tareas dentro del grupo
  const porIdCor = {}
  tareasCor.forEach(function (t) { porIdCor[t.id] = t })
  const padreCor = {}, tieneHijos = {}
  tareasCor.forEach(function (t) {
    const p = padreDe(t)
    if (p && p !== t.id && porIdCor[p]) { padreCor[t.id] = p; tieneHijos[p] = true }
  })
  const esFaseRaiz = function (cid) { return !padreCor[cid] && !!tieneHijos[cid] && !faseDeTarea(porIdCor[cid]).fase }
  const faseHeredada = function (cid) {
    for (let a = padreCor[cid], n = 0; a && n < 50; a = padreCor[a], n++) {
      const f = faseDeTarea(porIdCor[a]).fase
      if (f) return f
      if (!padreCor[a] && esFaseRaiz(a)) return String(porIdCor[a].title || '').trim()
    }
    return ''
  }
  // Orden: como en COR (cada madre seguida de sus subtareas), hermanas por fecha
  const porFecha = function (a, b) { return String(a.datetime || a.deadline || '').localeCompare(String(b.datetime || b.deadline || '')) || a.id - b.id }
  const ordenadas = []
  const recorrer = function (lista, nivel) {
    lista.sort(porFecha).forEach(function (t) {
      ordenadas.push(t)
      if (nivel < 50) recorrer(tareasCor.filter(function (h) { return padreCor[h.id] === t.id }), nivel + 1)
    })
  }
  recorrer(tareasCor.filter(function (t) { return !padreCor[t.id] }), 0)

  ordenadas
    .forEach(function (t, i) {
      if (esFaseRaiz(t.id)) return // la raíz es la fase: sus hijas llevan su nombre
      const id = 'cor_' + t.id
      const padre = padreCor[t.id]
      const parentId = padre && !esFaseRaiz(padre) ? 'cor_' + padre : ''
      vistos[id] = true
      const actual = existentes[id]
      const estado = ESTADOS[t.status] || 'pendiente'
      const progresoActual = actual && actual.fields.progreso ? Number(actual.fields.progreso.integerValue || actual.fields.progreso.doubleValue || 0) : 0
      const progreso = estado === 'completada' ? 100 : estado === 'pendiente' ? 0
        : (progresoActual > 0 && progresoActual < 100 ? progresoActual : 50)
      const fin = parsearFechaCor(t.deadline, tz, true)
      const ini = parsearFechaCor(primero(t, ['datetime', 'start', 'start_date', 'date_start']), tz, false) || fin
      const cols = colaboradores[t.id] || []
      const nombres = cols.map(function (c) { return [c.first_name, c.last_name].filter(Boolean).join(' ').trim() }).filter(Boolean)
      const estimadas = cols.reduce(function (s, c) { return s + (Number(c.estimated_by_user) || 0) }, 0) ||
        Number(primero(t, ['estimated_time', 'estimated_hours', 'hours_estimated'])) || 0
      const sprint = (t.sprint && (t.sprint.name || t.sprint.title)) || primero(t, ['sprint_name']) || ''
      const fd = faseDeTarea(t)
      const fase = fd.fase || faseHeredada(t.id)

      const fields = {
        titulo: { stringValue: String(fd.titulo || t.title || 'Tarea COR ' + t.id) },
        descripcion: t.description ? { stringValue: limpiarHtml(t.description).slice(0, 5000) } : undefined,
        estado: { stringValue: estado },
        prioridad: { stringValue: PRIORIDADES[Number(t.priority)] || 'media' },
        progreso: { integerValue: String(progreso) },
        tipo: { stringValue: tieneHijos[t.id] ? 'grupo' : 'tarea' },
        parentId: parentId ? { stringValue: parentId } : undefined,
        orden: { integerValue: String(i * 1000) },
        origen: { stringValue: 'cor' },
        corId: { integerValue: String(t.id) },
        asignadoA: nombres[0] ? { stringValue: nombres[0] } : undefined,
        asignadosA: nombres.length ? { arrayValue: { values: nombres.map(function (n) { return { stringValue: n } }) } } : undefined,
        horasTrabajadas: { doubleValue: Math.round((horas[t.id] || 0) * 100) / 100 },
        horasEstimadas: estimadas ? { doubleValue: Math.round(estimadas * 100) / 100 } : undefined,
        sprint: sprint ? { stringValue: String(sprint) } : undefined,
        fase: fase ? { stringValue: String(fase) } : undefined,
        fechaInicio: ini ? { timestampValue: ini } : undefined,
        fechaFin: fin ? { timestampValue: fin } : undefined,
      }
      const campos = Object.keys(fields).filter(function (k) { return !((k === 'fechaInicio' || k === 'fechaFin') && !fields[k]) })
      Object.keys(fields).forEach(function (k) { if (fields[k] === undefined) delete fields[k] })

      if (!actual) {
        fields.proyectoId = { stringValue: proyectoId }
        fields.empresaId = { stringValue: empresaId }
        fields.creadoPor = { stringValue: 'cor' }
        fields.creadoEn = { timestampValue: hoyIso }
        fields.actualizadoEn = { timestampValue: hoyIso }
        fields.dependencias = { arrayValue: { values: [] } }
        if (!fields.fechaInicio) fields.fechaInicio = { timestampValue: hoyIso }
        if (!fields.fechaFin) fields.fechaFin = { timestampValue: hoyIso }
        if (estado === 'bloqueada') fields.bloqueadaDesde = { timestampValue: hoyIso }
        writes.push({ update: { name: docName('tareas/' + id), fields: fields } })
        creadas++
      } else if (cambio(actual.fields, fields, campos)) {
        historial(actual.fields, fields, campos).forEach(function (h) {
          writes.push({ update: { name: docName('historial_cambios/' + nuevoId()), fields: {
            tareaId: { stringValue: id }, proyectoId: { stringValue: proyectoId }, campo: { stringValue: h.campo },
            valorAnterior: { stringValue: h.antes }, valorNuevo: { stringValue: h.despues },
            cambiadoPor: { stringValue: 'cor' }, cambiadoPorNombre: { stringValue: 'COR · ' + inst },
            cambiadoEn: { timestampValue: hoyIso },
          } } })
        })
        const mascara = campos.concat(['actualizadoEn'])
        const antes = str(actual.fields.estado)
        if (estado === 'bloqueada' && antes !== 'bloqueada') { fields.bloqueadaDesde = { timestampValue: hoyIso }; mascara.push('bloqueadaDesde') }
        if (estado !== 'bloqueada' && antes === 'bloqueada') mascara.push('bloqueadaDesde')
        fields.actualizadoEn = { timestampValue: hoyIso }
        writes.push({ update: { name: docName('tareas/' + id), fields: fields }, updateMask: { fieldPaths: mascara }, currentDocument: { exists: true } })
        actualizadas++
      }
    })

  // 3) Tareas que ya no están (o se archivaron) en COR
  Object.keys(existentes).forEach(function (id) {
    if (existentes[id].origen === 'cor' && !vistos[id]) { writes.push({ delete: docName('tareas/' + id) }); eliminadas++ }
  })

  for (let i = 0; i < writes.length; i += 400) fsCommit(writes.slice(i, i + 400))
  const portales = writes.length ? publicarPortales(proyectoId) : 0
  return { tareas: tareasCor.length, creadas: creadas, actualizadas: actualizadas, eliminadas: eliminadas, portales: portales }
}

// Fase de una tarea de COR, en este orden:
// 1) Etiqueta que empiece por "Fase" o "F1", "F2"… (p. ej. "Fase 1 · Kickoff")
// 2) Categoría de la tarea
// 3) Texto entre corchetes al inicio del título: "[Fase 1] Kickoff con cliente" (se quita del título)
// Id de la tarea madre en COR. La documentación pública no lo muestra: se prueban los nombres
// habituales (usa COR → Diagnóstico para ver cuál envía tu instancia).
function padreDe(t) {
  const v = primero(t, ['parent_id', 'task_parent_id', 'parent_task_id', 'father_id', 'parentId', 'id_parent'])
  if (v && /^\d+$/.test(String(v))) return Number(v)
  const o = t.parent || t.parent_task || t.task_parent || t.father
  if (o && typeof o === 'object' && o.id) return Number(o.id)
  if (o && /^\d+$/.test(String(o))) return Number(o)
  return null
}

function nombreDe(x) { return typeof x === 'string' ? x : (x && (x.name || x.label || x.title || x.description)) || '' }

function faseDeTarea(t) {
  const etiquetas = [].concat(t.labels || [], t.tags || []).map(nombreDe).map(function (n) { return String(n).trim() }).filter(Boolean)
  const etiqueta = etiquetas.filter(function (n) { return /^(fase\b|f\s*\d)/i.test(n) })[0]
  if (etiqueta) return { fase: etiqueta }
  const categoria = nombreDe(t.category) || nombreDe(t.categories && t.categories[0])
  if (categoria) return { fase: String(categoria).trim() }
  const m = String(t.title || '').match(/^\s*\[([^\]]+)\]\s*(.*)$/)
  if (m) return { fase: m[1].trim(), titulo: m[2].trim() || m[1].trim() }
  return {}
}

// Colaboradores por tarea, en paralelo; se cachean 6 h para no agotar la cuota de llamadas
function colaboradoresDe(token, ids) {
  const cache = CacheService.getScriptCache()
  const out = {}, faltan = []
  ids.forEach(function (id) {
    const c = cache.get('colab:' + id)
    if (c) out[id] = JSON.parse(c); else faltan.push(id)
  })
  for (let i = 0; i < faltan.length; i += 30) {
    const lote = faltan.slice(i, i + 30)
    const resps = UrlFetchApp.fetchAll(lote.map(function (id) {
      return { url: COR + '/tasks/' + id + '/collaborators', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true }
    }))
    resps.forEach(function (r, j) {
      let lista = []
      if (r.getResponseCode() === 200) {
        const body = JSON.parse(r.getContentText() || '[]')
        lista = Array.isArray(body) ? body : (body.data || [])
      }
      lista = lista.map(function (c) { return { first_name: c.first_name, last_name: c.last_name, estimated_by_user: c.estimated_by_user } })
      out[lote[j]] = lista
      try { cache.put('colab:' + lote[j], JSON.stringify(lista), 21600) } catch (e) { /* tamaño */ }
    })
  }
  return out
}

// ─── COR API ──────────────────────────────────────────────────────────────────

function obtenerToken(cred, sinCache) {
  const cache = CacheService.getScriptCache()
  const clave = 'tok:' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, cred.key)).slice(0, 20)
  if (!sinCache) { const t = cache.get(clave); if (t) return t }
  const r = UrlFetchApp.fetch(COR + '/oauth/token?grant_type=client_credentials', {
    method: 'post', muteHttpExceptions: true,
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(cred.key + ':' + cred.secret) },
  })
  if (r.getResponseCode() !== 200) throw new Error('COR rechazó las credenciales (' + r.getResponseCode() + '): ' + r.getContentText().slice(0, 200))
  const body = JSON.parse(r.getContentText())
  const ttl = Math.max(60, Math.min(21600, (Number(body.expires_in) || 3600) - 120))
  cache.put(clave, body.access_token, ttl)
  return body.access_token
}

function corGet(token, path) {
  const r = UrlFetchApp.fetch(COR + path, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true })
  if (r.getResponseCode() === 429) throw new Error('COR limitó las solicitudes (429); se reintentará en la próxima sincronización')
  if (r.getResponseCode() !== 200) throw new Error('COR ' + r.getResponseCode() + ' en ' + path + ': ' + r.getContentText().slice(0, 200))
  return JSON.parse(r.getContentText())
}

// Pide todas las páginas (perPage 100) de un listado de COR con filtros
function listarTodo(token, path, filtros) {
  const out = []
  for (let page = 1; page <= 50; page++) {
    const qs = '?page=' + page + '&perPage=100' + (filtros && Object.keys(filtros).length ? '&filters=' + encodeURIComponent(JSON.stringify(filtros)) : '')
    const body = corGet(token, path + qs)
    const data = Array.isArray(body) ? body : (body.data || [])
    data.forEach(function (x) { out.push(x) })
    const ultima = Array.isArray(body) ? 1 : Number(body.lastPage || 1)
    if (page >= ultima || !data.length) break
  }
  return out
}

function primero(obj, claves) {
  for (let i = 0; i < claves.length; i++) if (obj && obj[claves[i]] !== undefined && obj[claves[i]] !== null && obj[claves[i]] !== '') return obj[claves[i]]
  return null
}

// "2026-10-05", "2026-10-05 18:00:00" o ISO. Sin zona → hora de la hoja. Fechas sin hora (o 00:00)
// de entrega se toman al final del día.
function parsearFechaCor(v, tz, finDeDia) {
  if (!v) return null
  const s = String(v).trim()
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(s)) { const d = new Date(s); return isNaN(d) ? null : d.toISOString() }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) return null
  const sinHora = !m[4] || (m[4] === '00' && m[5] === '00')
  const hora = sinHora ? (finDeDia ? '23:59:59' : '00:00:00') : m[4] + ':' + m[5] + ':' + (m[6] || '00')
  return Utilities.parseDate(m[1] + '-' + m[2] + '-' + m[3] + ' ' + hora, tz, 'yyyy-MM-dd HH:mm:ss').toISOString()
}

function limpiarHtml(s) {
  return String(s).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim()
}

// ─── Comparación e historial ──────────────────────────────────────────────────

const CAMPOS_HISTORIAL = ['titulo', 'estado', 'progreso', 'fechaInicio', 'fechaFin', 'asignadosA', 'prioridad', 'sprint', 'horasEstimadas']
const ESTADO_LABEL = { pendiente: 'Pendiente', en_progreso: 'En progreso', completada: 'Completada', bloqueada: 'Bloqueada' }

function valorComparable(x) {
  if (!x) return ''
  if (x.timestampValue) return new Date(x.timestampValue).getTime()
  if (x.arrayValue) return JSON.stringify((x.arrayValue.values || []).map(valorComparable))
  if (x.integerValue !== undefined) return Number(x.integerValue)
  if (x.doubleValue !== undefined) return Number(x.doubleValue)
  if (x.stringValue !== undefined) return x.stringValue
  return JSON.stringify(x)
}

function cambio(actual, nuevo, campos) {
  return campos.some(function (k) { return valorComparable(actual[k]) !== valorComparable(nuevo[k]) })
}

function legible(campo, x) {
  if (!x) return ''
  if (x.timestampValue) return Utilities.formatDate(new Date(x.timestampValue), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'dd/MM/yyyy')
  if (x.arrayValue) return (x.arrayValue.values || []).map(function (v) { return v.stringValue || '' }).join(', ')
  if (campo === 'progreso') return String(x.integerValue !== undefined ? x.integerValue : x.doubleValue) + '%'
  if (campo === 'estado') return ESTADO_LABEL[x.stringValue] || x.stringValue
  if (x.doubleValue !== undefined) return String(x.doubleValue)
  return x.stringValue !== undefined ? x.stringValue : String(x.integerValue || '')
}

function historial(actual, nuevo, campos) {
  return CAMPOS_HISTORIAL
    .filter(function (k) { return campos.indexOf(k) >= 0 && valorComparable(actual[k]) !== valorComparable(nuevo[k]) })
    .map(function (k) { return { campo: k, antes: legible(k, actual[k]).slice(0, 500), despues: legible(k, nuevo[k]).slice(0, 500) } })
    .filter(function (h) { return h.antes !== h.despues })
}

// ─── Portal del cliente ───────────────────────────────────────────────────────
// Misma copia filtrada que publica la app (construirDatosPortal en src/lib/firestore.ts)

function publicarPortales(proyectoId) {
  const proyecto = fsGet('proyectos/' + proyectoId)
  if (!proyecto) return 0
  const pf = proyecto.fields || {}
  const activos = runQuery('portales', 'proyectoId', proyectoId)
    .filter(function (x) { return x.document.fields && x.document.fields.activo && x.document.fields.activo.booleanValue === true })
  if (!activos.length) return 0
  const nul = { nullValue: null }
  const copiar = function (v) { return v === undefined ? nul : v }
  const tareas = listarTareasDelProyecto(proyectoId)
  const lista = Object.keys(tareas).map(function (id) {
    const t = tareas[id].fields
    const bloqueada = str(t.estado) === 'bloqueada'
    return { mapValue: { fields: {
      id: { stringValue: id }, titulo: copiar(t.titulo), numero: copiar(t.numero), tipo: t.tipo || { stringValue: 'tarea' },
      parentId: copiar(t.parentId), orden: copiar(t.orden), estado: copiar(t.estado),
      prioridad: t.prioridad || { stringValue: 'media' }, progreso: t.progreso || { integerValue: '0' },
      fase: copiar(t.fase), dependencias: t.dependencias || { arrayValue: { values: [] } },
      fechaInicio: copiar(t.fechaInicio), fechaFin: copiar(t.fechaFin),
      notas: bloqueada ? copiar(t.notas) : nul, bloqueo: bloqueada ? copiar(t.bloqueo) : nul,
      bloqueadaDesde: bloqueada ? copiar(t.bloqueadaDesde || t.actualizadoEn) : nul,
    } } }
  })
  const duenos = Object.keys((pf.miembros && pf.miembros.mapValue && pf.miembros.mapValue.fields) || {})
    .filter(function (uid) { return str(pf.miembros.mapValue.fields[uid]) === 'owner' })
  if (!duenos.length && str(pf.creadoPor)) duenos.push(str(pf.creadoPor))
  const fields = {
    empresaId: copiar(pf.empresaId),
    duenos: { arrayValue: { values: duenos.map(function (u) { return { stringValue: u } }) } },
    publico: { mapValue: { fields: {
      proyecto: { mapValue: { fields: { nombre: copiar(pf.nombre), objetivo: copiar(pf.objetivo), estado: copiar(pf.estado),
        fechaInicio: copiar(pf.fechaInicio), fechaFin: copiar(pf.fechaFin) } } },
      tareas: { arrayValue: { values: lista } },
      actualizadoEn: { timestampValue: new Date().toISOString() },
    } } },
    publicoHash: { stringValue: 'cor-' + Date.now() },
  }
  fsCommit(activos.map(function (x) {
    return { update: { name: x.document.name, fields: fields },
      updateMask: { fieldPaths: ['empresaId', 'duenos', 'publico', 'publicoHash'] }, currentDocument: { exists: true } }
  }))
  return activos.length
}

// ─── Firestore REST (con la cuenta de Google de quien instaló el script) ──────

function headers() { return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }
function docName(path) { return 'projects/' + FIREBASE_PROJECT + '/databases/(default)/documents/' + path }
function str(v) { return v && v.stringValue !== undefined ? v.stringValue : '' }

function fsGet(path) {
  const r = UrlFetchApp.fetch(FS + '/' + path, { headers: headers(), muteHttpExceptions: true })
  if (r.getResponseCode() === 404) return null
  if (r.getResponseCode() !== 200) throw new Error('Firestore ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300))
  return JSON.parse(r.getContentText())
}

function fsPatch(path, fields, mask) {
  const qs = mask.map(function (m) { return 'updateMask.fieldPaths=' + encodeURIComponent(m) }).join('&')
  const r = UrlFetchApp.fetch(FS + '/' + path + '?' + qs + '&currentDocument.exists=true', {
    method: 'patch', contentType: 'application/json', headers: headers(), payload: JSON.stringify({ fields: fields }), muteHttpExceptions: true,
  })
  if (r.getResponseCode() !== 200) throw new Error('Firestore ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300))
}

function fsCommit(writes) {
  if (!writes.length) return
  const r = UrlFetchApp.fetch(FS + ':commit', {
    method: 'post', contentType: 'application/json', headers: headers(), payload: JSON.stringify({ writes: writes }), muteHttpExceptions: true,
  })
  if (r.getResponseCode() !== 200) throw new Error('Firestore ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300))
}

function runQuery(coleccion, campo, valor) {
  const r = UrlFetchApp.fetch(FS + ':runQuery', {
    method: 'post', contentType: 'application/json', headers: headers(), muteHttpExceptions: true,
    payload: JSON.stringify({ structuredQuery: { from: [{ collectionId: coleccion }],
      where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: { stringValue: valor } } } } }),
  })
  if (r.getResponseCode() !== 200) throw new Error('Firestore ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300))
  return JSON.parse(r.getContentText()).filter(function (x) { return x.document })
}

function listarTareasDelProyecto(proyectoId) {
  const out = {}
  runQuery('tareas', 'proyectoId', proyectoId).forEach(function (x) {
    out[x.document.name.split('/').pop()] = { fields: x.document.fields || {}, origen: str(x.document.fields && x.document.fields.origen) }
  })
  return out
}

function nuevoId() {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 20; i++) id += abc.charAt(Math.floor(Math.random() * abc.length))
  return id
}

function resumen(res) {
  if (!res) return ''
  if (res.error) return '⚠️ ' + res.error
  return '✅ ' + res.tareas + ' tareas · ' + res.creadas + ' nuevas · ' + res.actualizadas + ' actualizadas · ' +
    res.eliminadas + ' eliminadas' + (res.portales ? ' · portal actualizado' : '')
}
