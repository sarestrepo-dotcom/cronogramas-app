import { toPng } from 'html-to-image'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Tarea } from '@/types'
import { buildHierarchy } from './hierarchyUtils'
import { tsToDate } from './utils'

export async function exportGanttPNG(scrollContainer: HTMLElement, filename = 'gantt') {
  // The actual full-width content is the first child of the scroll container.
  const contentEl = scrollContainer.firstElementChild as HTMLElement | null
  if (!contentEl) return

  const W = contentEl.scrollWidth
  const H = contentEl.scrollHeight

  // Temporarily expand the scroll container so html-to-image sees all content
  const prevOverflow = scrollContainer.style.overflow
  const prevMaxH     = scrollContainer.style.maxHeight
  const prevH        = scrollContainer.style.height
  scrollContainer.style.overflow  = 'visible'
  scrollContainer.style.maxHeight = 'none'
  scrollContainer.style.height    = H + 'px'

  try {
    // html-to-image uses SVG foreignObject — the browser renders the CSS
    // (including oklch, CSS variables, etc.) so no parsing errors
    const dataUrl = await toPng(contentEl, {
      backgroundColor: '#ffffff',
      pixelRatio: 2,
      width: W,
      height: H,
    })
    triggerDownload(dataUrl, `${filename}.png`)
  } finally {
    scrollContainer.style.overflow  = prevOverflow
    scrollContainer.style.maxHeight = prevMaxH
    scrollContainer.style.height    = prevH
  }
}

export function exportCSV(tareas: Tarea[], filename = 'cronograma') {
  const grupoMap = new Map(tareas.filter(t => t.tipo === 'grupo').map(t => [t.id, t.titulo]))
  const rows = buildHierarchy(tareas)

  const headers = [
    '#', 'Fase', 'Tipo', 'Grupo', 'Título', 'Responsable',
    'Inicio', 'Fin', 'Estado', 'Prioridad', '% Avance', 'Notas', 'Links',
  ]

  const tareaRows = rows.filter((r): r is Extract<typeof rows[0], { kind: 'tarea' }> => r.kind === 'tarea')

  const csvRows = tareaRows.map(({ tarea }, i) => [
    i + 1,
    tarea.fase ?? '',
    tarea.tipo ?? 'tarea',
    tarea.parentId
      ? (grupoMap.get(tarea.parentId) ?? '')
      : (tarea.tipo === 'grupo' ? tarea.titulo : ''),
    tarea.titulo,
    tarea.asignadoA ?? '',
    tarea.fechaInicio ? format(tsToDate(tarea.fechaInicio), 'dd/MM/yyyy', { locale: es }) : '',
    tarea.fechaFin    ? format(tsToDate(tarea.fechaFin),    'dd/MM/yyyy', { locale: es }) : '',
    tarea.estado,
    tarea.prioridad,
    tarea.progreso ?? 0,
    tarea.notas ?? '',
    (tarea.links ?? []).join(' | '),
  ])

  const csv = [headers, ...csvRows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, `${filename}.csv`)
  URL.revokeObjectURL(url)
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
