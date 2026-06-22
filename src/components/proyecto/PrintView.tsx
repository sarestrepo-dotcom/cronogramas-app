import { formatFecha, ESTADO_LABELS, tsToDate } from '@/lib/utils'
import type { Tarea, Proyecto } from '@/types'

function getResponsables(t: Tarea): string {
  const arr = t.asignadosA?.length ? t.asignadosA : t.asignadoA ? [t.asignadoA] : []
  return arr.join(', ') || '—'
}

export function abrirVistaPDF(tareas: Tarea[], proyecto: Proyecto | undefined) {
  const nombre = proyecto?.nombre ?? 'Cronograma'
  const fechasProyecto = proyecto
    ? `${formatFecha(proyecto.fechaInicio)} → ${formatFecha(proyecto.fechaFin)}`
    : ''

  const filas = tareas
    .filter((t) => t.tipo !== 'grupo')
    .sort((a, b) => (a.fechaInicio?.seconds ?? 0) - (b.fechaInicio?.seconds ?? 0))

  const totalTareas = filas.length
  const completadas = filas.filter((t) => t.estado === 'completada').length
  const progresoGlobal = totalTareas > 0 ? Math.round((completadas / totalTareas) * 100) : 0

  const filaHtml = filas.map((t) => {
    const vencida = t.estado !== 'completada' && tsToDate(t.fechaFin) < new Date()
    return `
      <tr class="${vencida ? 'vencida' : t.estado === 'completada' ? 'completada' : ''}">
        <td class="tarea-titulo">${t.fase ? `<span class="fase-badge">${t.fase}</span> ` : ''}${t.titulo}</td>
        <td>${formatFecha(t.fechaInicio)}</td>
        <td>${formatFecha(t.fechaFin)}</td>
        <td>${getResponsables(t)}</td>
        <td><span class="estado estado-${t.estado}">${ESTADO_LABELS[t.estado]}</span></td>
        <td>${t.progreso}%</td>
      </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${nombre} — Cronograma</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #1e293b; padding: 32px; }
  h1 { font-size: 22px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
  .meta { color: #64748b; font-size: 11px; margin-bottom: 24px; display: flex; gap: 16px; align-items: center; }
  .stats { display: flex; gap: 12px; margin-bottom: 20px; }
  .stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 14px; text-align: center; }
  .stat .val { font-size: 18px; font-weight: 700; color: #1e293b; }
  .stat .lbl { font-size: 10px; color: #94a3b8; margin-top: 2px; }
  .progress-bar { height: 6px; background: #e2e8f0; border-radius: 99px; margin-bottom: 24px; overflow: hidden; }
  .progress-bar .fill { height: 100%; background: #6366f1; border-radius: 99px; width: ${progresoGlobal}%; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead th { background: #6366f1; color: white; font-weight: 600; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  tbody tr { border-bottom: 1px solid #f1f5f9; }
  tbody tr:hover { background: #f8fafc; }
  tbody td { padding: 7px 10px; vertical-align: middle; }
  .tarea-titulo { font-weight: 500; max-width: 220px; }
  .fase-badge { background: #eef2ff; color: #4f46e5; font-size: 9px; font-weight: 600; padding: 1px 5px; border-radius: 99px; margin-right: 4px; }
  .estado { font-size: 9px; font-weight: 600; padding: 2px 7px; border-radius: 99px; }
  .estado-pendiente { background: #f1f5f9; color: #64748b; }
  .estado-en_progreso { background: #dbeafe; color: #1d4ed8; }
  .estado-completada { background: #dcfce7; color: #15803d; }
  .estado-bloqueada { background: #fee2e2; color: #b91c1c; }
  tr.vencida td { color: #dc2626; }
  tr.completada td { color: #94a3b8; }
  .footer { margin-top: 20px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
  @media print {
    body { padding: 16px; }
    @page { margin: 16mm; }
  }
</style>
</head>
<body>
  <h1>${nombre}</h1>
  <div class="meta">
    <span>📅 ${fechasProyecto}</span>
    <span>·</span>
    <span>Exportado ${new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
  </div>
  <div class="stats">
    <div class="stat"><div class="val">${totalTareas}</div><div class="lbl">Total</div></div>
    <div class="stat"><div class="val">${completadas}</div><div class="lbl">Completadas</div></div>
    <div class="stat"><div class="val">${filas.filter(t=>t.estado==='en_progreso').length}</div><div class="lbl">En progreso</div></div>
    <div class="stat"><div class="val">${filas.filter(t=>t.estado!=='completada'&&tsToDate(t.fechaFin)<new Date()).length}</div><div class="lbl">Vencidas</div></div>
    <div class="stat"><div class="val">${progresoGlobal}%</div><div class="lbl">Avance global</div></div>
  </div>
  <div class="progress-bar"><div class="fill"></div></div>
  <table>
    <thead>
      <tr>
        <th>Tarea</th>
        <th>Inicio</th>
        <th>Fin</th>
        <th>Responsable</th>
        <th>Estado</th>
        <th>Avance</th>
      </tr>
    </thead>
    <tbody>${filaHtml}</tbody>
  </table>
  <div class="footer">Generado desde Cronogramas App</div>
  <script>window.onload = () => window.print()</script>
</body>
</html>`

  const ventana = window.open('', '_blank', 'width=900,height=700')
  if (ventana) {
    ventana.document.write(html)
    ventana.document.close()
  }
}
