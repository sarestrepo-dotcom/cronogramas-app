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
