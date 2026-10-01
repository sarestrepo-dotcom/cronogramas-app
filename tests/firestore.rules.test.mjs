// Pruebas de firestore.rules contra el emulador.
// Ejecutar: npm run test:rules   (requiere Java en el PATH)
import { readFileSync } from 'node:fs'
import { before, after, beforeEach, describe, test } from 'node:test'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import {
  doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, getDocs, documentId,
  writeBatch, serverTimestamp,
} from 'firebase/firestore'

let env

// ─── Escenario ────────────────────────────────────────────────────────────────
// E1: empresa de Ana (owner). E2: empresa de Bob.
// P1 (E1) está compartido directamente con "shared". P2 es de E2.
const USERS = {
  ana:      { uid: 'uAna',     email: 'ana@a.com' },
  bob:      { uid: 'uBob',     email: 'bob@b.com' },
  admin:    { uid: 'uAdmin',   email: 'admin@x.com' },
  shared:   { uid: 'uShared',  email: 'shared@s.com' },
  inactivo: { uid: 'uInact',   email: 'inactivo@x.com' },
  extrano:  { uid: 'uExtrano', email: 'extrano@gmail.com' },
}

function ctx(name, { verificado = true } = {}) {
  const u = USERS[name]
  return env.authenticatedContext(u.uid, { email: u.email, email_verified: verificado }).firestore()
}
const anon = () => env.unauthenticatedContext().firestore()

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cronogramas',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})
after(async () => { await env.cleanup() })

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore()
    const set = (path, data) => setDoc(doc(db, path), data)
    await set('usuarios_permitidos/ana@a.com',      { activo: true,  rol: 'usuario', empresas: ['E1'] })
    await set('usuarios_permitidos/bob@b.com',      { activo: true,  rol: 'usuario', empresas: ['E2'] })
    await set('usuarios_permitidos/admin@x.com',    { activo: true,  rol: 'admin',   empresas: [] })
    await set('usuarios_permitidos/shared@s.com',   { activo: true,  rol: 'usuario', empresas: [], proyectosCompartidos: ['P1'] })
    await set('usuarios_permitidos/inactivo@x.com', { activo: false, rol: 'usuario', empresas: ['E1'] })
    await set('usuarios/uAna', { email: 'ana@a.com', empresas: [] })
    await set('empresas/E1', { nombre: 'E1', miembros: { uAna: 'owner' } })
    await set('empresas/E2', { nombre: 'E2', miembros: { uBob: 'owner' } })
    await set('proyectos/P1', { empresaId: 'E1', nombre: 'P1', valorVenta: 1000, miembros: { uShared: 'miembro' } })
    await set('proyectos/P2', { empresaId: 'E2', nombre: 'P2', valorVenta: 9999, miembros: {} })
    await set('tareas/T1', { proyectoId: 'P1', empresaId: 'E1', titulo: 'T1', asignadoA: 'Ana' })
    await set('tareas/T2', { proyectoId: 'P2', empresaId: 'E2', titulo: 'T2' })
    await set('tareas/H1', { proyectoId: 'P1', empresaId: 'E1', titulo: 'Hito', tipo: 'hito', estado: 'completada' })
    await set('tareas/H2', { proyectoId: 'P1', empresaId: 'E1', titulo: 'Hito pendiente', tipo: 'hito', estado: 'pendiente' })
    await set('tareas/H9', { proyectoId: 'P2', empresaId: 'E2', titulo: 'Hito de E2', tipo: 'hito', estado: 'completada' })
    await set('comentarios/C1', { tareaId: 'T1', proyectoId: 'P1', texto: 'x', autorId: 'uAna' })
    await set('comentarios/C2', { tareaId: 'T2', proyectoId: 'P2', texto: 'y', autorId: 'uBob' })
    await set('historial_cambios/H1', { tareaId: 'T1', proyectoId: 'P1' })
    await set('lineas_base/L1', { proyectoId: 'P1' })
    await set('plantillas/PL1', { empresaId: 'E1' })
    await set('clientes/CL1', { empresaId: 'E1' })
    await set('portales/tok1', { proyectoId: 'P1', empresaId: 'E1', nombre: 'Portal', activo: true, duenos: ['uAna'], publico: { tareas: [] } })
    await set('portales/revocado', { proyectoId: 'P1', empresaId: 'E1', nombre: 'Viejo', activo: false, duenos: ['uAna'] })
    await set('portales/tok1/comentarios/x', { texto: 'hola', autor: 'Cliente' })
    await set('portales/tok1/solicitudes/s1', { descripcion: 'cambio', autor: 'Cliente', estado: 'pendiente' })
    await set('email_config/uAna', { uid: 'uAna', gmailUser: 'ana@gmail.com', gmailAppPassword: 'secreto' })
    await set('notificaciones/N1', { uid: 'uAna', leida: false, titulo: 'Solicitud' })
  })
})

const tareasDe = (db, campo, op, val) => getDocs(query(collection(db, 'tareas'), where(campo, op, val)))

// ─── Ataques ──────────────────────────────────────────────────────────────────

describe('usuario externo (cuenta de Google fuera de la lista blanca)', () => {
  test('no lee tareas, proyectos, usuarios ni la lista blanca', async () => {
    const db = ctx('extrano')
    await assertFails(getDoc(doc(db, 'tareas/T1')))
    await assertFails(tareasDe(db, 'proyectoId', '==', 'P1'))
    await assertFails(getDoc(doc(db, 'proyectos/P1')))
    await assertFails(getDocs(collection(db, 'usuarios')))
    await assertFails(getDocs(collection(db, 'usuarios_permitidos')))
    await assertFails(getDocs(query(collection(db, 'comentarios'), where('tareaId', '==', 'T1'))))
  })
  test('no puede auto-agregarse a la lista blanca ni volverse admin', async () => {
    const db = ctx('extrano')
    await assertFails(setDoc(doc(db, 'usuarios_permitidos/extrano@gmail.com'), { activo: true, rol: 'admin', empresas: ['E1', 'E2'] }))
  })
  test('puede consultar su propio permiso (lo necesita el login)', async () => {
    await assertSucceeds(getDoc(doc(ctx('extrano'), 'usuarios_permitidos/extrano@gmail.com')))
  })
  test('no puede crear su perfil de usuario', async () => {
    await assertFails(setDoc(doc(ctx('extrano'), 'usuarios/uExtrano'), { email: 'extrano@gmail.com' }))
  })
})

describe('email sin verificar e usuario inactivo', () => {
  test('email/password sin verificar con el correo de Ana no accede', async () => {
    const db = ctx('ana', { verificado: false })
    await assertFails(getDoc(doc(db, 'tareas/T1')))
    await assertFails(tareasDe(db, 'proyectoId', '==', 'P1'))
  })
  test('usuario desactivado no accede', async () => {
    const db = ctx('inactivo')
    await assertFails(getDoc(doc(db, 'tareas/T1')))
    await assertFails(getDoc(doc(db, 'proyectos/P1')))
  })
})

describe('aislamiento entre empresas', () => {
  test('Ana no ve tareas, proyectos ni comentarios de E2', async () => {
    const db = ctx('ana')
    await assertFails(getDoc(doc(db, 'tareas/T2')))
    await assertFails(tareasDe(db, 'proyectoId', '==', 'P2'))
    await assertFails(tareasDe(db, 'empresaId', 'in', ['E1', 'E2']))
    await assertFails(getDoc(doc(db, 'proyectos/P2')))
    await assertFails(getDocs(query(collection(db, 'proyectos'), where('empresaId', '==', 'E2'))))
    await assertFails(getDocs(query(collection(db, 'comentarios'), where('tareaId', '==', 'T2'))))
    await assertFails(getDocs(query(collection(db, 'plantillas'), where('empresaId', '==', 'E2'))))
    await assertFails(getDocs(query(collection(db, 'clientes'), where('empresaId', '==', 'E2'))))
    await assertFails(getDoc(doc(db, 'empresas/E2')))
  })
  test('Ana no puede darse acceso a E2 editando su permiso', async () => {
    await assertFails(updateDoc(doc(ctx('ana'), 'usuarios_permitidos/ana@a.com'), { empresas: ['E1', 'E2'] }))
    await assertFails(updateDoc(doc(ctx('ana'), 'usuarios_permitidos/ana@a.com'), { rol: 'admin' }))
  })
  test('Ana no puede crear ni mover tareas hacia proyectos de E2', async () => {
    const db = ctx('ana')
    await assertFails(addDoc(collection(db, 'tareas'), { proyectoId: 'P2', empresaId: 'E2', titulo: 'x' }))
    await assertFails(addDoc(collection(db, 'tareas'), { proyectoId: 'P1', empresaId: 'E2', titulo: 'x' }))
    await assertFails(updateDoc(doc(db, 'tareas/T1'), { proyectoId: 'P2' }))
  })
  test('Bob no ve los portales ni las solicitudes de P1', async () => {
    const db = ctx('bob')
    await assertFails(getDocs(query(collection(db, 'portales'), where('proyectoId', '==', 'P1'))))
    await assertFails(getDocs(collection(db, 'portales/tok1/solicitudes')))
  })
})

describe('datos personales', () => {
  test('nadie más lee el App Password de Gmail de Ana', async () => {
    await assertFails(getDoc(doc(ctx('bob'), 'email_config/uAna')))
    await assertFails(getDoc(doc(ctx('admin'), 'email_config/uAna')))
  })
  test('Bob no puede suplantar el uid de otro en su email_config', async () => {
    await assertFails(setDoc(doc(ctx('bob'), 'email_config/uBob'), { uid: 'uAdmin', gmailUser: 'b' }))
    await assertSucceeds(setDoc(doc(ctx('bob'), 'email_config/uBob'), { uid: 'uBob', gmailUser: 'b' }))
  })
  test('notificaciones: solo las propias, y solo se puede marcar leída', async () => {
    await assertFails(getDoc(doc(ctx('bob'), 'notificaciones/N1')))
    await assertSucceeds(getDoc(doc(ctx('ana'), 'notificaciones/N1')))
    await assertFails(updateDoc(doc(ctx('ana'), 'notificaciones/N1'), { uid: 'uBob' }))
    await assertSucceeds(updateDoc(doc(ctx('ana'), 'notificaciones/N1'), { leida: true }))
    await assertFails(addDoc(collection(ctx('ana'), 'notificaciones'), { uid: 'uBob', titulo: 'falsa' }))
  })
})

describe('portal público sin sesión', () => {
  const publico = (token, escribir) => {
    const db = anon()
    const b = writeBatch(db)
    b.update(doc(db, 'portales', token), { ultimaEscrituraPublica: serverTimestamp() })
    escribir(b, db)
    return b.commit()
  }
  const comentar = (token, data = { texto: 'Hola', autor: 'Cliente', creadoEn: serverTimestamp() }) =>
    publico(token, (b, db) => b.set(doc(collection(db, 'portales', token, 'comentarios')), data))
  const enfriar = () => env.withSecurityRulesDisabled(c =>
    updateDoc(doc(c.firestore(), 'portales/tok1'), { ultimaEscrituraPublica: new Date(Date.now() - 10000) }))

  test('lee su portal activo, pero no puede listar tokens ni abrir uno revocado', async () => {
    const db = anon()
    await assertSucceeds(getDoc(doc(db, 'portales/tok1')))
    await assertSucceeds(getDocs(collection(db, 'portales/tok1/comentarios')))
    await assertFails(getDocs(collection(db, 'portales')))
    await assertFails(getDoc(doc(db, 'portales/revocado')))
    await assertFails(getDocs(collection(db, 'portales/revocado/comentarios')))
    await assertFails(getDocs(collection(db, 'portales/tok1/solicitudes')))
  })
  test('no puede leer proyectos, tareas ni otras colecciones', async () => {
    await assertFails(getDoc(doc(anon(), 'proyectos/P1')))
    await assertFails(getDoc(doc(anon(), 'tareas/T1')))
    await assertFails(tareasDe(anon(), 'proyectoId', '==', 'P1'))
  })
  test('no puede modificar el portal (activarlo, cambiar datos publicados) ni crear portales', async () => {
    await assertFails(updateDoc(doc(anon(), 'portales/tok1'), { publico: { tareas: ['falso'] } }))
    await assertFails(updateDoc(doc(anon(), 'portales/revocado'), { activo: true }))
    await assertFails(setDoc(doc(anon(), 'portales/nuevo'), { proyectoId: 'P1', activo: true }))
  })
  test('comenta con sello anti-spam; sin sello, con campos extra o muy largo se rechaza', async () => {
    await assertSucceeds(comentar('tok1'))
    await enfriar()
    await assertFails(addDoc(collection(anon(), 'portales/tok1/comentarios'), { texto: 'x', autor: 'y', creadoEn: serverTimestamp() }))
    await assertFails(comentar('tok1', { texto: 'x'.repeat(2001), autor: 'y', creadoEn: serverTimestamp() }))
    await assertFails(comentar('tok1', { texto: 'x', autor: 'y', creadoEn: serverTimestamp(), admin: true }))
    await assertFails(comentar('revocado'))
  })
  test('anti-spam: segunda escritura en menos de 3 s se rechaza', async () => {
    await assertSucceeds(comentar('tok1'))
    await assertFails(comentar('tok1'))
  })
  test('aprueba solo hitos completados del propio proyecto', async () => {
    const aprobar = (hitoId) => publico('tok1', (b, db) =>
      b.set(doc(db, 'portales/tok1/aprobaciones', hitoId), { hitoId, nombre: 'Cliente', aprobadoEn: serverTimestamp() }))
    await assertFails(aprobar('H9'))
    await enfriar(); await assertFails(aprobar('H2'))
    await enfriar(); await assertFails(aprobar('T1'))
    await enfriar(); await assertSucceeds(aprobar('H1'))
    await enfriar(); await assertFails(aprobar('H1')) // no se puede re-escribir
  })
  test('solicitud de cambio + notificación al dueño en el mismo batch', async () => {
    const solicitar = (uid, { conSolicitud = true } = {}) => publico('tok1', (b, db) => {
      const sol = doc(collection(db, 'portales/tok1/solicitudes'))
      if (conSolicitud) b.set(sol, { descripcion: 'Agregar pruebas', autor: 'Cliente', creadoEn: serverTimestamp(), estado: 'pendiente' })
      b.set(doc(collection(db, 'notificaciones')), {
        uid, tipo: 'solicitud_cambio', proyectoId: 'P1', empresaId: 'E1', portalToken: 'tok1', solicitudId: sol.id,
        titulo: 'Solicitud de cambio en P1', mensaje: 'Cliente: Agregar pruebas', leida: false, creadoEn: serverTimestamp(),
      })
    })
    await assertFails(solicitar('uBob'))                              // no es dueño
    await enfriar(); await assertFails(solicitar('uAna', { conSolicitud: false })) // notificación falsa
    await enfriar(); await assertSucceeds(solicitar('uAna'))
    await enfriar()
    await assertFails(publico('tok1', (b, db) => b.set(doc(collection(db, 'portales/tok1/solicitudes')),
      { descripcion: 'x', autor: 'y', creadoEn: serverTimestamp(), estado: 'convertida' })))
  })
})

// ─── Uso legítimo de la app (las queries reales deben seguir funcionando) ─────

describe('uso normal del equipo', () => {
  test('Ana: queries de su proyecto, empresa, comentarios, historial, líneas base y plantillas', async () => {
    const db = ctx('ana')
    await assertSucceeds(tareasDe(db, 'proyectoId', '==', 'P1'))
    await assertSucceeds(tareasDe(db, 'empresaId', 'in', ['E1']))
    await assertSucceeds(getDoc(doc(db, 'tareas/T1')))
    await assertSucceeds(getDocs(query(collection(db, 'proyectos'), where('empresaId', '==', 'E1'))))
    await assertSucceeds(getDocs(query(collection(db, 'proyectos'), where('empresaId', 'in', ['E1']))))
    await assertSucceeds(getDocs(query(collection(db, 'comentarios'), where('tareaId', '==', 'T1'))))
    await assertSucceeds(getDocs(query(collection(db, 'historial_cambios'), where('tareaId', '==', 'T1'))))
    await assertSucceeds(getDocs(query(collection(db, 'lineas_base'), where('proyectoId', '==', 'P1'))))
    await assertSucceeds(getDocs(query(collection(db, 'plantillas'), where('empresaId', '==', 'E1'))))
    await assertSucceeds(getDocs(query(collection(db, 'clientes'), where('empresaId', '==', 'E1'))))
    await assertSucceeds(getDoc(doc(db, 'empresas/E1')))
    await assertSucceeds(getDocs(collection(db, 'usuarios_permitidos')))
    await assertSucceeds(getDocs(query(collection(db, 'usuarios'), where('email', '==', 'ana@a.com'))))
  })
  test('Ana: crea y edita tareas, comenta y registra historial', async () => {
    const db = ctx('ana')
    await assertSucceeds(addDoc(collection(db, 'tareas'), { proyectoId: 'P1', empresaId: 'E1', titulo: 'nueva' }))
    await assertSucceeds(updateDoc(doc(db, 'tareas/T1'), { estado: 'bloqueada', notas: 'Esperando insumos' }))
    await assertSucceeds(addDoc(collection(db, 'comentarios'), { tareaId: 'T1', proyectoId: 'P1', texto: 'ok', autorId: 'uAna' }))
    await assertFails(addDoc(collection(db, 'comentarios'), { tareaId: 'T1', proyectoId: 'P1', texto: 'ok', autorId: 'uBob' }))
    await assertSucceeds(addDoc(collection(db, 'historial_cambios'), { tareaId: 'T1', proyectoId: 'P1', campo: 'estado' }))
    await assertSucceeds(setDoc(doc(db, 'empresas/E3'), { nombre: 'E3', miembros: { uAna: 'owner' } }))
    await assertFails(setDoc(doc(db, 'empresas/E4'), { nombre: 'E4', miembros: { uBob: 'owner' } }))
  })
  test('Ana: gestiona portales y la actividad del cliente', async () => {
    const db = ctx('ana')
    await assertSucceeds(getDocs(query(collection(db, 'portales'), where('proyectoId', '==', 'P1'))))
    await assertSucceeds(setDoc(doc(db, 'portales/tok2'), { proyectoId: 'P1', nombre: 'Otro', activo: true }))
    await assertSucceeds(updateDoc(doc(db, 'portales/tok1'), { publico: { tareas: [] }, publicoHash: 'h' }))
    await assertSucceeds(updateDoc(doc(db, 'portales/tok1'), { activo: false }))
    await assertSucceeds(getDocs(collection(db, 'portales/tok1/solicitudes')))
    await assertSucceeds(updateDoc(doc(db, 'portales/tok1/solicitudes/s1'), { estado: 'convertida' }))
    await assertSucceeds(getDocs(collection(db, 'portales/tok1/comentarios')))
    await assertFails(setDoc(doc(db, 'portales/tok3'), { proyectoId: 'P2', nombre: 'x', activo: true }))
  })
  test('Ana comparte P1: puede actualizar solo proyectosCompartidos de otro usuario', async () => {
    const db = ctx('ana')
    await assertSucceeds(updateDoc(doc(db, 'usuarios_permitidos/bob@b.com'), { proyectosCompartidos: ['P1'] }))
    await assertFails(updateDoc(doc(db, 'usuarios_permitidos/bob@b.com'), { empresas: ['E1', 'E2'] }))
  })
  test('usuario con proyecto compartido: ve ese proyecto y sus tareas, nada más', async () => {
    const db = ctx('shared')
    await assertSucceeds(getDoc(doc(db, 'proyectos/P1')))
    await assertSucceeds(getDocs(query(collection(db, 'proyectos'), where(documentId(), 'in', ['P1']))))
    await assertSucceeds(tareasDe(db, 'proyectoId', '==', 'P1'))
    await assertSucceeds(updateDoc(doc(db, 'tareas/T1'), { progreso: 50 }))
    await assertSucceeds(getDocs(query(collection(db, 'comentarios'), where('tareaId', '==', 'T1'))))
    await assertFails(tareasDe(db, 'empresaId', 'in', ['E1']))
    await assertFails(getDocs(query(collection(db, 'proyectos'), where('empresaId', '==', 'E1'))))
    await assertFails(getDoc(doc(db, 'proyectos/P2')))
  })
  test('admin global gestiona la lista blanca', async () => {
    const db = ctx('admin')
    await assertSucceeds(setDoc(doc(db, 'usuarios_permitidos/nuevo@x.com'), { activo: true, rol: 'usuario', empresas: ['E1'] }))
    await assertSucceeds(updateDoc(doc(db, 'usuarios_permitidos/ana@a.com'), { empresas: ['E1', 'E2'] }))
    await assertSucceeds(updateDoc(doc(db, 'usuarios/uAna'), { aliases: ['Anita'] }))
  })
})
