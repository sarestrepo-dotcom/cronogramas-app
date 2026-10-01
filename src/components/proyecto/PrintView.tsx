import { formatFecha, ESTADO_LABELS, tsToDate } from '@/lib/utils'
import type { Tarea, Proyecto, Empresa } from '@/types'

function getResponsables(t: Tarea): string {
  const arr = t.asignadosA?.length ? t.asignadosA : t.asignadoA ? [t.asignadoA] : []
  return arr.join(', ') || '—'
}

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0
}

function diasRestantes(t: Tarea): number {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const fin = tsToDate(t.fechaFin); fin.setHours(0, 0, 0, 0)
  return Math.round((fin.getTime() - hoy.getTime()) / 86400000)
}

export interface PDFOptions {
  incluirHitos: boolean
  incluirRutaCritica: boolean
  incluirTablaCompleta: boolean
  incluirPorFase: boolean
  nombreCliente?: string
}

export function abrirVistaPDF(
  tareas: Tarea[],
  proyecto: Proyecto | undefined,
  empresa?: Empresa,
  rutaCritica?: Set<string>,
  opts: PDFOptions = {
    incluirHitos: true,
    incluirRutaCritica: true,
    incluirTablaCompleta: true,
    incluirPorFase: true,
  }
) {
  const nombre    = proyecto?.nombre ?? 'Proyecto'
  const hoy       = new Date()
  const fechaStr  = hoy.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })

  const activas   = tareas.filter(t => t.tipo !== 'grupo')
  const total     = activas.length
  const completadas  = activas.filter(t => t.estado === 'completada').length
  const enProgreso   = activas.filter(t => t.estado === 'en_progreso').length
  const bloqueadas   = activas.filter(t => t.estado === 'bloqueada').length
  const vencidas     = activas.filter(t => t.estado !== 'completada' && tsToDate(t.fechaFin) < hoy).length
  const avance       = pct(completadas, total)

  // Días restantes del proyecto
  const diasProy = proyecto ? Math.round((tsToDate(proyecto.fechaFin).getTime() - hoy.getTime()) / 86400000) : null

  // Hitos
  const hitos = tareas
    .filter(t => t.tipo === 'hito')
    .sort((a, b) => (a.fechaFin?.seconds ?? 0) - (b.fechaFin?.seconds ?? 0))

  // Próximas entregas (próximos 14 días, no completadas)
  const proximas = activas
    .filter(t => {
      const d = diasRestantes(t)
      return t.estado !== 'completada' && d >= 0 && d <= 14
    })
    .sort((a, b) => (a.fechaFin?.seconds ?? 0) - (b.fechaFin?.seconds ?? 0))
    .slice(0, 10)

  // Por fase
  const fases = [...new Set(activas.filter(t => t.fase).map(t => t.fase!))]
  const porFase = fases.map(fase => {
    const ts = activas.filter(t => t.fase === fase)
    const comp = ts.filter(t => t.estado === 'completada').length
    return { fase, total: ts.length, comp, avance: pct(comp, ts.length) }
  })

  // Ruta crítica
  const criticas = rutaCritica
    ? activas.filter(t => rutaCritica.has(t.id)).sort((a, b) => (a.fechaFin?.seconds ?? 0) - (b.fechaFin?.seconds ?? 0))
    : []

  // Tabla completa
  const todasOrd = activas.sort((a, b) => (a.fechaInicio?.seconds ?? 0) - (b.fechaInicio?.seconds ?? 0))

  // ── Secciones opcionales ──────────────────────────────────────────────────

  const seccionHitos = !opts.incluirHitos || hitos.length === 0 ? '' : `
  <section>
    <h2>Hitos del proyecto</h2>
    <table>
      <thead><tr><th>Hito</th><th>Fecha</th><th>Responsable</th><th>Estado</th></tr></thead>
      <tbody>
        ${hitos.map(t => {
          const d = diasRestantes(t)
          const cls = t.estado === 'completada' ? 'completada' : d < 0 ? 'vencida' : ''
          return `<tr class="${cls}">
            <td style="font-weight:600">${t.titulo}</td>
            <td>${formatFecha(t.fechaFin)}</td>
            <td>${getResponsables(t)}</td>
            <td><span class="badge badge-${t.estado}">${ESTADO_LABELS[t.estado]}</span></td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  </section>`

  const seccionProximas = proximas.length === 0 ? '' : `
  <section>
    <h2>Próximas entregas <span class="subtitle">(próximos 14 días)</span></h2>
    <table>
      <thead><tr><th>Tarea</th><th>Fase</th><th>Vence</th><th>Responsable</th><th>Estado</th></tr></thead>
      <tbody>
        ${proximas.map(t => {
          const d = diasRestantes(t)
          const urgente = d <= 2
          return `<tr>
            <td style="font-weight:500${urgente ? ';color:#dc2626' : ''}">${t.titulo}</td>
            <td><span class="fase-badge">${t.fase ?? '—'}</span></td>
            <td style="${urgente ? 'color:#dc2626;font-weight:600' : ''}">${formatFecha(t.fechaFin)}${d === 0 ? ' (hoy)' : d === 1 ? ' (mañana)' : ''}</td>
            <td>${getResponsables(t)}</td>
            <td><span class="badge badge-${t.estado}">${ESTADO_LABELS[t.estado]}</span></td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  </section>`

  const seccionFases = !opts.incluirPorFase || porFase.length === 0 ? '' : `
  <section>
    <h2>Avance por fase</h2>
    <table>
      <thead><tr><th>Fase</th><th>Total</th><th>Completadas</th><th>Avance</th><th></th></tr></thead>
      <tbody>
        ${porFase.map(f => `<tr>
          <td style="font-weight:600">${f.fase}</td>
          <td>${f.total}</td>
          <td>${f.comp}</td>
          <td style="font-weight:700;color:#4f46e5">${f.avance}%</td>
          <td style="min-width:120px">
            <div style="height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden">
              <div style="height:100%;width:${f.avance}%;background:${f.avance===100?'#22c55e':'#6366f1'};border-radius:99px"></div>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </section>`

  const seccionCritica = !opts.incluirRutaCritica || criticas.length === 0 ? '' : `
  <section>
    <h2>Ruta crítica <span class="subtitle">(tareas que determinan la duración total)</span></h2>
    <table>
      <thead><tr><th>Tarea</th><th>Inicio</th><th>Fin</th><th>Responsable</th><th>Estado</th></tr></thead>
      <tbody>
        ${criticas.map(t => {
          const cls = t.estado === 'completada' ? 'completada' : (tsToDate(t.fechaFin) < hoy ? 'vencida' : '')
          return `<tr class="${cls}">
            <td style="font-weight:500">${t.titulo}</td>
            <td>${formatFecha(t.fechaInicio)}</td>
            <td>${formatFecha(t.fechaFin)}</td>
            <td>${getResponsables(t)}</td>
            <td><span class="badge badge-${t.estado}">${ESTADO_LABELS[t.estado]}</span></td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  </section>`

  const seccionTabla = !opts.incluirTablaCompleta ? '' : `
  <section class="page-break">
    <h2>Cronograma completo</h2>
    <table>
      <thead><tr><th>Tarea</th><th>Fase</th><th>Inicio</th><th>Fin</th><th>Responsable</th><th>Estado</th><th>Avance</th></tr></thead>
      <tbody>
        ${todasOrd.map(t => {
          const venc = t.estado !== 'completada' && tsToDate(t.fechaFin) < hoy
          const cls = t.estado === 'completada' ? 'completada' : venc ? 'vencida' : ''
          return `<tr class="${cls}">
            <td style="font-weight:500">${t.titulo}</td>
            <td><span class="fase-badge">${t.fase ?? '—'}</span></td>
            <td>${formatFecha(t.fechaInicio)}</td>
            <td>${formatFecha(t.fechaFin)}</td>
            <td>${getResponsables(t)}</td>
            <td><span class="badge badge-${t.estado}">${ESTADO_LABELS[t.estado]}</span></td>
            <td>${t.progreso}%</td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  </section>`

  const colorEmpresa = empresa?.color ?? 'indigo'
  const COLORS: Record<string, string> = {
    indigo: '#6366f1', blue: '#3b82f6', violet: '#8b5cf6',
    emerald: '#10b981', rose: '#f43f5e', amber: '#f59e0b',
    cyan: '#06b6d4', slate: '#64748b',
  }
  const accentColor = COLORS[colorEmpresa] ?? '#6366f1'

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${nombre} — Reporte de avance</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:11.5px; color:#1e293b; background:#fff; }

  /* Portada */
  .cover { padding:40px 48px 32px; border-bottom:3px solid ${accentColor}; display:flex; justify-content:space-between; align-items:flex-start; }
  .cover-left h1 { font-size:26px; font-weight:800; color:#0f172a; margin-bottom:4px; }
  .cover-left .empresa { font-size:13px; color:#64748b; font-weight:500; margin-bottom:6px; }
  .cover-left .fechas  { font-size:11px; color:#94a3b8; }
  .cover-left .cliente-label { display:inline-block; margin-top:10px; font-size:10px; font-weight:600; background:${accentColor}15; color:${accentColor}; border:1px solid ${accentColor}30; border-radius:99px; padding:3px 10px; }
  .cover-right { text-align:right; }
  .cover-right .fecha-export { font-size:10px; color:#94a3b8; }

  /* KPIs */
  .kpis { display:flex; gap:0; border-bottom:1px solid #e2e8f0; }
  .kpi { flex:1; padding:18px 20px; border-right:1px solid #e2e8f0; }
  .kpi:last-child { border-right:none; }
  .kpi .val { font-size:24px; font-weight:800; color:#0f172a; line-height:1; }
  .kpi .val.accent { color:${accentColor}; }
  .kpi .val.danger  { color:#dc2626; }
  .kpi .val.warn    { color:#d97706; }
  .kpi .lbl { font-size:9.5px; color:#94a3b8; margin-top:3px; text-transform:uppercase; letter-spacing:.06em; font-weight:600; }

  /* Barra progreso */
  .progress-wrap { padding:16px 48px; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; gap:16px; }
  .progress-bar { flex:1; height:8px; background:#e2e8f0; border-radius:99px; overflow:hidden; }
  .progress-bar .fill { height:100%; background:${avance===100?'#22c55e':accentColor}; border-radius:99px; width:${avance}%; transition:width .3s; }
  .progress-label { font-size:20px; font-weight:800; color:${avance===100?'#22c55e':accentColor}; min-width:52px; text-align:right; }
  .dias-restantes { font-size:10px; color:#94a3b8; white-space:nowrap; }

  /* Cuerpo */
  .body { padding:24px 48px; }
  section { margin-bottom:28px; }
  h2 { font-size:13px; font-weight:700; color:#0f172a; margin-bottom:10px; padding-bottom:5px; border-bottom:1.5px solid #e2e8f0; display:flex; align-items:baseline; gap:8px; }
  .subtitle { font-size:10px; font-weight:400; color:#94a3b8; }

  /* Tablas */
  table { width:100%; border-collapse:collapse; font-size:10.5px; }
  thead th { background:#f8fafc; color:#475569; font-weight:700; padding:7px 10px; text-align:left; font-size:9.5px; text-transform:uppercase; letter-spacing:.05em; border-bottom:1.5px solid #e2e8f0; }
  tbody tr { border-bottom:1px solid #f1f5f9; }
  tbody td { padding:6px 10px; vertical-align:middle; }
  tr.vencida td   { color:#dc2626; }
  tr.completada td { color:#94a3b8; }

  /* Badges */
  .badge { font-size:9px; font-weight:700; padding:2px 7px; border-radius:99px; display:inline-block; }
  .badge-pendiente   { background:#f1f5f9; color:#64748b; }
  .badge-en_progreso { background:#dbeafe; color:#1d4ed8; }
  .badge-completada  { background:#dcfce7; color:#15803d; }
  .badge-bloqueada   { background:#fee2e2; color:#b91c1c; }
  .fase-badge { background:#eef2ff; color:#4f46e5; font-size:9px; font-weight:600; padding:1px 6px; border-radius:99px; }

  /* Footer */
  .footer { margin-top:16px; padding:12px 48px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; font-size:9.5px; color:#94a3b8; }

  /* Print */
  .page-break { page-break-before:always; padding-top:20px; }
  @media print {
    body { font-size:10.5px; }
    @page { margin:12mm 14mm; size:A4; }
    .cover { padding:24px 32px 20px; }
    .kpi .val { font-size:20px; }
    .progress-wrap { padding:12px 32px; }
    .body { padding:16px 32px; }
    .footer { padding:8px 32px; }
  }
</style>
</head>
<body>

  <!-- Portada -->
  <div class="cover">
    <div class="cover-left">
      <div class="empresa">${empresa?.nombre ?? ''}</div>
      <h1>${nombre}</h1>
      <div class="fechas">
        ${proyecto ? `${formatFecha(proyecto.fechaInicio)} → ${formatFecha(proyecto.fechaFin)}` : ''}
      </div>
      ${opts.nombreCliente ? `<span class="cliente-label">Cliente: ${opts.nombreCliente}</span>` : ''}
    </div>
    <div class="cover-right">
      <div class="fecha-export">Reporte generado el ${fechaStr}</div>
    </div>
  </div>

  <!-- KPIs -->
  <div class="kpis">
    <div class="kpi"><div class="val accent">${avance}%</div><div class="lbl">Avance global</div></div>
    <div class="kpi"><div class="val">${completadas}</div><div class="lbl">Completadas</div></div>
    <div class="kpi"><div class="val">${enProgreso}</div><div class="lbl">En progreso</div></div>
    <div class="kpi"><div class="val ${bloqueadas > 0 ? 'danger' : ''}">${bloqueadas}</div><div class="lbl">Bloqueadas</div></div>
    <div class="kpi"><div class="val ${vencidas > 0 ? 'danger' : ''}">${vencidas}</div><div class="lbl">Vencidas</div></div>
    <div class="kpi"><div class="val ${diasProy !== null && diasProy < 0 ? 'danger' : diasProy !== null && diasProy <= 7 ? 'warn' : ''}">${diasProy !== null ? (diasProy < 0 ? `${Math.abs(diasProy)}d tarde` : `${diasProy}d`) : '—'}</div><div class="lbl">Días al cierre</div></div>
  </div>

  <!-- Barra de progreso -->
  <div class="progress-wrap">
    <span style="font-size:10px;color:#94a3b8;font-weight:600;min-width:80px">Avance general</span>
    <div class="progress-bar"><div class="fill"></div></div>
    <div class="progress-label">${avance}%</div>
    ${diasProy !== null ? `<span class="dias-restantes">${diasProy < 0 ? `${Math.abs(diasProy)} días de retraso` : `${diasProy} días restantes`}</span>` : ''}
  </div>

  <!-- Cuerpo del reporte -->
  <div class="body">
    ${seccionHitos}
    ${seccionProximas}
    ${seccionFases}
    ${seccionCritica}
    ${seccionTabla}
  </div>

  <div class="footer">
    <span>${nombre} — Reporte de avance</span>
    <span>Cronogramas App · ${fechaStr}</span>
  </div>

  <script>window.onload = () => window.print()</script>
</body>
</html>`

  const ventana = window.open('', '_blank', 'width=960,height=800')
  if (ventana) {
    ventana.document.write(html)
    ventana.document.close()
  }
}
