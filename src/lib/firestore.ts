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
  type DocumentData,
} from 'firebase/firestore'
import { db, functions } from './firebase'
import { httpsCallable } from 'firebase/functions'
import type { Empresa, Proyecto, Tarea, UsuarioApp, Invitacion, Rol, UsuarioPermitido, EmailConfig, LineaBase } from '@/types'

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

// ─── Proyectos ────────────────────────────────────────────────────────────────

export async function crearProyecto(data: Omit<Proyecto, 'id' | 'creadoEn'>): Promise<string> {
  const ref = await addDoc(collection(db, 'proyectos'), {
    ...data,
    creadoEn: serverTimestamp(),
  })
  return ref.id
}

export async function actualizarProyecto(id: string, data: Partial<Proyecto>) {
  await updateDoc(doc(db, 'proyectos', id), data as DocumentData)
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
  })
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

export async function contarPermitidos(): Promise<number> {
  const snap = await getDocs(collection(db, 'usuarios_permitidos'))
  return snap.size
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
  const ref = await addDoc(collection(db, 'lineas_base'), {
    ...data,
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
