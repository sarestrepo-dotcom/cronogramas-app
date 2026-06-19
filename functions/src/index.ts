import * as functionsV1 from 'firebase-functions/v1'
import * as functions from 'firebase-functions/v2'
import * as admin from 'firebase-admin'
import * as nodemailer from 'nodemailer'
import { Timestamp } from 'firebase-admin/firestore'
import * as https from 'https'

admin.initializeApp()
const db = admin.firestore()

// ─── Types (mirrored from frontend) ──────────────────────────────────────────

interface Tarea {
  id: string
  titulo: string
  estado: string
  fechaInicio: Timestamp
  fechaFin: Timestamp
  asignadoA?: string
  asignadosA?: string[]
  fase?: string
  parentId?: string
  tipo?: string
  progreso?: number
  proyectoId: string
  empresaId: string
}

interface EmailConfig {
  gmailUser: string
  gmailAppPassword: string
  groqApiKey?: string
  habilitado: boolean
  responsables: { nombre: string; email: string }[]
  proyectosIds: string[]
  uid: string
}

// ─── Email generation ─────────────────────────────────────────────────────────

function formatDate(ts: Timestamp): string {
  const d = ts.toDate()
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function endOfWeek(d: Date): Date {
  const start = startOfWeek(d)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

function generarEmailParaResponsable(
  nombre: string,
  tareas: Tarea[],
  allTareas: Tarea[],
  hoy: Date
): string {
  const wStart = startOfWeek(hoy)
  const wEnd   = endOfWeek(hoy)
  const nStart = startOfWeek(new Date(hoy.getTime() + 7 * 86400000))
  const nEnd   = endOfWeek(new Date(hoy.getTime() + 7 * 86400000))

  const grupoMap = new Map(
    allTareas.filter(t => t.tipo === 'grupo').map(t => [t.id, t.titulo])
  )

  const misActivas = tareas.filter(t => {
    const s = t.fechaInicio.toDate()
    const e = t.fechaFin.toDate()
    return s <= wEnd && e >= wStart
  })

  const misProximas = tareas.filter(t => {
    const s = t.fechaInicio.toDate()
    return s >= nStart && s <= nEnd
  })

  // Group active tasks by fase/grupo
  const byGrupo = new Map<string, Tarea[]>()
  for (const t of misActivas) {
    const key = t.fase ?? t.parentId ?? '__sin__'
    if (!byGrupo.has(key)) byGrupo.set(key, [])
    byGrupo.get(key)!.push(t)
  }

  const primerNombre = nombre.split(' ')[0]
  const rangoStr = `${wStart.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })} – ${wEnd.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })}`

  let body = `${primerNombre}! 👋 Resumen semanal — ${rangoStr}\n\n`

  if (byGrupo.size === 0) {
    body += 'Sin tareas activas esta semana.\n\n'
  } else {
    for (const [key, tasks] of byGrupo) {
      const grupoLabel = key === '__sin__'
        ? null
        : grupoMap.get(key) ?? tasks[0]?.fase ?? key
      if (grupoLabel) body += `${grupoLabel}\n`

      const completadas = tasks.filter(t => t.estado === 'completada')
      const enProceso   = tasks.filter(t => t.estado === 'en_progreso')
      const pendientes  = tasks.filter(t => t.estado === 'pendiente' || t.estado === 'bloqueada')

      if (completadas.length > 0) {
        body += `✅ Completadas:\n`
        completadas.forEach(t => { body += `  • ${t.titulo}\n` })
      }
      if (enProceso.length > 0) {
        body += `🔄 En proceso:\n`
        enProceso.forEach(t => { body += `  • ${t.titulo} · deadline ${formatDate(t.fechaFin)}\n` })
      }
      if (pendientes.length > 0) {
        body += `⏳ Pendientes:\n`
        pendientes.forEach(t => {
          const bloqueo = t.estado === 'bloqueada' ? ' ⛔' : ''
          body += `  • ${t.titulo} · ${formatDate(t.fechaInicio)}–${formatDate(t.fechaFin)}${bloqueo}\n`
        })
      }
      body += '\n'
    }
  }

  if (misProximas.length > 0) {
    const rn = `${nStart.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })} – ${nEnd.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })}`
    body += `▶️ Próxima semana (${rn}):\n`
    misProximas.forEach(t => { body += `  • ${t.titulo}\n` })
    body += '\n'
  }

  body += `¿Alguna novedad o algo que necesites? Porfa deja los links en la columna del cronograma 🙏`

  return body
}

// ─── Send emails helper ───────────────────────────────────────────────────────

async function procesarConfig(config: EmailConfig, hoy: Date) {
  if (!config.habilitado) return
  if (!config.gmailUser || !config.gmailAppPassword) return
  if (!config.responsables || config.responsables.length === 0) return

  // Fetch tasks for the configured projects
  let tareas: Tarea[] = []
  if (config.proyectosIds && config.proyectosIds.length > 0) {
    const chunks = config.proyectosIds.slice(0, 10)
    const snap = await db.collection('tareas')
      .where('proyectoId', 'in', chunks)
      .get()
    tareas = snap.docs.map(d => ({ id: d.id, ...d.data() } as Tarea))
  }

  if (tareas.length === 0) return

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: config.gmailUser, pass: config.gmailAppPassword },
  })

  for (const { nombre, email } of config.responsables) {
    const misTareas = tareas.filter(t => esTareaDeResponsable(t, nombre))
    if (misTareas.length === 0) continue

    const bodyText = generarEmailParaResponsable(nombre, misTareas, tareas, hoy)
    await enviarEmail(transporter, config.gmailUser, email, nombre, bodyText)
    functions.logger.info(`Email enviado a ${email} (${nombre})`)
  }
}

function normStr(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function matchResp(taskResp: string, listName: string): boolean {
  const t = normStr(taskResp)
  const l = normStr(listName)
  if (!t || !l) return false
  if (t === l) return true
  if (t.includes(l) || l.includes(t)) return true
  const lWords = l.split(/\s+/)
  if (lWords.length === 1 && t.split(/\s+/)[0] === lWords[0]) return true
  return false
}

function esTareaDeResponsable(t: Tarea, nombre: string): boolean {
  const todos = [t.asignadoA, ...(t.asignadosA ?? [])].filter(Boolean) as string[]
  return todos.some(a => matchResp(a, nombre))
}

async function enviarEmail(
  transporter: ReturnType<typeof nodemailer.createTransport>,
  from: string, to: string, nombre: string, bodyText: string
) {
  await transporter.sendMail({
    from: `"Cronogramas" <${from}>`,
    to,
    subject: `📋 Resumen semanal — ${nombre}`,
    text: bodyText,
    html: `<pre style="font-family: sans-serif; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${bodyText}</pre>`,
  })
}

async function generarPreviews(config: EmailConfig, hoy: Date): Promise<Array<{nombre: string; email: string; body: string}>> {
  let tareas: Tarea[] = []
  if (config.proyectosIds && config.proyectosIds.length > 0) {
    const chunks = config.proyectosIds.slice(0, 10)
    const snap = await db.collection('tareas').where('proyectoId', 'in', chunks).get()
    tareas = snap.docs.map(d => ({ id: d.id, ...d.data() } as Tarea))
  }

  const result: Array<{nombre: string; email: string; body: string}> = []
  for (const { nombre, email } of config.responsables) {
    const misTareas = tareas.filter(t => esTareaDeResponsable(t, nombre))
    if (misTareas.length === 0) continue
    const body = generarEmailParaResponsable(nombre, misTareas, tareas, hoy)
    result.push({ nombre, email, body })
  }
  return result
}

// ─── Groq API helper (free, OpenAI-compatible) ───────────────────────────────

function llamarGroq(apiKey: string, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.1,
    })
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) { reject(new Error(json.error.message ?? 'Groq API error')); return }
          resolve(json.choices?.[0]?.message?.content ?? '')
        } catch { reject(new Error('Invalid Groq response')) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ─── Callable: parse email reply with Claude ──────────────────────────────────

interface CambioPropuesto {
  tareaId: string
  titulo: string
  campo: 'estado' | 'progreso' | 'notas'
  valorNuevo: string | number
}

export const parsearEmailRespuesta = functionsV1
  .region('us-central1')
  .https
  .onCall(async (data: { emailText: string; proyectoId: string }, context: functionsV1.https.CallableContext) => {
    if (!context.auth) throw new functionsV1.https.HttpsError('unauthenticated', 'Requiere autenticación')

    const { emailText, proyectoId } = data
    if (!emailText?.trim() || !proyectoId) {
      throw new functionsV1.https.HttpsError('invalid-argument', 'emailText y proyectoId son requeridos')
    }

    // Get the admin's email config (API key)
    const uid = context.auth.uid
    const configSnap = await db.collection('email_config').doc(uid).get()
    if (!configSnap.exists) throw new functionsV1.https.HttpsError('not-found', 'Sin configuración de email')

    const config = configSnap.data() as EmailConfig
    if (!config.groqApiKey) throw new functionsV1.https.HttpsError('failed-precondition', 'Falta la clave API de Groq en la configuración')

    // Get active tasks for the project
    const tareasSnap = await db.collection('tareas').where('proyectoId', '==', proyectoId).get()
    const tareas = tareasSnap.docs.map(d => {
      const t = d.data() as Tarea
      return { id: d.id, titulo: t.titulo, estado: t.estado, progreso: t.progreso ?? 0, tipo: t.tipo ?? 'tarea' }
    }).filter(t => t.tipo !== 'grupo')

    const tareasJson = JSON.stringify(tareas, null, 2)

    const prompt = `Eres un asistente que extrae actualizaciones de tareas de un email de respuesta de equipo.

Lista de tareas activas del proyecto:
${tareasJson}

Email recibido del equipo:
---
${emailText}
---

Analiza el email e identifica qué tareas fueron mencionadas y qué cambios se reportan.
Para cada tarea mencionada, determina el campo a actualizar y el nuevo valor.

Reglas:
- Coincide el nombre mencionado en el email con la tarea más cercana de la lista (búsqueda flexible)
- Estados válidos: pendiente | en_progreso | completada | bloqueada
- Progreso: número entero del 0 al 100
- Si mencionan "terminé", "completé", "listo", "100%" → estado: completada, progreso: 100
- Si mencionan porcentaje como "80%", "ya voy al 60" → campo: progreso
- Si mencionan un bloqueo, espera, o problema → estado: bloqueada
- Si es una nota/comentario genérico → campo: notas
- Solo incluye cambios que estén explícitamente mencionados

Responde ÚNICAMENTE con JSON válido, sin texto antes ni después:
{
  "cambios": [
    {"tareaId": "id_de_la_tarea", "titulo": "título de la tarea", "campo": "estado", "valorNuevo": "completada"},
    {"tareaId": "id_de_la_tarea", "titulo": "título de la tarea", "campo": "progreso", "valorNuevo": 80},
    {"tareaId": "id_de_la_tarea", "titulo": "título de la tarea", "campo": "notas", "valorNuevo": "texto de la nota"}
  ]
}`

    const respuesta = await llamarGroq(config.groqApiKey!, prompt)

    // Parse Claude's JSON response
    const jsonMatch = respuesta.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new functionsV1.https.HttpsError('internal', 'Claude no devolvió JSON válido')

    const parsed = JSON.parse(jsonMatch[0]) as { cambios: CambioPropuesto[] }

    // Enrich with current values from tareas
    const cambiosEnriquecidos = parsed.cambios
      .filter(c => tareas.find(t => t.id === c.tareaId))
      .map(c => {
        const tarea = tareas.find(t => t.id === c.tareaId)!
        const valorActual = c.campo === 'estado' ? tarea.estado
          : c.campo === 'progreso' ? tarea.progreso
          : ''
        return { ...c, valorActual, aplicar: true }
      })

    return { cambios: cambiosEnriquecidos }
  })

// ─── Scheduled trigger: every Monday at 8am Colombia time ────────────────────

export const emailSemanalAuto = functions.scheduler.onSchedule(
  { schedule: '0 13 * * 1', timeZone: 'America/Bogota', region: 'us-central1' },
  async () => {
    const hoy = new Date()
    const snap = await db.collection('email_config').where('habilitado', '==', true).get()
    const promises = snap.docs.map(d => procesarConfig(d.data() as EmailConfig, hoy))
    await Promise.all(promises)
    functions.logger.log(`Email semanal procesado: ${snap.size} configuraciones activas`)
  }
)

// ─── Callable: preview email content without sending ─────────────────────────

export const previewEmailSemanal = functionsV1
  .region('us-central1')
  .https
  .onCall(async (_data: unknown, context: functionsV1.https.CallableContext) => {
    if (!context.auth) throw new functionsV1.https.HttpsError('unauthenticated', 'Requiere autenticación')
    const configSnap = await db.collection('email_config').doc(context.auth.uid).get()
    if (!configSnap.exists) throw new functionsV1.https.HttpsError('not-found', 'Sin configuración de email')
    const config = configSnap.data() as EmailConfig
    const previews = await generarPreviews(config, new Date())
    return { previews }
  })

// ─── Callable: manual trigger from the app (test / enviar ahora) ─────────────

interface CustomBody { nombre: string; email: string; body: string }

export const enviarEmailAhora = functionsV1
  .region('us-central1')
  .https
  .onCall(async (data: { customBodies?: CustomBody[] }, context: functionsV1.https.CallableContext) => {
    if (!context.auth) {
      throw new functionsV1.https.HttpsError('unauthenticated', 'Requiere autenticación')
    }
    const uid = context.auth.uid
    const configSnap = await db.collection('email_config').doc(uid).get()
    if (!configSnap.exists) {
      throw new functionsV1.https.HttpsError('not-found', 'Sin configuración de email')
    }
    const config = configSnap.data() as EmailConfig
    if (!config.gmailUser || !config.gmailAppPassword) {
      throw new functionsV1.https.HttpsError('failed-precondition', 'Faltan credenciales de email')
    }

    if (data?.customBodies?.length) {
      // Send pre-generated (possibly edited) bodies
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: config.gmailUser, pass: config.gmailAppPassword },
      })
      for (const { nombre, email, body } of data.customBodies) {
        await enviarEmail(transporter, config.gmailUser, email, nombre, body)
        functions.logger.info(`Email (custom) enviado a ${email} (${nombre})`)
      }
    } else {
      await procesarConfig(config, new Date())
    }
    return { ok: true, message: 'Emails enviados correctamente' }
  })

