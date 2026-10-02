import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInDays, isAfter, isBefore, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Timestamp } from 'firebase/firestore'
import type { EstadoTarea } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function tsToDate(ts: Timestamp | undefined): Date {
  if (!ts) return new Date()
  return ts.toDate()
}

export function formatFecha(ts: Timestamp | undefined, fmt = 'dd MMM yyyy'): string {
  if (!ts) return '—'
  return format(ts.toDate(), fmt, { locale: es })
}

export function diasRestantes(ts: Timestamp | undefined): number {
  if (!ts) return 0
  return differenceInDays(ts.toDate(), new Date())
}

export function isVencida(ts: Timestamp | undefined): boolean {
  if (!ts) return false
  return isBefore(ts.toDate(), new Date())
}

export function isProximaAVencer(ts: Timestamp | undefined, dias = 7): boolean {
  if (!ts) return false
  const fecha = ts.toDate()
  return isAfter(fecha, new Date()) && isBefore(fecha, addDays(new Date(), dias))
}

export const ESTADO_COLORS: Record<EstadoTarea, { bg: string; text: string; dot: string }> = {
  pendiente:   { bg: 'bg-slate-100',   text: 'text-slate-600',   dot: 'bg-slate-400'   },
  en_progreso: { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  completada:  { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  bloqueada:   { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500'     },
}

export const ESTADO_LABELS: Record<EstadoTarea, string> = {
  pendiente:   'Pendiente',
  en_progreso: 'En progreso',
  completada:  'Completada',
  bloqueada:   'Bloqueada',
}

// Días que lleva bloqueada una tarea. Las bloqueadas antes de existir `bloqueadaDesde`
// usan la última actualización como aproximación ("al menos N días").
export const UMBRAL_BLOQUEO_DIAS = 7
export function diasBloqueada(t: { estado: string; bloqueadaDesde?: Timestamp; actualizadoEn?: Timestamp }): number | null {
  if (t.estado !== 'bloqueada') return null
  const desde = t.bloqueadaDesde ?? t.actualizadoEn
  if (!desde?.seconds) return null
  return Math.max(0, Math.floor((Date.now() - desde.seconds * 1000) / 86400000))
}
export function textoDiasBloqueada(dias: number | null): string {
  if (dias === null) return ''
  return dias === 0 ? 'Bloqueada hoy' : `Bloqueada hace ${dias} día${dias === 1 ? '' : 's'}`
}

export const BLOQUEO_LABELS = { interno: 'Interno', cliente: 'Cliente' } as const
export const BLOQUEO_COLORS = {
  interno: { bg: 'bg-violet-100', text: 'text-violet-700' },
  cliente: { bg: 'bg-amber-100', text: 'text-amber-800' },
} as const

export const PRIORIDAD_COLORS = {
  baja:    { bg: 'bg-slate-100', text: 'text-slate-600' },
  media:   { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  alta:    { bg: 'bg-orange-100', text: 'text-orange-700' },
  critica: { bg: 'bg-red-100', text: 'text-red-700' },
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

export function getResponsables(tarea: { asignadoA?: string; asignadosA?: string[] }): string[] {
  if (tarea.asignadosA?.length) return tarea.asignadosA
  if (tarea.asignadoA) return [tarea.asignadoA]
  return []
}
