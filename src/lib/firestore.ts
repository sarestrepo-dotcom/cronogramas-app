import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  arrayUnion,
  arrayRemove,
  getDoc,
  getDocs,
  query,
  where,
  documentId,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore'
import { db, functions } from './firebase'
import { httpsCallable } from 'firebase/functions'
import type { Empresa, Proyecto, Cliente, Tarea, UsuarioApp, Invitacion, Rol, UsuarioPermitido, EmailConfig, LineaBase, Comentario, CambioHistorial, Plantilla, PlantillaTarea } from '@/types'

function clean(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}

// ─── Usuarios ────────────────────────────────────────────────────────────────

export async function upsertUsuario(uid: string, data: Partial<UsuarioApp>) {
  const ref = doc(db, 'usuarios', uid)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    await updateDoc(ref, { ...data })
  } else {
    await updateDoc(ref, { ...data, empresas: [], creadoEn: serverTimestamp() }).catch(async () => {
      const colRef = collection(db, 'usuarios')
      await addDoc(colRef, { uid, ...data, empresas: [], creadoEn: serverTimestamp() })
    })
  }
}

export async function getUsuario(uid: string): Promise<UsuarioApp | null> {
  const snap = await getDoc(doc(db, 'usuarios', uid))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as unknown as UsuarioApp
}

// ─── Empresas ─────────────────────────────────────────────────────────────────

export async function crearEmpresa(data: Omit<Empresa, 'id' | 'creadoEn'>): Promise<string> {
  const ref = await addDoc(collection(db, 'empresas'), {
    ...data,
    creadoEn: serverTimestamp(),
  })
  return ref.id
}

export async function actualizarEmpresa(id: string, data: Partial<Empresa>) {
  await updateDoc(doc(db, 'empresas', id), clean(data as Record<string, unknown>) as DocumentData)
}

export async function agregarMiembroEmpresa(empresaId: string, uid: string, rol: Rol): Promise<void> {
  await updateDoc(doc(db, 'empresas', empresaId), { [`miembros.${uid}`]: rol })
}

export async function removerMiembroEmpresa(empresaId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'empresas', empresaId), { [`miembros.${uid}`]: deleteField() })
}

export async function eliminarEmpresa(id: string) {
  await deleteDoc(doc(db, 'empresas', id))
}

export function suscribirEmpresasDeUsuario(uid: string, cb: (empresas: Empresa[]) => void) {
  const q = query(
    collection(db, 'empresas'),
    where(`miembros.${uid}`, 'in', ['owner', 'admin', 'miembro', 'viewer'])
  )
  return onSnapshot(q, (snap) => {
    const empresas = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Empresa)
      .sort((a, b) => b.creadoEn?.seconds - a.creadoEn?.seconds)
    cb(empresas)
  })
}

// Fetch only specific empresas by ID (for non-admin users with restricted access)
export function suscribirEmpresasPorIds(ids: string[], cb: (empresas: Empresa[]) => void) {
  if (ids.length === 0) { cb([]); return () => {} }
  const chunks = ids.slice(0, 10) // Firestore 'in' limit
  const q = query(collection(db, 'empresas'), where(documentId(), 'in', chunks))
  return onSnapshot(q, (snap) => {
    const empresas = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Empresa)
      .sort((a, b) => b.creadoEn?.seconds - a.creadoEn?.seconds)
    cb(empresas)
  })
}

// Fetch all empresas — admin-only use
export async function listarTodasLasEmpresas(): Promise<Empresa[]> {
  const snap = await getDocs(collection(db, 'empresas'))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Empresa)
    .sort((a, b) => b.creadoEn?.seconds - a.creadoEn?.seconds)
}

// ─── Clientes ────────────────────────────────────────────────────────────────

export async function crearCliente(data: Omit<Cliente, 'id' | 'creadoEn'>): Promise<string> {
  const ref = await addDoc(collection(db, 'clientes'), clean({ ...data, creadoEn: serverTimestamp() }))
  return ref.id
}

export async function actualizarCliente(id: string, data: Partial<Cliente>) {
  await updateDoc(doc(db, 'clientes', id), clean(data as Record<string, unknown>) as DocumentData)
}

export async function eliminarCliente(id: string) {
  await deleteDoc(doc(db, 'clientes', id))
}

export function suscribirClientes(empresaId: string, cb: (list: Cliente[]) => void, onError?: () => void) {
  return onSnapshot(
    query(collection(db, 'clientes'), where('empresaId', '==', empresaId)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Cliente))),
    () => { cb([]); onError?.() }
  )
}

// ─── Proyectos ────────────────────────────────────────────────────────────────

export async function crearProyecto(data: Omit<Proyecto, 'id' | 'creadoEn'>): Promise<string> {
  const clean = Object.fromEntries(Object.entries({ ...data, creadoEn: serverTimestamp() }).filter(([, v]) => v !== undefined))
  const ref = await addDoc(collection(db, 'proyectos'), clean)
  return ref.id
}

export async function actualizarProyecto(id: string, data: Partial<Proyecto>) {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  await updateDoc(doc(db, 'proyectos', id), clean as DocumentData)
}

export async function eliminarProyecto(id: string) {
  await deleteDoc(doc(db, 'proyectos', id))
}

export function suscribirProyectosPorEmpresa(empresaId: string, _uid: string, cb: (proyectos: Proyecto[]) => void) {
  // Firestore rules enforce empresa membership; no additional in-memory filter needed
  const q = query(collection(db, 'proyectos'), where('empresaId', '==', empresaId))
  return onSnapshot(q, (snap) => {
    const proyectos = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Proyecto)
      .sort((a, b) => b.creadoEn?.seconds - a.creadoEn?.seconds)
    cb(proyectos)
  }, () => cb([]))
}

// Projects shared directly with the user, queried by explicit project IDs stored in their permiso
export function suscribirProyectosCompartidosConUsuario(
  proyectoIds: string[],
  misEmpresaIds: string[],
  cb: (proyectos: Proyecto[]) => void
) {
  if (proyectoIds.length === 0) { cb([]); return () => {} }
  const ids = proyectoIds.slice(0, 10) // Firestore 'in' limit
  const q = query(collection(db, 'proyectos'), where(documentId(), 'in', ids))
  return onSnapshot(
    q,
    (snap) => {
      const proyectos = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Proyecto)
        .filter((p) => !misEmpresaIds.includes(p.empresaId))
        .sort((a, b) => b.creadoEn?.seconds - a.creadoEn?.seconds)
      cb(proyectos)
    },
    () => cb([]) // silencia errores de permiso (e.g. si el proyecto fue eliminado)
  )
}

// Subscribe to a user's permiso document for real-time updates to proyectosCompartidos
export function suscribirPermisoUsuario(email: string, cb: (permiso: UsuarioPermitido | null) => void) {
  return onSnapshot(doc(db, 'usuarios_permitidos', email), (snap) => {
    cb(snap.exists() ? (snap.data() as UsuarioPermitido) : null)
  })
}

export async function agregarMiembroProyecto(proyectoId: string, uid: string, rol: Rol, email: string): Promise<void> {
  await updateDoc(doc(db, 'proyectos', proyectoId), {
    [`miembros.${uid}`]: rol,
  })
  await updateDoc(doc(db, 'usuarios_permitidos', email), {
    proyectosCompartidos: arrayUnion(proyectoId),
  })
}

export async function removerMiembroProyecto(proyectoId: string, uid: string, email: string): Promise<void> {
  await updateDoc(doc(db, 'proyectos', proyectoId), {
    [`miembros.${uid}`]: deleteField(),
  })
  await updateDoc(doc(db, 'usuarios_permitidos', email), {
    proyectosCompartidos: arrayRemove(proyectoId),
  })
}

export async function buscarUsuarioPorEmail(email: string): Promise<UsuarioApp | null> {
  const q = query(collection(db, 'usuarios'), where('email', '==', email))
  const snap = await getDocs(q)
  if (snap.empty) return null
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as unknown as UsuarioApp
}

export function suscribirTodosProyectosDeUsuario(_uid: string, empresaIds: string[], cb: (proyectos: Proyecto[]) => void) {
  if (empresaIds.length === 0) { cb([]); return () => {} }
  const q = query(
    collection(db, 'proyectos'),
    where('empresaId', 'in', empresaIds.slice(0, 10)),
  )
  return onSnapshot(q, (snap) => {
    const proyectos = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Proyecto)
      .sort((a, b) => a.fechaFin?.seconds - b.fechaFin?.seconds)
    cb(proyectos)
  })
}

// ─── Tareas ───────────────────────────────────────────────────────────────────

export async function crearTarea(data: Omit<Tarea, 'id' | 'creadoEn' | 'actualizadoEn'>): Promise<string> {
  const ref = await addDoc(collection(db, 'tareas'), {
    ...clean(data as Record<string, unknown>),
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  })
  return ref.id
}

const PROGRESO_ESTADO: Partial<Record<string, number>> = {
  pendiente: 0,
  en_progreso: 50,
  completada: 100,
}

export async function actualizarTarea(id: string, data: Partial<Tarea>) {
  const update = { ...data }
  if (update.estado !== undefined && update.progreso === undefined) {
    const auto = PROGRESO_ESTADO[update.estado]
    if (auto !== undefined) update.progreso = auto
  }
  await updateDoc(doc(db, 'tareas', id), {
    ...clean(update as Record<string, unknown>) as DocumentData,
    actualizadoEn: serverTimestamp(),
  })
}

export async function eliminarTarea(id: string) {
  await deleteDoc(doc(db, 'tareas', id))
}

// Tareas del usuario: se consultan solo las empresas y proyectos compartidos a los que
// tiene acceso (las reglas no permiten buscar en todas las tareas) y se filtran en memoria
// por responsable (email, displayName o alias).
export function suscribirMisTareas(
  identificadores: string[],
  empresaIds: string[],
  proyectoIdsCompartidos: string[],
  cb: (tareas: Tarea[]) => void
): () => void {
  if (identificadores.length === 0 || (empresaIds.length === 0 && proyectoIdsCompartidos.length === 0)) {
    cb([]); return () => {}
  }

  const idents = new Set(identificadores)
  const esMia = (t: Tarea) =>
    (!!t.asignadoA && idents.has(t.asignadoA)) || (t.asignadosA ?? []).some(a => idents.has(a))

  const buckets = new Map<string, Tarea[]>()
  const flush = () => {
    const merged = new Map<string, Tarea>()
    for (const list of buckets.values()) for (const t of list) merged.set(t.id, t)
    cb(Array.from(merged.values()).filter(esMia))
  }

  const consultas: Array<[string, ReturnType<typeof query>]> = []
  for (let i = 0; i < empresaIds.length; i += 10) {
    const chunk = empresaIds.slice(i, i + 10)
    consultas.push([`e:${chunk.join(',')}`, query(collection(db, 'tareas'), where('empresaId', 'in', chunk))])
  }
  // Un query por proyecto: si se perdió acceso a uno, los demás siguen funcionando
  for (const pid of proyectoIdsCompartidos) {
    consultas.push([`p:${pid}`, query(collection(db, 'tareas'), where('proyectoId', '==', pid))])
  }

  const unsubs = consultas.map(([key, q]) => {
    buckets.set(key, [])
    return onSnapshot(q,
      snap => { buckets.set(key, snap.docs.map(d => ({ id: d.id, ...(d.data() as object) }) as Tarea)); flush() },
      () => { buckets.set(key, []); flush() }
    )
  })

  return () => unsubs.forEach(u => u())
}

export function suscribirTareasPorProyecto(proyectoId: string, cb: (tareas: Tarea[]) => void) {
  const q = query(
    collection(db, 'tareas'),
    where('proyectoId', '==', proyectoId)
  )
  return onSnapshot(q, (snap) => {
    const tareas = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Tarea)
      .sort((a, b) => a.fechaInicio?.seconds - b.fechaInicio?.seconds)
    cb(tareas)
  })
}

export function suscribirTareasProximasAVencer(empresaIds: string[], diasLimite: number, cb: (tareas: Tarea[]) => void) {
  if (empresaIds.length === 0) { cb([]); return () => {} }
  // Single-field query avoids composite index; date range and status filtered in memory
  const q = query(collection(db, 'tareas'), where('empresaId', 'in', empresaIds.slice(0, 10)))
  return onSnapshot(q, (snap) => {
    const ahora = Timestamp.now()
    const limite = Timestamp.fromDate(new Date(Date.now() + diasLimite * 86400000))
    const tareas = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Tarea)
      .filter((t) =>
        (t.estado === 'pendiente' || t.estado === 'en_progreso') &&
        t.fechaFin?.seconds >= ahora.seconds &&
        t.fechaFin?.seconds <= limite.seconds
      )
      .sort((a, b) => a.fechaFin?.seconds - b.fechaFin?.seconds)
    cb(tareas)
  })
}

// ─── Invitaciones ─────────────────────────────────────────────────────────────

export async function crearInvitacion(data: Omit<Invitacion, 'id' | 'creadoEn'>): Promise<string> {
  const ref = await addDoc(collection(db, 'invitaciones'), {
    ...data,
    creadoEn: serverTimestamp(),
  })
  return ref.id
}

export async function aceptarInvitacion(invitacionId: string, uid: string) {
  const invRef = doc(db, 'invitaciones', invitacionId)
  const invSnap = await getDoc(invRef)
  if (!invSnap.exists()) throw new Error('Invitación no encontrada')

  const inv = invSnap.data() as Invitacion
  await updateDoc(doc(db, 'empresas', inv.empresaId), {
    [`miembros.${uid}`]: inv.rol,
  })
  await updateDoc(invRef, { estado: 'aceptada' })
}

export async function getInvitacionesPendientes(email: string): Promise<Invitacion[]> {
  const q = query(
    collection(db, 'invitaciones'),
    where('emailDestino', '==', email),
    where('estado', '==', 'pendiente')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Invitacion)
}

// ─── Permisos ─────────────────────────────────────────────────────────────────

export async function invitarMiembroEmpresa(empresaId: string, email: string, rol: Rol, creadoPor: string, empresaNombre: string) {
  return crearInvitacion({
    empresaId,
    empresaNombre,
    emailDestino: email,
    rol,
    estado: 'pendiente',
    creadoPor,
  })
}

export function puedeEditar(rol: Rol | undefined): boolean {
  return rol === 'owner' || rol === 'admin'
}

export function puedeAdmin(rol: Rol | undefined): boolean {
  return rol === 'owner'
}

// ─── Lista blanca de acceso (usuarios_permitidos) ─────────────────────────────

export async function getPermiso(email: string): Promise<UsuarioPermitido | null> {
  const snap = await getDoc(doc(db, 'usuarios_permitidos', email))
  if (!snap.exists()) return null
  return snap.data() as UsuarioPermitido
}

export async function crearPermiso(data: Omit<UsuarioPermitido, 'creadoEn'>): Promise<void> {
  await setDoc(doc(db, 'usuarios_permitidos', data.email), {
    ...data,
    empresas: data.empresas ?? [],
    creadoEn: serverTimestamp(),
  })
}

export async function actualizarPermiso(email: string, data: Partial<Omit<UsuarioPermitido, 'email' | 'creadoEn'>>): Promise<void> {
  await updateDoc(doc(db, 'usuarios_permitidos', email), data)
}

export async function eliminarPermiso(email: string): Promise<void> {
  await deleteDoc(doc(db, 'usuarios_permitidos', email))
}

// ─── Email config ─────────────────────────────────────────────────────────────

export async function getEmailConfig(uid: string): Promise<EmailConfig | null> {
  const snap = await getDoc(doc(db, 'email_config', uid))
  return snap.exists() ? (snap.data() as EmailConfig) : null
}

export async function guardarEmailConfig(uid: string, config: Omit<EmailConfig, 'uid'>): Promise<void> {
  await setDoc(doc(db, 'email_config', uid), { ...config, uid })
}

export async function previewEmailSemanal(): Promise<Array<{nombre: string; email: string; body: string}>> {
  const fn = httpsCallable(functions, 'previewEmailSemanal')
  const result = await fn({})
  return (result.data as { previews: Array<{nombre: string; email: string; body: string}> }).previews
}

export async function enviarEmailAhora(customBodies?: Array<{nombre: string; email: string; body: string}>): Promise<void> {
  const fn = httpsCallable(functions, 'enviarEmailAhora')
  await fn({ customBodies })
}


export function suscribirPermitidos(cb: (lista: UsuarioPermitido[]) => void): () => void {
  return onSnapshot(collection(db, 'usuarios_permitidos'), (snap) => {
    cb(snap.docs.map((d) => d.data() as UsuarioPermitido))
  })
}

// ─── Líneas Base ──────────────────────────────────────────────────────────────

export async function guardarLineaBase(data: Omit<LineaBase, 'id' | 'creadoEn'>): Promise<string> {
  const cleanedTareas = data.tareas.map((t) =>
    Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined))
  )
  const ref = await addDoc(collection(db, 'lineas_base'), {
    ...data,
    tareas: cleanedTareas,
    creadoEn: serverTimestamp(),
  })
  return ref.id
}

export function suscribirLineasBase(proyectoId: string, cb: (lbs: LineaBase[]) => void): () => void {
  const q = query(collection(db, 'lineas_base'), where('proyectoId', '==', proyectoId))
  return onSnapshot(q, (snap) => {
    const lbs = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as LineaBase)
      .sort((a, b) => (b.creadoEn?.seconds ?? 0) - (a.creadoEn?.seconds ?? 0))
    cb(lbs)
  })
}

export async function eliminarLineaBase(id: string): Promise<void> {
  await deleteDoc(doc(db, 'lineas_base', id))
}

// ─── Comentarios ──────────────────────────────────────────────────────────────

export async function agregarComentario(data: Omit<Comentario, 'id' | 'creadoEn'>): Promise<string> {
  const ref = await addDoc(collection(db, 'comentarios'), {
    ...data,
    creadoEn: serverTimestamp(),
  })
  return ref.id
}

export function suscribirComentarios(tareaId: string, cb: (comentarios: Comentario[]) => void): () => void {
  const q = query(collection(db, 'comentarios'), where('tareaId', '==', tareaId))
  return onSnapshot(q, (snap) => {
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Comentario)
      .sort((a, b) => (a.creadoEn?.seconds ?? 0) - (b.creadoEn?.seconds ?? 0))
    cb(list)
  })
}

export async function eliminarComentario(id: string): Promise<void> {
  await deleteDoc(doc(db, 'comentarios', id))
}

// ─── Historial de cambios ─────────────────────────────────────────────────────

export async function registrarCambio(data: Omit<CambioHistorial, 'id' | 'cambiadoEn'>): Promise<void> {
  await addDoc(collection(db, 'historial_cambios'), {
    ...data,
    cambiadoEn: serverTimestamp(),
  })
}

export function suscribirHistorial(tareaId: string, cb: (cambios: CambioHistorial[]) => void): () => void {
  const q = query(collection(db, 'historial_cambios'), where('tareaId', '==', tareaId))
  return onSnapshot(q, (snap) => {
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as CambioHistorial)
      .sort((a, b) => (b.cambiadoEn?.seconds ?? 0) - (a.cambiadoEn?.seconds ?? 0))
    cb(list)
  })
}

// ─── Plantillas ───────────────────────────────────────────────────────────────

export async function guardarPlantilla(data: Omit<Plantilla, 'id' | 'creadoEn'>): Promise<string> {
  const cleanedTareas = data.tareas.map((t) =>
    Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined))
  )
  const ref = await addDoc(collection(db, 'plantillas'), {
    ...data,
    tareas: cleanedTareas,
    creadoEn: serverTimestamp(),
  })
  return ref.id
}

export function suscribirPlantillas(empresaId: string, cb: (plantillas: Plantilla[]) => void): () => void {
  const q = query(collection(db, 'plantillas'), where('empresaId', '==', empresaId))
  return onSnapshot(q, (snap) => {
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Plantilla)
      .sort((a, b) => (b.creadoEn?.seconds ?? 0) - (a.creadoEn?.seconds ?? 0))
    cb(list)
  })
}

export async function eliminarPlantilla(id: string): Promise<void> {
  await deleteDoc(doc(db, 'plantillas', id))
}

export type { PlantillaTarea }

// ─── Búsqueda global ─────────────────────────────────────────────────────────

// ─── Portal cliente ───────────────────────────────────────────────────────────

export async function crearTokenPortal(proyecto: Proyecto, nombre: string, tareas: Tarea[]): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, '')
  const datos = construirDatosPortal(proyecto, tareas)
  await setDoc(doc(db, 'portales', token), {
    proyectoId: proyecto.id,
    empresaId: proyecto.empresaId,
    nombre,
    creadoEn: serverTimestamp(),
    activo: true,
    duenos: duenosProyecto(proyecto),
    publico: { ...datos, actualizadoEn: serverTimestamp() },
    publicoHash: hashDatosPortal(datos),
  })
  return token
}

export async function revocarPortal(token: string): Promise<void> {
  await updateDoc(doc(db, 'portales', token), { activo: false })
}

export interface PortalResumen { token: string; nombre: string; activo: boolean; creadoEn: Timestamp; publicoHash?: string }

export async function listarPortalesPorProyecto(proyectoId: string): Promise<PortalResumen[]> {
  const snap = await getDocs(query(collection(db, 'portales'), where('proyectoId', '==', proyectoId)))
  return snap.docs.map(d => {
    const { nombre, activo, creadoEn, publicoHash } = d.data()
    return { token: d.id, nombre, activo, creadoEn, publicoHash }
  })
}

// ─── Búsqueda global ─────────────────────────────────────────────────────────

export async function fetchTareasGlobal(empresaIds: string[]): Promise<Tarea[]> {
  if (empresaIds.length === 0) return []
  const chunks: string[][] = []
  for (let i = 0; i < empresaIds.length; i += 10) chunks.push(empresaIds.slice(i, i + 10))
  const results = await Promise.all(
    chunks.map(ids =>
      getDocs(query(collection(db, 'tareas'), where('empresaId', 'in', ids)))
    )
  )
  return results.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() }) as Tarea))
}

export async function fetchProyectosGlobal(empresaIds: string[]): Promise<Proyecto[]> {
  if (empresaIds.length === 0) return []
  const chunks: string[][] = []
  for (let i = 0; i < empresaIds.length; i += 10) chunks.push(empresaIds.slice(i, i + 10))
  const results = await Promise.all(
    chunks.map(ids =>
      getDocs(query(collection(db, 'proyectos'), where('empresaId', 'in', ids)))
    )
  )
  return results.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() }) as Proyecto))
}

// ─── Portal interactivo (aprobaciones, comentarios, solicitudes) ──────────────

export interface Aprobacion {
  hitoId: string
  nombre: string
  aprobadoEn: Timestamp
}

export interface ComentarioPortal {
  id: string
  texto: string
  autor: string
  creadoEn: Timestamp
}

export interface SolicitudCambio {
  id: string
  descripcion: string
  autor: string
  creadoEn: Timestamp
  estado: 'pendiente' | 'revisada' | 'convertida'
}

export async function getAprobaciones(token: string): Promise<Record<string, Aprobacion>> {
  const snap = await getDocs(collection(db, 'portales', token, 'aprobaciones'))
  const map: Record<string, Aprobacion> = {}
  snap.docs.forEach(d => { map[d.id] = d.data() as Aprobacion })
  return map
}

export async function getComentariosPortal(token: string): Promise<ComentarioPortal[]> {
  const snap = await getDocs(query(collection(db, 'portales', token, 'comentarios')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as ComentarioPortal)
    .sort((a, b) => (a.creadoEn?.seconds ?? 0) - (b.creadoEn?.seconds ?? 0))
}

export async function getSolicitudesCambio(token: string): Promise<SolicitudCambio[]> {
  const snap = await getDocs(collection(db, 'portales', token, 'solicitudes'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as SolicitudCambio)
    .sort((a, b) => (b.creadoEn?.seconds ?? 0) - (a.creadoEn?.seconds ?? 0))
}

export async function actualizarEstadoSolicitud(
  token: string,
  solicitudId: string,
  estado: SolicitudCambio['estado']
): Promise<void> {
  await updateDoc(doc(db, 'portales', token, 'solicitudes', solicitudId), { estado })
}

// ─── Portal público (cliente sin cuenta) ─────────────────────────────────────
// El cliente no puede leer proyectos ni tareas. El equipo publica en portales/{token}.publico
// una copia filtrada (sin valor de venta, responsables, descripciones ni notas internas) que
// ProyectoDetailPage mantiene sincronizada. El cliente solo lee ese documento (get, no list)
// y escribe aprobaciones/comentarios/solicitudes en batches validados por firestore.rules.

export interface DatosPortal {
  proyecto: { nombre: string; objetivo: string | null; estado: Proyecto['estado']; fechaInicio: Timestamp | null; fechaFin: Timestamp | null }
  tareas: Tarea[]
}

export interface PortalPublico {
  nombrePortal: string
  proyectoId: string
  empresaId?: string
  duenos: string[]
  datos: DatosPortal | null
}

export function duenosProyecto(p: Proyecto): string[] {
  const owners = Object.entries(p.miembros ?? {}).filter(([, rol]) => rol === 'owner').map(([uid]) => uid)
  return owners.length > 0 ? owners : (p.creadoPor ? [p.creadoPor] : [])
}

export function construirDatosPortal(p: Proyecto, tareas: Tarea[]): DatosPortal {
  return {
    proyecto: {
      nombre: p.nombre,
      objetivo: p.objetivo ?? null,
      estado: p.estado,
      fechaInicio: p.fechaInicio ?? null,
      fechaFin: p.fechaFin ?? null,
    },
    tareas: tareas.map(t => ({
      id: t.id,
      titulo: t.titulo,
      tipo: t.tipo ?? 'tarea',
      parentId: t.parentId ?? null,
      orden: t.orden ?? null,
      estado: t.estado,
      prioridad: t.prioridad ?? 'media',
      progreso: t.progreso ?? 0,
      fase: t.fase ?? null,
      dependencias: t.dependencias ?? [],
      fechaInicio: t.fechaInicio ?? null,
      fechaFin: t.fechaFin ?? null,
      // Las notas solo se publican como motivo de bloqueo
      notas: t.estado === 'bloqueada' ? (t.notas ?? null) : null,
    }) as unknown as Tarea),
  }
}

export function hashDatosPortal(datos: DatosPortal): string {
  const json = JSON.stringify(datos, (_k, v) => (v instanceof Timestamp ? v.toMillis() : v))
  let h = 5381
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) | 0
  return `${json.length}-${(h >>> 0).toString(36)}`
}

// Actualiza la copia pública de los portales activos si cambió. Devuelve el hash publicado.
export async function publicarPortales(proyecto: Proyecto, tareas: Tarea[], portales: PortalResumen[]): Promise<string | null> {
  const activos = portales.filter(p => p.activo)
  if (activos.length === 0) return null
  const datos = construirDatosPortal(proyecto, tareas)
  const hash = hashDatosPortal(datos)
  const pendientes = activos.filter(p => p.publicoHash !== hash)
  if (pendientes.length === 0) return hash
  const batch = writeBatch(db)
  for (const p of pendientes) {
    batch.update(doc(db, 'portales', p.token), {
      empresaId: proyecto.empresaId,
      duenos: duenosProyecto(proyecto),
      publico: { ...datos, actualizadoEn: serverTimestamp() },
      publicoHash: hash,
    })
  }
  await batch.commit()
  return hash
}

const sinNulls = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === null ? undefined : v])) as T

export function suscribirPortalPublico(token: string, cb: (p: PortalPublico | null) => void): () => void {
  return onSnapshot(doc(db, 'portales', token), snap => {
    const d = snap.data()
    if (!snap.exists() || !d || d.activo !== true) { cb(null); return }
    const publico = d.publico as (DatosPortal & { actualizadoEn?: Timestamp }) | undefined
    cb({
      nombrePortal: d.nombre,
      proyectoId: d.proyectoId,
      empresaId: d.empresaId,
      duenos: d.duenos ?? [],
      datos: publico
        ? {
            proyecto: publico.proyecto,
            tareas: (publico.tareas ?? []).map(t => sinNulls(t)),
          }
        : null,
    })
  }, () => cb(null))
}

export function suscribirAprobacionesPortal(token: string, cb: (a: Record<string, Aprobacion>) => void): () => void {
  return onSnapshot(collection(db, 'portales', token, 'aprobaciones'), snap => {
    const map: Record<string, Aprobacion> = {}
    snap.docs.forEach(d => { map[d.id] = d.data() as Aprobacion })
    cb(map)
  }, () => cb({}))
}

export function suscribirComentariosPortal(token: string, cb: (c: ComentarioPortal[]) => void): () => void {
  return onSnapshot(collection(db, 'portales', token, 'comentarios'), snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ComentarioPortal)
      .sort((a, b) => (a.creadoEn?.seconds ?? 0) - (b.creadoEn?.seconds ?? 0)))
  }, () => cb([]))
}

// Toda escritura pública va en un batch que marca ultimaEscrituraPublica en el portal:
// las reglas exigen ese sello y solo permiten uno cada 3 s (anti-spam).
function batchPublico(token: string) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'portales', token), { ultimaEscrituraPublica: serverTimestamp() })
  return batch
}

export async function aprobarHitoPortal(token: string, hitoId: string, nombre: string): Promise<void> {
  const batch = batchPublico(token)
  batch.set(doc(db, 'portales', token, 'aprobaciones', hitoId), { hitoId, nombre, aprobadoEn: serverTimestamp() })
  await batch.commit()
}

export async function comentarPortal(token: string, texto: string, autor: string): Promise<void> {
  const batch = batchPublico(token)
  batch.set(doc(collection(db, 'portales', token, 'comentarios')), { texto, autor, creadoEn: serverTimestamp() })
  await batch.commit()
}

// Crea la solicitud y una notificación (campana) para cada dueño del proyecto
export async function solicitarCambioPortal(token: string, portal: PortalPublico, descripcion: string, autor: string): Promise<void> {
  const batch = batchPublico(token)
  const solRef = doc(collection(db, 'portales', token, 'solicitudes'))
  batch.set(solRef, { descripcion, autor, creadoEn: serverTimestamp(), estado: 'pendiente' })
  const nombreProyecto = portal.datos?.proyecto.nombre ?? 'el proyecto'
  for (const uid of portal.duenos) {
    batch.set(doc(collection(db, 'notificaciones')), {
      uid,
      tipo: 'solicitud_cambio',
      proyectoId: portal.proyectoId,
      empresaId: portal.empresaId ?? '',
      portalToken: token,
      solicitudId: solRef.id,
      titulo: `Solicitud de cambio en ${nombreProyecto}`.slice(0, 200),
      mensaje: `${autor}: ${descripcion}`.slice(0, 300),
      leida: false,
      creadoEn: serverTimestamp(),
    })
  }
  await batch.commit()
}

// ─── Notificaciones in-app (las crea el portal al recibir una solicitud) ──────

export interface NotificacionApp {
  id: string
  uid: string
  tipo: 'solicitud_cambio'
  proyectoId: string
  empresaId: string
  portalToken?: string
  titulo: string
  mensaje: string
  leida: boolean
  creadoEn: Timestamp
}

export function suscribirNotificacionesApp(uid: string, cb: (n: NotificacionApp[]) => void): () => void {
  const q = query(collection(db, 'notificaciones'), where('uid', '==', uid))
  return onSnapshot(q, snap => {
    cb(snap.docs
      .map(d => ({ id: d.id, ...d.data() }) as NotificacionApp)
      .sort((a, b) => (b.creadoEn?.seconds ?? 0) - (a.creadoEn?.seconds ?? 0)))
  }, () => cb([]))
}

export async function marcarNotificacionAppLeida(id: string): Promise<void> {
  await updateDoc(doc(db, 'notificaciones', id), { leida: true })
}
