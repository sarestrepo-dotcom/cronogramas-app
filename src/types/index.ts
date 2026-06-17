import type { Timestamp } from 'firebase/firestore'

export type Rol = 'owner' | 'admin' | 'miembro' | 'viewer'

export type EstadoTarea = 'pendiente' | 'en_progreso' | 'completada' | 'bloqueada'

export type TipoTarea = 'tarea' | 'hito' | 'grupo'

export interface Empresa {
  id: string
  nombre: string
  descripcion?: string
  color: string
  logo?: string
  ownerId: string
  miembros: Record<string, Rol>
  creadoEn: Timestamp
}

export interface Proyecto {
  id: string
  empresaId: string
  nombre: string
  objetivo?: string
  descripcion?: string
  fechaInicio: Timestamp
  fechaFin: Timestamp
  estado: 'activo' | 'pausado' | 'completado' | 'archivado'
  color: string
  creadoPor: string
  miembros: Record<string, Rol>
  creadoEn: Timestamp
}

export interface Tarea {
  id: string
  proyectoId: string
  empresaId: string
  titulo: string
  descripcion?: string
  fechaInicio: Timestamp
  fechaFin: Timestamp
  estado: EstadoTarea
  prioridad: 'baja' | 'media' | 'alta' | 'critica'
  tipo?: TipoTarea
  parentId?: string
  orden?: number
  asignadoA?: string       // primary responsable (backwards compat / email matching)
  asignadosA?: string[]    // all responsables (multi-person)
  dependencias: string[]
  progreso: number
  links?: string[]
  fase?: string
  notas?: string
  entregables?: string     // deliverables / output description
  creadoPor: string
  creadoEn: Timestamp
  actualizadoEn: Timestamp
}

export interface UsuarioApp {
  uid: string
  email: string
  displayName: string
  photoURL?: string
  empresas: string[]
  creadoEn: Timestamp
}

export interface UsuarioPermitido {
  email: string
  nombre: string
  rol: 'admin' | 'usuario'
  activo: boolean
  empresas: string[]   // empresaIds permitidas (vacío = sin acceso a ninguna para usuarios; ignorado para admins)
  proyectosCompartidos?: string[]  // proyectoIds compartidos directamente con este usuario
  agregadoPor: string
  creadoEn: Timestamp
}

export interface Invitacion {
  id: string
  empresaId: string
  empresaNombre: string
  emailDestino: string
  rol: Rol
  estado: 'pendiente' | 'aceptada' | 'rechazada'
  creadoPor: string
  creadoEn: Timestamp
}

export interface EmailConfig {
  gmailUser: string
  gmailAppPassword: string
  groqApiKey: string         // Groq API key for email reply parsing (free tier)
  habilitado: boolean
  responsables: { nombre: string; email: string }[]
  proyectosIds: string[]
  uid: string
}

export interface CambioPropuesto {
  tareaId: string
  titulo: string
  campo: 'estado' | 'progreso' | 'notas' | 'fechaInicio' | 'fechaFin' | 'responsable'
  valorActual: string | number
  valorNuevo: string | number
  aplicar: boolean
}

export interface TareaNuevaPropuesta {
  titulo: string
  fechaInicio: string   // DD/MM/YYYY
  fechaFin: string      // DD/MM/YYYY
  responsable: string
  fase: string
  descripcion: string
  aplicar: boolean
}

export type ColoresEmpresa = {
  bg: string
  text: string
  border: string
  light: string
}

export const COLORES_EMPRESAS: Record<string, ColoresEmpresa> = {
  indigo:  { bg: 'bg-indigo-600',  text: 'text-indigo-600',  border: 'border-indigo-600',  light: 'bg-indigo-50'  },
  blue:    { bg: 'bg-blue-600',    text: 'text-blue-600',    border: 'border-blue-600',    light: 'bg-blue-50'    },
  violet:  { bg: 'bg-violet-600',  text: 'text-violet-600',  border: 'border-violet-600',  light: 'bg-violet-50'  },
  emerald: { bg: 'bg-emerald-600', text: 'text-emerald-600', border: 'border-emerald-600', light: 'bg-emerald-50' },
  rose:    { bg: 'bg-rose-600',    text: 'text-rose-600',    border: 'border-rose-600',    light: 'bg-rose-50'    },
  amber:   { bg: 'bg-amber-500',   text: 'text-amber-500',   border: 'border-amber-500',   light: 'bg-amber-50'   },
  cyan:    { bg: 'bg-cyan-600',    text: 'text-cyan-600',    border: 'border-cyan-600',     light: 'bg-cyan-50'    },
  slate:   { bg: 'bg-slate-600',   text: 'text-slate-600',   border: 'border-slate-600',   light: 'bg-slate-50'   },
}
