# Real Estate Platform — Guía del proyecto

SaaS **multi-tenant** para inmobiliarias: plataforma base ("plantilla") que cada inmobiliaria
usa como "«su nombre» platform" con su propio design system encima del base.
Micrositios públicos white-label + dashboard interno + módulos vendibles con billing.

Stack: **Turborepo + pnpm** · **Next.js (dashboard, tenant-site) en Vercel** ·
**Hono + Node 24 (api) y BullMQ (workers) en Railway** · **PostgreSQL 18 + Drizzle** ·
**Better-Auth · Cloudflare R2 · Resend · Sentry** (sin Stripe — cobro por factura).

El repo hermano `../real-estate` (Express + Prisma) es el laboratorio original:
de ahí se portan **conceptos**, nunca código.

---

## Comandos esenciales

```bash
# Raíz del monorepo — DESARROLLO (con hot-reload). NO usar `next start` para desarrollar.
pnpm dev:up           # limpia puertos + docker compose up -d (db+redis) + turbo dev
pnpm dev              # limpia puertos + turbo dev (infra ya levantada)
pnpm dev:clean        # mata procesos de dev colgados y libera 3000-3002
pnpm infra:up         # solo docker compose up -d (db + redis)
pnpm infra:down       # docker compose down
pnpm build            # turbo build (producción; para verificar, NO para desarrollar)
pnpm lint             # turbo lint
pnpm test             # turbo test

# Base de datos (desde packages/db/)
docker compose up -d db   # ¡desde la raíz! Postgres 18 en puerto 5433
pnpm db:generate      # genera migración tras cambiar el schema
pnpm db:migrate       # aplica migraciones
pnpm db:seed          # seed idempotente (2 tenants: martinez, lopez)
pnpm db:studio        # Drizzle Studio

# Puertos fijos
# dashboard :3000 · tenant-site :3001 · api :3002 · postgres :5433 (host) · redis :6379
```

**Desarrollo del frontend**: usar SIEMPRE `pnpm dev`/`dev:up` (hot-reload vía
`next dev` + `tsc --watch` de los packages). NUNCA `next start` (build de producción,
sin reload) para desarrollar. Si algo "se cae" o hay que "tirar todo": suele ser un
`turbo dev` a medias (watchers vivos, servidores Next muertos por choque de puertos)
→ `pnpm dev:clean` y volver a `pnpm dev`. Los hooks `predev`/`predev:up` ya limpian
puertos automáticamente antes de arrancar.

**Gotcha de CSS obsoleto**: el HMR de CSS de Next dev a veces se atasca y sigue
sirviendo estilos VIEJOS aunque el archivo en disco esté bien (se ve el cambio en el
código pero no en el navegador). Ante cualquier duda de "no se aplica mi cambio de
CSS/tokens", usar **`pnpm dev:fresh`** (limpia puertos + borra `apps/*/.next` +
levanta). Verificar cambios de estilo SIEMPRE con la CSS fresca, no fiarse del HMR.

**Carga de fuentes (IMPORTANTE)**: las fuentes se cargan con **`next/font/local`**
en cada app (`apps/*/app/fonts.ts`, ficheros en `apps/*/app/fonts/*.woff2`), NO con
`@fontsource` + `@import` (era frágil: generaba `format("woff2-variations")`, un
string no estándar que Chrome/Safari rechazan → fallback a Arial). next/font expone
`--font-display` / `--font-body`, que los tokens de `@rep/ui` (`--ui-font-*`) y
`@rep/ui-tenant` (`--tenant-font-*`) consumen. Al añadir/cambiar la fuente base:
sustituir el `.woff2` en `apps/*/app/fonts/` y ajustar `fonts.ts`. Los `fonts.css`
de los packages están vacíos a propósito.

---

## Arquitectura

```
apps/
  dashboard/      # Next.js — dashboard privado de la inmobiliaria
  tenant-site/    # Next.js — micrositios públicos white-label (tenant por Host header)
  api/            # Hono — REST. src/app.ts sin listen() (testeable), src/server.ts con listen
  workers/        # BullMQ — jobs asíncronos (IA, sync portales, media). Activo en Fase E
packages/
  config/         # @rep/config — env con Zod, fail-fast, un slice por app (api, dashboard…)
  db/             # @rep/db — schema Drizzle + migraciones + seed + tenant scoping
  auth/           # @rep/auth — wrapper Better-Auth multi-tenant (Fase B, paso 5)
  ui/             # @rep/ui — design system interno del dashboard: tokens --ui-* +
                  #   primitivos du-* (Button/Input/Select/Label/Card/Badge). NO personalizable
  ui-tenant/      # @rep/ui-tenant — design system white-label (base "Dwell")
  modules/        # @rep/modules — feature flags por tenant + gestión superadmin
  queue/          # @rep/queue — BullMQ; enqueue no-op sin Redis (local)
  storage/        # @rep/storage — driver local (fs) por defecto · R2 en prod
  email/          # @rep/email — driver console por defecto · Resend en prod
```

### Infraestructura con drivers (local por defecto, cloud por env)
- **Regla**: los módulos usan SIEMPRE la interfaz (`getStorage()`, `getEmailer()`,
  `enqueue()`), nunca el cliente concreto. El driver se cambia por variable de
  entorno sin tocar código.
- **Local (sin credenciales)**: `@rep/queue` sin `REDIS_URL` → `enqueue` no-op y
  workers idle · `@rep/storage` `STORAGE_DRIVER=local` (filesystem) ·
  `@rep/email` `EMAIL_DRIVER=console` (loguea, no envía).
- **Cloud**: `REDIS_URL` (Redis) · `STORAGE_DRIVER=r2` + `R2_*` · `EMAIL_DRIVER=resend`
  + `RESEND_API_KEY`. Los SDK pesados (AWS, Resend) se cargan de forma perezosa.

### Multi-tenancy (decisión estructural)
- **Shared database + shared schema**: cada tabla tenant-scoped lleva `tenant_id`.
- El tenant se resuelve por **Host header** en tenant-site y por **sesión** en dashboard/api.
- Toda query a tablas tenant-scoped pasa por el scoping de `@rep/db` — **nunca**
  un `db.select()` directo sobre esas tablas en handlers.
- El test de aislamiento (tenant A no puede leer datos de B) es innegociable y debe
  seguir pasando siempre.

### Módulos como plugins (feature flags)
- Catálogo en tabla `modules`; activación por tenant en `subscriptions`.
- **Sin Stripe/billing**: los módulos se activan/desactivan desde un **dashboard de
  superadmin** y el cobro es **por factura** (offline). La tabla `subscriptions`
  es la **fuente de verdad directa**. Backend: `requireModule(code)`.
  Frontend: `useModule(code)`. Tras togglear un módulo → `invalidateModules(tenantId)`.
- Superadmins de plataforma en tabla `platform_admins` (distinto de las memberships
  de tenant). Rutas `/admin/*` protegidas por `requirePlatformAdmin`.
- Cada módulo vive aislado (componentes + rutas + jobs + migraciones propias).
  El core solo expone auth, tenant context, DB y colas.

### El design system NO lo edita el cliente (principio de producto)
- Cada inmobiliaria recibe SU design system personalizado, **diseñado y entregado por
  la plataforma (superadmin)** — es el valor que se paga. El cliente **NUNCA** edita
  colores/radios/tipografía. El `brand_config` (design system) se configura desde el
  superadmin, no desde el dashboard del cliente.
- El cliente SÍ edita: su **logo** (Ajustes → subir logo), su **contenido**
  (site_config, editor Micrositio) y sus **datos** (propiedades/clientes).
- Ajustes del cliente = logo + su diseño en solo-lectura ("gestionado por nosotros").
  API `/tenant/brand`: GET + `POST/DELETE /logo` (owner). NO hay PATCH de design system
  para el cliente. (Pendiente: editor de design system en el superadmin.)

### Dashboard de la inmobiliaria (revisión de concepto — jul 2026)
- El dashboard es **module-first y white-label TOTAL**. El cliente entra y ve SU
  marca (logo/colores/tipografía vía `brand_config` → `brandConfigToUiVars` que tiñe
  los tokens `--ui-*` con guardarraíles de contraste) y SUS herramientas funcionando.
- **NUNCA** se muestra al cliente el estado técnico "módulo activo/inactivo": si
  tiene el módulo, aparece su sección en el sidebar; si no, no existe para él.
  La activación/desactivación y los dominios son cosa **solo del superadmin** (`/admin`).
- Secciones = módulos (`lib/modules.ts` → `MODULE_SECTIONS`): Clientes, Propiedades,
  Contabilidad, Chatbot, Micrositio. Config de marca/dominio en **Ajustes**.
- Guard: `useRequireModule(code)` protege cada sección (redirige a Inicio si no la tiene).
- Público objetivo: clientes inmobiliarios, no programadores → producto "ya mascado".

### Design system white-label — 3 capas
1. **Base "Dwell"** (`packages/ui-tenant`): tokens `--tenant-*` + componentes signature.
   Referencia original: `~/Downloads/dwell-design-system.html`
   (3 colores #FBFBFB/#878787/#000 · Archivo + Neue Montreal · radius 0 en fotos/cards ·
   pill SOLO en botones). Sin configurar nada, todo tenant se ve Dwell.
2. **`tenants.brand_config`** (jsonb): colores, fuentes, radius, logo → CSS variables
   inyectadas en runtime. Cero código, cero deploy. Cubre al 90% de clientes.
3. **Themes dedicados**: paquetes que EXTIENDEN la base (tokens + overrides de
   componentes concretos). **Nunca forks, nunca copiar código de la capa 1.**

---

## Reglas obligatorias (no negociables)

### Git
- **Commits SIN coautoría de IA.** Nunca añadir `Co-Authored-By: Claude...` ni
  "Generated with Claude Code" a los mensajes de commit — el autor es solo Gorka
  y no debe aparecer ningún asistente como colaborador en GitHub.
  (La historia se reescribió el 18-jul-2026 para eliminar los trailers antiguos;
  `.claude/settings.json` fija `includeCoAuthoredBy: false` a nivel de harness.)

### Configuración y secretos
- **Cero hardcode.** Todo valor configurable va en env vars, validadas con Zod en
  `@rep/config` (un slice por app — una app nunca ve secretos de otra). Fail-fast.
- Variable nueva → añadirla al slice **y** al `.env.example` de esa app.
- Las `NEXT_PUBLIC_*` se referencian explícitamente (`process.env.NEXT_PUBLIC_X`),
  nunca con clave dinámica (Next las inlinea en build).
- **Nunca commitear `.env`**, solo `.env.example`.

### Seguridad y tenancy
- Ninguna query tenant-scoped sin tenant en contexto: si falta, **excepción**, jamás
  datos vacíos ni fallback silencioso.
- Passwords hasheadas siempre; tokens nunca en logs; refresh tokens hasheados en BBDD.
- `accessToken` solo en memoria en el cliente; cookies httpOnly con `credentials: 'include'`.

### BBDD y Drizzle
- Cambio de schema → `pnpm db:generate` y la migración se commitea junto al cambio.
- Seeds **idempotentes** (upsert por slug/email/code), ejecutables N veces.
- Postgres 18: el volumen Docker se monta en `/var/lib/postgresql` (no en `.../data`).

### Tests
- Integración contra la app real (`app.request()` de Hono) y BBDD real en Docker.
- Un test nunca asume estado previo: limpia sus datos en `beforeEach`.

### Estilo
- TypeScript strict en todo el monorepo (hereda `tsconfig.base.json`).
- Los packages internos se importan como `@rep/<nombre>` con `workspace:*`.

---

## Estado del proyecto

Fases A–E del núcleo **completas salvo el deploy**. Migraciones hasta `0015`.
Detalle fino de cada cambio: historia de git. Aquí, solo lo que hay y dónde.

### Núcleo e infraestructura
- Monorepo Turborepo + pnpm. `@rep/config`: env con Zod fail-fast, un slice por app.
- Postgres 18 + Drizzle. Tenancy: `withTenant`/`tenantDb` (scoping inescapable) +
  `tenantMiddleware` (header `x-tenant-slug` o subdominio/`custom_domain`). **Los
  tests de aislamiento A/B son innegociables.**
- Auth: Better-Auth en `@rep/auth` (email/password, scrypt, cookies httpOnly). SIN
  plugin organizations — `tenants`/`memberships` propias son la fuente de verdad.
  Middlewares `authMiddleware`/`requireMembership`/`requireRole`; `/me` da `isPlatformAdmin`.
- Feature flags: `@rep/modules` (`hasModule`/`getActiveModules`/`invalidateModules`,
  caché memoria TTL). `requireModule(code)` → 403. Superadmin: `platform_admins` +
  `requirePlatformAdmin`, `setTenantModule`, rutas `/admin/*`. **Cobro por factura, sin Stripe.**
- Infra con drivers (local por defecto, cloud por env): `@rep/queue` (BullMQ, no-op
  sin `REDIS_URL`), `@rep/storage` (LocalStorage fs / R2), `@rep/email` (console / Resend).
  `app.use("/uploads/*", serveStatic)` sirve media local en dev.
- [ ] **Paso 11 — Deploy** (Vercel + Railway, GitHub Actions, Sentry). PENDIENTE.

### Dashboard (`@rep/ui`)
- DS interno `@rep/ui`: tokens `--ui-*`, primitivos `du-*`, fuentes self-hosted.
  Prohibido color/tamaño arbitrario en componentes — todo sale de `--ui-*`.
- Shell `app/(app)/` (guard + `WorkspaceProvider` + `DashboardShell`). Sidebar =
  secciones funcionales gateadas por módulo (**module-first**: nunca se muestra
  "activo/inactivo" al cliente). `useRequireModule` protege cada sección.
- White-label total: un solo `brand_config.theme` tiñe dashboard + micrositio
  (`data-theme`). Modo oscuro: `data-mode` en `.dash-shell`, persistido en localStorage.
- Panel `/admin`: alta de inmobiliarias, toggle de módulos (`du-switch`), tema,
  dominio propio, y **editar el micrositio de cualquier tenant** (onboarding):
  `/admin/tenants/[slug]/micrositio` reusa el `<Editor>` del owner con la fuente
  `api.adminSite` (endpoints `/admin/tenants/:slug/site` + `/media`, gateados por
  `requirePlatformAdmin` en vez de membership). El `Editor` es fuente-agnóstico
  (`SiteEditorApi` inyectable) → mismo componente para owner y superadmin.

### Módulos
Todos tenant-scoped, patrón `apps/api/src/modules/<x>/`, guardas
tenant→auth→membership→`requireModule`. UI de cliente en `apps/dashboard/app/(app)/`.
- **clients** (CRM): stage, `kind` (owner/renter/buyer/…), cuota, notas; perfil
  `/clientes/[id]` con timeline. Auto-clasificación en captación.
- **properties**: operation/kind/status/precio/…, fotos + vídeos (multipart),
  `owner_client_id`. Público: `GET /tenant/listings` (solo `published`).
- **valuation**: widget "Valora tu piso" (estimación €/m² desde comparables
  publicados del propio tenant) → lead de propietario.
- **visits** (agenda): `POST /tenant/visits/request` público + gestión privada con
  detección de choques (409 `slot_conflict`).
- **owner_portal**: enlace por token capability (`/portal/[token]`, público
  server-side, `noindex`) — el dueño ve rendimiento sin cuenta; detalle por
  inmueble con tabs + gráfico SVG. Conexión con **rentals** por
  `properties.owner_client_id` (la identidad del inquilino NUNCA se expone).
  El portal muestra el **contrato relevante** por inmueble: el activo, o el más
  reciente aunque esté finalizado (`isMoreRelevant`) — sus cobros del año siguen
  contando como ingresos reales (`PortalRental.active`); solo los "meses
  pendientes" se limitan a contratos vigentes. Lista y detalle usan la MISMA
  selección (antes divergían: la lista solo miraba activos → el neto del año
  desaparecía al finalizar el contrato).
- **rentals**: contratos + `rental_payments` + rendimiento en el portal. Listado
  `/alquileres` **por tarjetas** (foto del inmueble, renta, cobro del mes en un clic,
  mini-historial de 4 meses + tira de stats) con sección "Disponibles para alquilar"
  (inmuebles `operation=rent` sin contrato de piso entero activo → "Crear contrato"
  preselecciona el inmueble). Página de gestión por contrato `/alquileres/[id]`
  (`GET /tenant/rentals/:id` → `getRentalDetail`): inquilino y propietario vinculados a
  sus clientes del CRM, historial de cobros mes a mes (desde el inicio del contrato),
  edición de renta/notas y finalización.
- **Alquiler por habitaciones**: tabla `property_rooms` (habitaciones de un inmueble)
  + `rentals.room_id` (NULL = piso entero). Un piso puede tener VARIOS contratos
  activos, uno por habitación. Guard en `createRental`: piso entero ⇄ incompatible con
  cualquier activo; por habitación ⇄ incompatible con piso entero activo o con la misma
  habitación ya ocupada (`room_occupied`/`active_rental_exists`, 409). CRUD de
  habitaciones en `/tenant/rooms` (`rooms.routes/service/schema`, gate `rentals`); no se
  borra una habitación con contrato activo. Alta de contrato: selector "Piso entero /
  Por habitación" con creación inline de habitaciones. El portal **agrega el inmueble**:
  total (renta/cobrado) + **desglose por habitación** (`PortalRental.rooms[]`, `byRoom`)
  tanto en la lista como en el detalle; `relevantRentalsOf` toma todos los activos.
- **accounting**: `invoices` (`direction` income/expense, IVA en bps, pagos
  parciales, PDF de `income` con pdfkit), páginas de cuenta por inmueble/cliente.
  Absorbió el antiguo `property_expenses`. UI: `SummaryCard` con icono+acento;
  los movimientos son una **lista** (no tabla) con indicador de dirección
  (verde entra / rojo sale), concepto + metadatos en una línea, importe con signo
  y estado; `InvoiceTable` compartido por la página principal y las cuentas.
- **microsite**: ver abajo. Bloqueado por alta externa: **whatsapp_bot** (Meta).

### Micrositio (`tenant-site` + `@rep/ui-tenant`)
- 3 capas: `brand_config` (marca) / `site_config` (contenido) / properties (datos).
  Resuelto por Host en `proxy.ts` → reescribe a `/s/<slug>`; ISR `revalidate=60`.
- DS white-label `@rep/ui-tenant`: MOTOR `base.css` (componentes `rt-*`, solo
  variables) + `tokens.css` (contrato) + `themes/<id>.css` (`dwell`, `costa`).
  Añadir tema a medida = copiar `_template.css`, `@import` en `index.css`, asignar
  `brand_config.theme`. Registro `THEMES` en `@rep/ui` (mantener sync).
- **Motor de secciones**: el cuerpo del micrositio es `site_config.sections[]`
  (ordenable/activable, dentro del jsonb → sin migración). `SiteSection` = unión
  discriminada (hero/properties/valuation/stats/testimonials/faq/**split** =
  imagen+texto). Registro en `app/s/[tenant]/sections.tsx` (**añadir sección = 1
  entrada + 1 Body**); cada Body recibe `index` para alternar layout/fondo.
  `resolveSections` retrocompatible (deriva de campos planos). Editor = gestor de
  secciones (`apps/dashboard/lib/microsite-sections.ts`, campos data-driven:
  text/textarea/select/list/media). Dos puertas: contenido (`enabled`) vs producto
  (`moduleGate`). Footer/contacto = "chrome" (campos planos, fuera del motor).
  **Variedad visual automática**: `page.tsx` envuelve cada sección en `.rt-band`
  con fondo alterno por posición (`.rt-band--alt`); la sección `split` alterna el
  lado de la imagen (izq/der) según `index`. Cero config para el cliente.
- Hero: plantillas editorial/minimal/bold + media de fondo self-serve
  (`backgroundImageUrl`/`backgroundVideoUrl` → hero "cover" `100svh`, vídeo manda).
  Header (`rt-topbar`, layout grid 3 zonas: logo · nav centrado · CTA a #contacto)
  con opciones editables en `site_config`: `headerStyle` ("floating" pastilla
  glass fixed / "solid" barra sólida glass / "transparent" transparente sobre el
  hero, logo izq · nav der, que pasa a cristal + texto oscuro al hacer scroll vía
  `HeaderScroll` cliente que marca `.is-scrolled`; en páginas sin hero fuerza el
  sólido), `headerBrand`
  ("logo"/"text", `TopbarBrand`), `logoScale` (×1–×2, vía `--rt-logo-scale` en
  `.rt-root`). **Navbar dinámico**: cada sección con ancla define si sale en el
  menú vía `section.navLabel` (control "Mostrar en el menú" + etiqueta por sección
  en el editor). `navLabel` undefined → default del tipo (properties/valuation
  salen, resto no); `""` = oculto; texto = etiqueta custom. `effectiveNavLabel` +
  `sectionNavItems` en sections.tsx. Animaciones sutiles: **Motion** (Framer
  Motion) con `LazyMotion`+`domAnimation` (bundle mínimo) → `RevealList` anima el
  fade-up de cada sección al entrar en viewport (una vez); Ken Burns del hero por
  CSS. Todo respeta `prefers-reduced-motion` (`useReducedMotion` → sin animar).
- Captación: leads/valoración/visitas públicos con honeypot + throttle en memoria
  (`leads/public-intake.ts`). CORS: rutas públicas del micrositio reflejan cualquier
  origen (dominios de tenant dinámicos); el resto, `TRUSTED_ORIGINS`.
- **Dominios propios**: resolución hecha (`custom_domain`, `GET /public/resolve-domain`,
  proxy con caché). Falta **Block 3** (aprovisionar + TLS en Vercel, solo prod).
  Ref: `docs/dominios-propios.md`.

### Gotchas y deuda
- **zod v4**: `.partial()` re-aplica los `.default()` → los PATCH parciales reseteaban
  enums. Los update schemas van sin defaults (enums opcionales).
- **next/font**: fuentes vía `next/font/local` (NO `@fontsource` + `@import`). Ver
  la nota de fuentes arriba.
- **CSS HMR obsoleto** de Next dev: verificar estilos siempre con `pnpm dev:fresh`.
- **MobileNav**: el overlay se portalea a `.rt-root` (el `backdrop-filter` del topbar
  crea containing block de los `fixed`; fuera de `.rt-root` se pierden fuentes/tema).
- **dataviz** (gráfico del portal): identidad de serie por MODO DE RELLENO (sólida vs
  hueca), no por color — los temas white-label no garantizan separación cromática.
- **Seed**: autoritativo SOLO para los MÓDULOS (fija el estado exacto en
  `subscriptions`). PRESERVA `brand_config` y `site_config` de tenants ya
  existentes (contenido editable del cliente: logo, tema, portada, secciones) —
  solo los aplica al CREAR el tenant. Re-ejecutar el seed NO borra ediciones.
- [ ] Deuda anotada: `isPublicMicrositePath` → sub-app con CORS propio; throttle a
  Redis multi-instancia; helpers `tenantGet/tenantPost` en tenant-site.
- [ ] Pendiente: deploy (Paso 11); Block 3 dominios (Vercel TLS); theming/fuentes por
  inmobiliaria + edición de marca en Ajustes; Blog (submódulo de pago del micrositio).
