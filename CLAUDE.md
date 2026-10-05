# Cronogramas App — Guía técnica del proyecto

## Qué es esto

Aplicación web de gestión de cronogramas y tareas para múltiples empresas. Permite crear proyectos,
asignar tareas con fechas, ver avance en vistas Lista / Tabla / Kanban / Gantt / Carga, generar
reportes PDF, compartir portales de cliente y gestionar equipos con roles por empresa.

**URL producción:** https://cronogramas-bluemartech.web.app  
**Firebase project:** `cronogramas-bluemartech`  
**Repositorio:** https://github.com/sarestrepo-dotcom/cronogramas-app  
**Directorio local:** `/Users/sergiorestrepo/Documents/proyectosClaude/cronogramas-app`

---

## Stack

| Capa | Tecnología |
|------|-----------|
| UI | React 19 + TypeScript + Vite 8 |
| Estilos | Tailwind CSS v4 |
| Base de datos | Firebase Firestore |
| Auth | Firebase Authentication (Google SSO) |
| Hosting | Firebase Hosting |
| Routing | React Router v7 |
| Estado server | TanStack Query v5 (parcial) |
| Fechas | date-fns v4 |
| Iconos | Lucide React |
| PDF/imágenes | html2canvas + html-to-image |
| AI emails | Groq API (llama-3.3-70b-versatile) |

### Dependencias principales (package.json)

```
firebase ^12               # Firestore, Auth
react-router-dom ^7        # Routing con lazy loading
@tanstack/react-query ^5   # Fetching/cache (usado parcialmente)
@radix-ui/*                # Primitivos UI (Dialog, Dropdown, Select, Tabs…)
date-fns ^4                # Formateo y cálculo de fechas
html2canvas + html-to-image # Generación de PDF / capturas
lucide-react               # Iconos
class-variance-authority   # Variantes de estilos
tailwind-merge + clsx      # Composición de clases Tailwind
```

---

## Setup desde cero (nuevo desarrollador)

### 1. Pre-requisitos

```bash
node >= 20
npm >= 10
firebase-tools instalado globalmente: npm i -g firebase-tools
```

### 2. Clonar e instalar

```bash
git clone https://github.com/sarestrepo-dotcom/cronogramas-app.git
cd cronogramas-app
npm install
```

### 3. Variables de entorno

Crea un archivo `.env` en la raíz (copia `.env.example` y rellena con los valores del proyecto Firebase):

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=cronogramas-bluemartech.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=cronogramas-bluemartech
VITE_FIREBASE_STORAGE_BUCKET=cronogramas-bluemartech.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Los valores están en la consola Firebase → Configuración del proyecto → Tus apps.

> **El API key de Groq NO es variable de entorno.** Se guarda por usuario en Firestore
> (`email_config/{uid}.groqApiKey`) y se configura desde la UI en **Configuración → Email y AI**.

### 4. Acceso a la app

Para que un email pueda entrar, debe existir un documento en Firestore:
- Colección: `usuarios_permitidos`
- Document ID: el email de Google con el que iniciará sesión
- Campo opcional: `rol: 'admin'` para acceso al panel Admin
- Campo: `empresas: ['id1', 'id2']` — lista de IDs de empresas a las que tiene acceso

### 5. Autenticación Firebase CLI

La cuenta smdigital.com.co tiene restricciones OAuth de Google Workspace que invalidan tokens frecuentemente.

```bash
# Generar token para CI (persiste más que el login normal)
firebase login:ci

# Copiar el token 1//... y pegarlo en ~/.zshrc:
export FIREBASE_TOKEN="1//..."

# Si el token expira de nuevo, repetir el proceso
source ~/.zshrc
```

### 6. Desarrollo local

```bash
npm run dev      # Vite en http://localhost:5173
npm run build    # Build de producción en /dist
npm run lint     # ESLint
```

### 7. Deploy

```bash
# Solo hosting (lo más común)
source ~/.zshrc && firebase deploy --only hosting

# Hosting + reglas Firestore (cuando se modifique firestore.rules) — antes: npm run test:rules
source ~/.zshrc && firebase deploy --only hosting,firestore:rules

# Cloud Functions: requiere plan Blaze (el proyecto está en Spark, ver quirk 10)
```

---

## Estructura de archivos

```
src/
├── App.tsx                        # Rutas, lazy loading, providers globales
├── main.tsx
├── types/index.ts                 # Todos los tipos TypeScript del dominio
│
├── lib/
│   ├── firebase.ts                # Inicialización Firebase (db, auth)
│   ├── firestore.ts               # TODAS las funciones Firestore (CRUD + suscripciones)
│   ├── hierarchyUtils.ts          # enrichTareas, buildHierarchy, computeNumeros
│   ├── utils.ts                   # Helpers: formatFecha, diasRestantes, ESTADO_COLORS, cn()
│   ├── cascadeUtils.ts            # Propagación de fechas en dependencias
│   ├── criticalPath.ts            # Algoritmo de ruta crítica (CPM)
│   ├── emailUtils.ts              # Generación de resumen email semanal
│   ├── exportUtils.ts             # Exportación CSV
│   └── groqUtils.ts               # Integración AI (Groq) para procesar emails
│
├── hooks/
│   ├── useAuth.tsx                # Usuario autenticado + rol admin global
│   ├── useEmpresas.ts             # Empresas del usuario actual
│   ├── useProyectos.ts            # Proyectos de una empresa
│   ├── useTareas.ts               # Tareas de un proyecto (onSnapshot en tiempo real)
│   ├── useClientes.ts             # Clientes de una empresa
│   ├── useMisTareas.ts            # Tareas asignadas al usuario actual (cross-proyecto)
│   ├── useNotificaciones.ts       # Notificaciones in-app de tareas urgentes/vencidas
│   └── useUndoStack.ts            # Stack de deshacer (Ctrl+Z)
│
├── pages/
│   ├── LoginPage.tsx              # Auth Google SSO
│   ├── DashboardPage.tsx          # Dashboard global + acceso rápido a proyectos
│   ├── EmpresasPage.tsx           # Lista y CRUD de empresas
│   ├── ClientesPage.tsx           # Clientes de una empresa
│   ├── ProyectosPage.tsx          # Proyectos de un cliente
│   ├── ProyectoDetailPage.tsx     # Vista principal de un proyecto (todas las vistas)
│   ├── MisTareasPage.tsx          # Tareas asignadas al usuario logueado
│   ├── AdminPage.tsx              # Control de acceso + gestión de aliases
│   ├── SettingsPage.tsx           # Config email Gmail y API key Groq por usuario
│   ├── PortalClientePage.tsx      # Vista pública para clientes (sin auth)
│   └── NotFoundPage.tsx           # 404
│
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx          # Layout principal: Sidebar + Outlet + SearchModal
│   │   ├── Sidebar.tsx            # Navegación + campana de notificaciones
│   │   └── NotificacionesPanel.tsx # Panel de notificaciones + bell button
│   │
│   ├── gantt/GanttVisual.tsx      # Gantt custom: drag, resize, dependencias, ruta crítica
│   ├── kanban/KanbanView.tsx      # Kanban drag & drop por columnas de estado
│   │
│   ├── proyecto/
│   │   ├── ProyectoDashboard.tsx  # Dashboard por proyecto (KPIs, hitos, carga; clic en Bloqueadas → TareasBloqueadasModal)
│   │   ├── PrintView.tsx          # Generador de PDF ejecutivo (window.open + html2canvas)
│   │   ├── PortalModal.tsx        # Gestión de portales + actividad del cliente (PM)
│   │   └── WorkloadView.tsx       # Vista de carga por responsable
│   │
│   ├── tareas/
│   │   ├── TareasTabla.tsx        # Vista tabla con edición inline + bulk select
│   │   ├── TareaDetailPanel.tsx   # Panel lateral de detalle de tarea
│   │   ├── ImportarTareasModal.tsx # Import desde CSV/Excel
│   │   └── ProcesarEmailModal.tsx  # Procesamiento AI de emails con Groq
│   │
│   ├── plantillas/PlantillasModal.tsx  # Guardar y aplicar plantillas de proyectos
│   ├── lineasBase/LineasBaseModal.tsx  # Gestión de líneas base (snapshots de cronograma)
│   ├── search/SearchModal.tsx     # Command palette Cmd+K (cross-proyecto)
│   └── ui/Toast.tsx               # Sistema de toasts (contexto global)
```

---

## Rutas de la app

```
/login                                                      → LoginPage (pública)
/portal/:token                                              → PortalClientePage (pública, sin auth)
/dashboard                                                  → DashboardPage
/empresas                                                   → EmpresasPage
/empresa/:empresaId/proyectos                               → ClientesPage (lista clientes)
/empresa/:empresaId/cliente/:clienteId/proyectos            → ProyectosPage
/empresa/:empresaId/proyecto/:proyectoId                    → ProyectoDetailPage
/empresa/:empresaId/cliente/:clienteId/proyecto/:proyectoId → ProyectoDetailPage
/mis-tareas                                                 → MisTareasPage
/settings?s=perfil|seguridad|email                          → SettingsPage
/admin                                                      → AdminPage (solo admins)
```

### URL params en ProyectoDetailPage

Todas las vistas y tabs usan `useSearchParams` — cada estado es una URL única y compartible:

| Param | Valores | Descripción |
|-------|---------|-------------|
| `?tab=` | `cronograma` \| `dashboard` | Tab principal del proyecto |
| `?vista=` | `lista` \| `tabla` \| `kanban` \| `gantt` \| `carga` | Vista activa del cronograma |
| `?dash=` | `resumen` \| `semanal` | Sub-tab dentro del dashboard (ProyectoDashboard) |
| `?tarea=ID` | string | Deep-link a tarea — abre el panel y se borra del URL |
| `?panel=` | `detalle` \| `comentarios` \| `historial` | Tab activo dentro del panel de tarea |

**Regla:** todos los setters usan `{ replace: true }` para no contaminar el historial de navegación. Al cerrar el panel de tarea se borra `?panel=` preservando los demás params. Al abrir vía `?tarea=ID`, se borra solo ese param (no los demás).

---

## Modelo de datos Firestore

Todas las colecciones son **raíz** (no sub-colecciones) para facilitar queries cross-empresa.
La excepción son las sub-colecciones de `portales/`.

### Colecciones

```
usuarios_permitidos/{email}
  - rol?: 'admin'                  # Sin campo = usuario normal
  - empresas: string[]             # IDs de empresas a las que tiene acceso

usuarios/{uid}
  - displayName, email
  - aliases: string[]              # Nombres alternativos para matching en "Mis Tareas"

empresas/{id}
  - nombre, color
  - miembros: { [uid]: 'owner' | 'admin' | 'miembro' | 'viewer' }

clientes/{id}
  - nombre, contacto, email, telefono
  - empresaId: string

proyectos/{id}
  - nombre, descripcion, color, objetivo?
  - empresaId, clienteId?
  - fechaInicio, fechaFin: Timestamp
  - estado: 'activo' | 'completado' | 'pausado'
  - miembros: { [uid]: rol }
  - valorVenta?: number

tareas/{id}
  - titulo, descripcion?, notas?, entregables?
  - proyectoId, empresaId
  - parentId?: string              # Jerarquía de subtareas
  - tipo: 'tarea' | 'grupo' | 'hito'
  - estado: 'pendiente' | 'en_progreso' | 'completada' | 'bloqueada'
  - progreso: number (0–100)       # Solo en tareas hoja; en grupos se deriva en runtime
  - prioridad: 'baja' | 'media' | 'alta' | 'critica'
  - fechaInicio, fechaFin: Timestamp
  - asignadoA?: string             # Responsable principal (texto libre)
  - asignadosA?: string[]          # Lista de responsables
  - fase?: string                  # Agrupación visual
  - orden: number                  # Para reordenamiento drag & drop
  - dependencias?: string[]        # IDs de tareas predecesoras
  - links?: string[]

portales/{token}                   # Token UUID (sin guiones). El cliente solo hace `get` si activo
  - proyectoId, empresaId, nombre, activo: boolean, creadoEn
  - duenos: string[]               # uids owner del proyecto (destinatarios de notificaciones)
  - publico: { proyecto, tareas[], actualizadoEn }  # Copia FILTRADA que ve el cliente
  - publicoHash                    # Evita reescribir si no cambió
  - ultimaEscrituraPublica         # Sello anti-spam: 1 escritura del cliente cada 3 s
  /aprobaciones/{hitoId}           # Cliente crea (solo hitos completados del proyecto)
    - hitoId, nombre, aprobadoEn
  /comentarios/{id}                # DESACTIVADO para el cliente (solo históricos, lectura del equipo)
    - texto, autor, creadoEn
  /solicitudes/{id}                # Cliente crea; solo el equipo lee
    - descripcion, autor, creadoEn, estado

notificaciones/{id}                # In-app; las crea el portal junto con cada solicitud
  - uid (destinatario), tipo: 'solicitud_cambio'
  - proyectoId, empresaId, portalToken, titulo, mensaje
  - leida: boolean, creadoEn

lineas_base/{id}
  - proyectoId, nombre, creadoEn
  - snapshot: Tarea[]              # Copia completa de todas las tareas del proyecto

comentarios/{id}                   # Comentarios de tareas (colección global)
  - tareaId, proyectoId
  - texto, autorId, autorNombre, creadoEn

historial_cambios/{id}
  - tareaId, proyectoId, campo
  - valorAnterior, valorNuevo
  - cambiadoPor, cambiadoPorNombre, creadoEn

invitaciones/{id}
  - empresaId, emailDestino, rol, creadoPor

email_config/{uid}
  - gmailUser, gmailAppPassword    # Cuenta Gmail y App Password para envíos
  - groqApiKey                     # API key personal de Groq (AI)
  - destinatarios: string[]
  - empresaIds: string[]

plantillas/{id}
  - empresaId, nombre
  - tareas: PlantillaTarea[]       # Estructura de tareas sin fechas absolutas
```

---

## Sistema de autenticación y permisos

### Acceso a la app
Solo usuarios listados en `usuarios_permitidos/{email}` pueden entrar. `ProtectedRoute` verifica esto en cada carga. La ruta `/portal/:token` está fuera del `ProtectedRoute` (pública).

### Roles globales
Campo `rol` en `usuarios_permitidos`:
- Sin campo (o cualquier valor ≠ 'admin') → usuario normal
- `'admin'` → accede a `/admin`, puede editar usuarios de cualquier empresa

### Roles por empresa
El map `miembros` en cada empresa define el rol por usuario:
- `owner` → puede eliminar la empresa, editar miembros
- `admin` → puede editar proyectos y tareas
- `miembro` → puede editar tareas
- `viewer` → solo lectura

### Reglas Firestore (resumen)
`firestore.rules` se prueba con `npm run test:rules` (emulador; requiere Java). **Correr las
pruebas antes de cada deploy de reglas.** Principios:
- **Tener sesión no basta.** Todo acceso exige `isUsuarioActivo()`: email en `usuarios_permitidos`,
  `activo == true` y `email_verified == true` (evita que alguien se registre con email/password
  usando el correo de un usuario permitido). El login también lo exige y envía el correo de verificación.
- **usuarios_permitidos**: cada quien lee su propio doc; el equipo lista; solo admins globales
  escriben (los demás solo pueden tocar `proyectosCompartidos` al compartir un proyecto).
- **Aislamiento por empresa**: proyectos, tareas, clientes, plantillas, comentarios, historial y
  líneas base solo los ve quien es miembro de la empresa o del proyecto compartido.
- **Rules are not filters**: toda query debe acotarse por `proyectoId`, `empresaId` (de empresas
  del usuario) o `tareaId`. Una query cross-empresa sin filtro es rechazada completa
  (por eso "Mis Tareas" consulta por empresa/proyecto y filtra en memoria).
- **portales**: el cliente solo hace `get` de un portal activo (no `list`: los tokens no se
  pueden enumerar) y escribe aprobaciones/solicitudes validadas (campos, longitudes,
  hora del servidor) dentro de un batch con sello anti-spam. Nunca lee proyectos ni tareas.
- **email_config**: solo el dueño, y `uid` debe coincidir con el ID del documento.
- **notificaciones**: cada quien lee las suyas y solo puede cambiar `leida`. Solo se crean en el
  mismo batch que una solicitud de cambio nueva y para uids en `portales/{token}.duenos`.

---

## Patrones clave

### Fases vs grupos (no son lo mismo)
- **Fase** = campo de texto `fase`. Es la **franja morada** que agrupa visualmente (buildHierarchy → `fase_header`).
- **Grupo** = tarea `tipo: 'grupo'` con subtareas (`parentId`); avance/fechas derivados (enrichTareas).
- **Numeración**: `tarea.numero` (del Sheet/importación) se muestra tal cual; si falta, `computeNumeros` la calcula.
- Dashboard → "Avance por fase" (default) o "Grupos" (toggle). La fase de una tarea hereda la de su ancestro.
  Orden de fases = orden de aparición (`orden`), con fallback por nombre natural (Fase 2 < Fase 10).

### Proyecto global (consolidado)
- `proyecto.subproyectos: string[]` (Editar proyecto → "Proyecto global"). No puede contener otro global.
- `ProyectoDetailPage` se suscribe a las tareas de cada subproyecto y arma `tareasVista`: copias con
  `fase = "<Subproyecto> · <fase>"` y `orden` desplazado. **Para editar se usa siempre `original(t)`**
  (nunca guardar la copia: la fase prefijada terminaría en la BD). En vista global: sin Tabla, sin
  reparentar ni dependencias en el Gantt; estados y fechas sí. Dashboard con vista "Proyectos".
- El portal del global publica la vista consolidada. Portafolio calcula su salud con las tareas de sus subproyectos.

### Portafolio (`/portafolio`)
- Salud: `calcularSalud` (`lib/saludUtils.ts`) = avance real vs esperado (lineal por fechas de cada tarea);
  rojo ≥20 pts de atraso / 3+ vencidas / bloqueo del cliente 7+ días; amarillo ≥8 pts / vencidas / bloqueadas.
- Bloqueos de todos los proyectos agrupados por cliente, con "Copiar para seguimiento".
- `bloqueadaDesde`: lo pone `actualizarTarea`/`crearTarea` (y el script de Sheets) al entrar a bloqueada; se
  borra al salir. Sin él se usa `actualizadoEn` como aproximación. Umbral `UMBRAL_BLOQUEO_DIAS` = 7.

### Otros (oct 2026)
- Sprints: `tarea.sprint` (columna "Sprint"/"Sprint propuesto"; ya no se confunde con Fase). Filtro `?sprint=`.
- Línea base en el dashboard: `LineaBaseComparacion` (desvío de fin por proyecto/fase/tarea).
- Resumen para el cliente: `lib/resumenCliente.ts` (sin bloqueos internos ni responsables).
- Borrado con subtareas: `EliminarTareasModal` (borrar todo o conservar subiendo un nivel).
- Historial: el script de Sheets registra en `historial_cambios` cada cambio ("Google Sheets · editor").
- Detección de columnas (script): por puntaje — nombre exacto principal > sinónimo exacto > parcial.

### Bloqueos y filtros
- `tarea.bloqueo`: `'interno' | 'cliente'` (solo relevante si `estado === 'bloqueada'`). Columna "Bloqueo" del
  Sheet/importador. Se ve en el modal de bloqueadas (pestañas), el panel de tarea y el portal
  ("Requiere acción de su parte" / "En gestión del equipo").
- Filtros de todas las vistas del cronograma: responsable, grupo, `?estado=` y `?bloqueo=interno|cliente|sin`
  (en la URL). Estado/bloqueo filtran tareas y conservan los grupos ancestros.
- Detección de columnas: "entrega" NO es palabra clave de fecha fin (chocaba con "Entregable");
  "Fecha Inicial/Final" sí se reconocen. Mantener alineados importador y script de Sheets.

### enrichTareas (`hierarchyUtils.ts`)
Función crítica que procesa las tareas antes de mostrarlas. Es recursiva con memoización (bottom-up):
- Los **grupos** derivan su `progreso`, `estado`, `fechaInicio` y `fechaFin` de sus hijos
- Tareas `completada` siempre aportan 100% al cálculo del padre (aunque tengan `progreso: 0` en BD)
- Grupos dentro de grupos funcionan correctamente (propagación multinivel)
- **El progreso de grupos NO se guarda en Firestore** — siempre se deriva en render time

Se llama en: `ProyectoDetailPage`, `TareasTabla`, `PortalClientePage`, `PrintView`. Cualquier cambio afecta todas las vistas.

### Cambios de estado → progreso automático
Al cambiar el estado de una tarea:
- `pendiente` → progreso = 0
- `en_progreso` con progreso = 0 → progreso = 50 (automático)
- `en_progreso` con progreso > 0 → se respeta el valor existente
- `completada` → progreso = 100

Aplica en: `ProyectoDetailPage`, `MisTareasPage`, `TareasTabla`.

### "Mis Tareas" — matching de responsables
`useMisTareas` busca tareas donde `asignadoA` o `asignadosA` coincida con:
1. Email del usuario
2. `displayName` de Firebase Auth
3. Cualquier alias en `usuarios/{uid}.aliases`

Si un usuario no ve sus tareas, hay que agregar el nombre usado en las tareas como alias en **Admin → Aliases**.

### Portal del cliente
URL pública `/portal/:token` sin autenticación. **Todo funciona en el plan gratuito (Spark), sin
Cloud Functions.** El token es un UUID (128 bits) en `portales/{token}`.

- **Datos que ve el cliente:** `ProyectoDetailPage` publica en `portales/{token}.publico` una copia
  filtrada (`construirDatosPortal` en `firestore.ts`): sin valor de venta, responsables,
  descripciones ni notas internas; las `notas` solo van en tareas bloqueadas (motivo de bloqueo).
  Se republica ~2 s después de cada cambio mientras alguien del equipo tiene el proyecto abierto
  (cambios hechos desde otras páginas se publican la próxima vez que se abra el proyecto).
  **Si agregas un dato al portal, agrégalo en `construirDatosPortal` — nunca abras reglas de tareas.**
- **El cliente** lo ve en tiempo real (onSnapshot): KPIs, tareas bloqueadas con su motivo, hitos y
  cronograma completo (Lista o Gantt solo lectura). Puede aprobar hitos completados y solicitar
  cambios. **Los comentarios del cliente están desactivados** (UI y reglas).
- **Solicitudes de cambio:** crean una notificación en la campana para los dueños del proyecto
  (`duenos`), en el mismo batch. El enlace abre `?portal=TOKEN` → pestaña Actividad. No hay email
  (requeriría Cloud Functions / plan Blaze).

### Google Sheets (Sheet → App, tiempo real)
Apps Script en `public/integraciones/cronogramas-sheets.gs` (+ `appsscript.json`), que la app
ofrece para copiar en **Herramientas → Google Sheets** (`SheetsSyncModal`). Sin Cloud Functions:
- El script se instala en el Sheet y escribe en Firestore por REST con el token OAuth de quien lo
  vinculó (`ScriptApp.getOAuthToken()`, scope `datastore`). Al ser credencial IAM, **no pasa por
  firestore.rules**: esa persona debe tener acceso IAM al proyecto de Firebase.
- Triggers instalables onEdit/onChange + respaldo cada 10 min. LockService evita corridas simultáneas.
- Solo filas con la casilla **Sincronizar**; la columna **ID App** guarda el id de la tarea.
- Tareas creadas así llevan `origen: 'sheets'`. Solo esas se actualizan/eliminan; las de la app no
  se tocan. Solo se escriben los campos cuyas columnas existen en la hoja.
- Escribe `proyectos/{id}.sheetSync` (url, nombre, ultimaSync, filas, error) → badge en el proyecto.
- Lógica de columnas/jerarquía espejo de `ImportarTareasModal` (mantener ambas alineadas).
- Tras cada cambio el script también republica la copia pública de los portales activos
  (misma forma que `construirDatosPortal`; `publicoHash` = `sheets-…`, la app republica una vez al abrir).
- Grupo solo si `Tipo = grupo` o la fila tiene hijos (numeración 3 → 3.1 o columna Padre/Grupo).
- Plantilla: `public/integraciones/plantilla-cronograma.csv` (descargable desde el asistente).
- **Al cambiar el script hay que volver a pegarlo en cada Sheet vinculado** (no se actualiza solo).

### COR (COR → App)
Apps Script `public/integraciones/cronogramas-cor.gs`, instalado en un Google Sheet "Panel COR" (uno para
todas las empresas). Asistente en **Herramientas → COR** (`CorSyncModal`).
- API: `https://api.projectcor.com/v1`, OAuth2 client credentials (`Authorization: Basic base64(key:secret)`,
  token 1 h, cacheado). Una instancia por empresa; llaves en Script Properties (`cor:<nombre>`), nunca en la hoja.
- Pestaña "Vinculaciones": Instancia | ID proyecto COR | Proyecto COR | Enlace Cronogramas | Última sync | Resultado.
- Cada 10 min (trigger): `/tasks` (filtro projects), `/hours` (suma `duration` por tarea),
  `/tasks/{id}/collaborators` (cacheado 6 h). Doc id `cor_<idCOR>`, `origen: 'cor'`, `corId`,
  `horasTrabajadas`, `horasEstimadas` (suma `estimated_by_user`). Estados: nueva→pendiente,
  en_proceso→en_progreso, estancada→bloqueada, finalizada→completada. Prioridad 0–3 → baja..critica.
- Solo toca tareas `origen: 'cor'`; borra las que ya no están o se archivaron. Historial "COR · instancia".
  Escribe `proyectos/{id}.corSync` (badge) y republica portales. Sin webhooks en la API de COR.
- **Jerarquía**: `padreDe(t)` prueba parent_id / task_parent_id / parent_task_id / parent{id}… (no documentado).
  Raíz con subtareas y sin fase propia → es la **fase** de sus descendientes (no se crea como tarea);
  madres intermedias → `tipo: 'grupo'` con `parentId: cor_<madre>`; orden = recorrido en profundidad.
- **Fase**: etiqueta que empiece por "Fase"/"F1…" > categoría > prefijo "[Fase X]" en el título (se quita del título).
  Las subtareas heredan la fase del ancestro más cercano que la tenga.
- **[Interno]**: tareas con ese prefijo en el título (y sus descendientes) no se sincronizan; si ya estaban, se borran.
  "COR → Diagnóstico" muestra los campos que envía COR para una tarea.
- **Multiusuario**: solo la cuenta con IAM en Firebase escribe. Ella activa el trigger `tick` (cada minuto:
  sincroniza si hay `pendiente` en Script Properties o pasaron 10 min). Usuarios sin acceso (otro dominio)
  vinculan y piden "Sincronizar ahora" → se marca `pendiente`. Las vinculaciones se validan al sincronizar.

### Búsqueda global (Cmd+K)
`SearchModal` carga todas las tareas y proyectos del usuario al abrirse. Las queries de Firestore con `in` están divididas en chunks de 10 (límite de Firestore). Navega a `/empresa/:id/proyecto/:id?tarea=:id` para abrir el panel de tarea directamente.

### Plantillas de proyectos
`PlantillasModal` permite guardar la estructura de tareas de un proyecto como plantilla (sin fechas absolutas) y aplicarla a proyectos nuevos o existentes. Se guardan en la colección `plantillas/` con `empresaId`.

### Líneas base
`LineasBaseModal` permite crear snapshots del cronograma en cualquier momento. Cada línea base guarda un array con todas las tareas del proyecto. En la vista Gantt se pueden comparar con el estado actual para ver desviaciones.

### Toast
`ToastProvider` envuelve toda la app en `App.tsx`. Uso:
```ts
const { toast } = useToast()
toast('Mensaje', 'success' | 'error' | 'warning' | 'info')
```

### Notificaciones in-app
`useNotificaciones` filtra tareas vencidas o que vencen hoy/mañana/esta semana. El estado "leído" persiste en `localStorage`. La campana aparece en el footer del Sidebar.

### Undo / Redo
`useUndoStack` implementa un stack de deshacer vía `Ctrl+Z`. Las operaciones se registran manualmente desde `TareasTabla` y `ProyectoDetailPage`.

### Z-index del sticky header
El header del proyecto (`ProyectoDetailPage`) usa `z-40` para quedar por encima del Gantt (que usa hasta `z-30`). Los dropdowns dentro del header usan `z-50`. El menú "Herramientas" del topbar tiene `z-50` para quedar sobre el Gantt.

---

## Features implementadas (inventario completo)

### Gestión de proyectos
- [x] CRUD de empresas, clientes y proyectos
- [x] Jerarquía empresa → cliente → proyecto
- [x] Valor de venta y objetivo por proyecto
- [x] Roles por empresa (owner/admin/miembro/viewer)
- [x] Invitaciones por email
- [x] Plantillas de proyectos (guardar y aplicar estructura)

### Tareas
- [x] CRUD con edición inline en tabla
- [x] Jerarquía de subtareas (padre/hijo, grupos multinivel)
- [x] Tipos: tarea / grupo / hito
- [x] Múltiples responsables (`asignadosA`)
- [x] Prioridades, fases, dependencias
- [x] Progreso automático de grupos (bottom-up recursivo, solo en render)
- [x] Estado → progreso automático
- [x] Arrastrar para reordenar (drag & drop en Tabla y fases)
- [x] Cascade de fechas en dependencias
- [x] Undo/Redo (Ctrl+Z)
- [x] Bulk edit (selección múltiple → cambiar estado/responsable/eliminar)
- [x] Importar desde CSV/Excel
- [x] Comentarios por tarea (con historial)
- [x] Historial de cambios por tarea (auditoría)
- [x] Links y entregables
- [x] Colapsar/expandir fases

### Vistas
- [x] Lista (con colapso de fases)
- [x] Tabla (edición inline, bulk select)
- [x] Kanban (drag entre columnas de estado)
- [x] Gantt (drag & resize, dependencias, ruta crítica, líneas base, zoom)
- [x] Carga (workload por responsable, semana a semana)
- [x] Dashboard por proyecto (KPIs, hitos, avance por fase, salud del proyecto)

### Cross-proyecto
- [x] Dashboard global (tareas urgentes, proyectos activos)
- [x] Mis Tareas (cross-proyecto, por usuario con aliases)
- [x] Búsqueda global Cmd+K
- [x] Notificaciones in-app (campana con badge)

### Portal del cliente
- [x] Generación de link único público (UUID token)
- [x] Vista pública: KPIs, progreso, hitos, cronograma
- [x] Aprobación de hitos por el cliente (sin cuenta)
- [ ] ~~Comentarios del cliente en el portal~~ (desactivados a pedido, oct 2026)
- [x] Solicitudes de cambio del cliente → el PM puede convertirlas en tarea
- [x] Panel interno "Actividad" en PortalModal para que el PM vea todo

### Exportación y reportes
- [x] PDF ejecutivo de cliente (portada, KPIs, progreso, hitos, ruta crítica, cronograma…)
- [x] Exportar CSV
- [x] Resumen semanal para copiar y pegar (Ajustes → Resumen semanal y dashboard del proyecto; no se envía email)
- [x] Procesamiento AI de emails con Groq (llama-3.3-70b)

### Admin
- [x] Control de acceso (lista blanca `usuarios_permitidos`)
- [x] Gestión de aliases por usuario (para matching en "Mis Tareas")
- [x] Configuración de email y API key Groq por usuario (en Settings)

---

## Consideraciones y quirks conocidos

1. **Firebase token CI expira:** La cuenta smdigital.com.co tiene restricciones OAuth de Workspace. Usar siempre `firebase login:ci` para obtener un token persistente, guardarlo en `~/.zshrc` como `FIREBASE_TOKEN`. Cuando expire, repetir el proceso.

2. **Aliases para "Mis Tareas":** Si un usuario no ve sus tareas, las tareas están asignadas con un nombre que no coincide con su email ni displayName. Solución: Admin → Aliases → agregar el nombre usado.

3. **Firestore `in` limitado a 10:** Las queries con `where('x', 'in', ids)` están divididas en chunks de 10. Ver `fetchTareasGlobal` y `fetchProyectosGlobal` en `firestore.ts`.

4. **enrichTareas en múltiples lugares:** `ProyectoDetailPage`, `TareasTabla`, `PortalClientePage`, `PrintView`. Cualquier cambio en la lógica de enriquecimiento afecta todas las vistas.

5. **Progreso de grupos NO se guarda en Firestore:** Es siempre derivado de los hijos en tiempo de render. Lo que está en BD es el progreso de las tareas hoja.

6. **Portal público sin auth:** La ruta `/portal/:token` está FUERA del `ProtectedRoute`. `PortalClientePage` no usa `useAuth`; solo lee `portales/{token}` y sus subcolecciones públicas.


7. **Gantt z-index:** El Gantt usa hasta `z-30`. El header sticky del proyecto usa `z-40`. El dropdown "Herramientas" del topbar usa `z-50`. Respetar esta jerarquía al agregar elementos flotantes.

8. **API key de Groq por usuario:** No va en variables de entorno. Cada usuario la configura en Ajustes y se guarda en `email_config/{uid}.groqApiKey` en Firestore.

9. **Gmail App Password:** El envío de emails usa SMTP directo con la cuenta Gmail del usuario y un App Password de Google (no la contraseña normal). El usuario debe tener la verificación en 2 pasos activa y generar un App Password en su cuenta Google.

10. **Plan Spark (gratuito):** el proyecto NO puede desplegar Cloud Functions. El código de `functions/` (email semanal, procesamiento de emails con IA) no está desplegado, así que esas funciones de la app no operan en producción. Nada nuevo debe depender de Cloud Functions salvo que se pase a Blaze.
