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

## Registro de pasos (actualizar al completar cada paso)

### Fase A — Esqueleto
- [x] **Paso 1** — Monorepo Turborepo: 4 apps (dashboard, tenant-site :3001, api, workers)
      + 5 packages stub. `turbo build` 5/5 verde. _(commit `feat: monorepo Turborepo…`)_
- [x] **Paso 2** — `@rep/config`: env con Zod fail-fast, slices por app
      (`/api`, `/dashboard`, `/tenant-site`, `/workers`). Verificado: `PORT=abc` → exit 1.

### Fase B — Datos y tenancy
- [x] **Paso 3** — Postgres 18 (Docker :5433) + Drizzle: schema núcleo
      (`tenants`, `users`, `memberships`, `modules`, `subscriptions`),
      migración `0000`, seed idempotente (probado 2×): tenants `martinez`
      (microsite activo, brand_config custom) y `lopez` (defaults Dwell).
- [x] **Paso 4** — Tenant context (`withTenant`/`requireTenantId`, AsyncLocalStorage)
      + scoping `forTenant()`/`tenantDb()` en `@rep/db` (select/insert/update/delete
      con filtro tenant_id inescapable) + `tenantMiddleware` en Hono (header
      `x-tenant-slug` o subdominio del Host) + **12 tests de aislamiento A/B**
      (leer/modificar/borrar cross-tenant forzando ids → imposible; sin contexto → excepción).
- [x] **Paso 5** — Better-Auth en `@rep/auth` (email/password, sesiones httpOnly,
      scrypt). Decisión: SIN plugin de organizations — `tenants`/`memberships`
      propias siguen siendo la fuente de verdad del multi-tenancy. Tabla `user`
      de Better-Auth sustituye a `users`. Middlewares: `authMiddleware` (401),
      `requireMembership` (403 cross-tenant), `requireRole(...)`. Rutas: `/api/auth/*`,
      `/me`, `/tenant/team` (privada). Seed de owners vía `auth.api.signUpEmail`
      (password en `SEED_OWNER_PASSWORD`, idempotente). 20 tests en verde.

### Fase C — Feature flags y gestión de módulos
- [x] **Paso 6** — `@rep/modules`: `hasModule`/`getActiveModules`/`invalidateModules`
      con caché en memoria (TTL 60s, `MODULE_CACHE_TTL_MS`) detrás de la interfaz
      `FlagCache` → swap a Redis en Fase E vía `setFlagCache()`. API:
      `requireModule(code)` (403 `module_not_active`), `GET /tenant/modules`,
      demo gateada `GET /tenant/microsite`. 28 tests en verde.
      (`useModule` del dashboard llega cuando el dashboard se conecte a la API.)
- [x] **Paso 7** — Gestión de módulos por superadmin (SIN Stripe, cobro por factura).
      Tabla `platform_admins` + `requirePlatformAdmin`. `@rep/modules`:
      `setTenantModule(tenantId, code, active)` (upsert en `subscriptions` +
      `invalidateModules`), `listCatalog`. Rutas `/admin/*`: `GET /admin/catalog`,
      `GET /admin/tenants` (con `activeModules`), `PUT /admin/tenants/:slug/modules/:code`
      `{active}`. Seed añade superadmin (`SEED_ADMIN_EMAIL`). E2E verificado:
      admin activa módulo → ruta gateada del tenant pasa de 403 a 200. 37 tests en verde.

### Fase D — White-label y micrositio
- [x] **Paso 8** — `@rep/ui-tenant`: design system white-label base "Dwell".
      Tokens `--tenant-*` (defaults Dwell) en `styles/tokens.css`; clases `rt-*`
      en `dwell.css`; fuentes self-hosted (Archivo + Hanken Grotesk vía
      `@fontsource-variable`, sin CDN). `brand.ts`: `brandConfigToCssVars` /
      `brandConfigToStyleString` (Capa 2 — override en runtime). 8 componentes
      signature React (WordmarkBleed, AboutColumns, BigNumber, PhotoPair,
      PillButton/PillLink, Steps, MobileMenu, Footer). Estilos exportados como
      `@rep/ui-tenant/styles.css`. 14 tests (SSR + white-label). Preview visual:
      `scripts/build-preview.tsx` → `preview.html` (gitignored). Se cablea al
      tenant-site en el paso 9.
- [x] **Paso 9** — tenant-site cableado: `proxy.ts` (antes middleware — Next 16
      renombró la convención) resuelve el tenant por Host/subdominio y reescribe a
      `/s/<slug>` (soporta `*.localhost` y `?__tenant=` en dev). `app/s/[tenant]/page.tsx`
      hace `fetchTenant` a la API, inyecta `brandConfigToCssVars` en `.rt-root` y
      renderiza el micrositio con los 8 componentes. **ISR** `revalidate=60`.
      Metadata SEO por tenant. Layout importa `@rep/ui-tenant/styles.css`.
      Verificado en prod build: martinez (azul #1e3a8a + radius 8px inyectados) vs
      lopez (Dwell puro), 404 en tenant inexistente, fuentes servidas desde
      `/_next/static/media/*.woff2` (self-hosted, cero CDN).
      Nota infra: `.npmrc` con `verify-deps-before-run=false` (pnpm 11 lanzaba un
      install mal ubicado antes de cada script de Next).

### Fase E — Infra de producción
- [x] **Paso 10 (preparado, sin conectar)** — infra con drivers, todo funciona en
      local sin credenciales; activar cloud = poner env. `@rep/queue` (BullMQ,
      conexión IORedis lazy, `enqueue` no-op sin `REDIS_URL`, `registerWorker`),
      `@rep/storage` (interfaz + `LocalStorage` fs por defecto + `R2Storage` lazy,
      `signedUploadUrl`), `@rep/email` (interfaz + `ConsoleEmailer` + `ResendEmailer`
      lazy + plantilla `invitationEmail`). App `workers` cableada (idle sin Redis).
      Redis añadido al docker-compose. 10 tests (adaptadores locales) + roundtrip
      enqueue→worker verificado con Redis real. Falta cablear: endpoint de upload
      en la API y el servido HTTP de `/uploads` (cuando se necesite media).
- [ ] **Paso 11** — Deploy Vercel + Railway, GitHub Actions, Sentry.

### Frontend — Dashboard (app interna de gestión)
- [x] **Dashboard: login + auth** — `AuthContext` (sesión por cookie httpOnly de
      Better-Auth, sin token en JS/localStorage), cliente `lib/api.ts` con
      `credentials:'include'`, `RequireAuth` (guard → /login), página de login,
      home protegido con selector de inmobiliaria + `useModule` (lee
      `GET /tenant/modules`). CORS global con credenciales en la API para
      `TRUSTED_ORIGINS`. Verificado en navegador (Playwright): guard → login →
      home (owner de martinez, módulo `microsite`) → logout → sesión cerrada.
      Rutas en `lib/routes.ts`, API URL en `NEXT_PUBLIC_API_URL`.
- [x] **Dashboard: design system `@rep/ui` + shell** — sistema interno con fuente
      única de verdad (`styles/tokens.css`, vars `--ui-*`), fuentes self-hosted
      (Archivo + Hanken, mismo ADN que los micrositios), paleta neutra sin acento
      cromático (color solo para estado semántico), primitivos `du-*` (Button,
      Input, Select, Label, Card, Badge). Login y home refactorizados sobre él;
      shell con sidebar + header + selector de inmobiliaria (iconos lucide-react).
      Regla: prohibido color/tamaño arbitrario en componentes — todo sale de `--ui-*`.
      4 tests + verificado en navegador (Playwright).
- [x] **Dashboard: tabs gateadas por módulo + panel superadmin** — route group
      `app/(app)/` con layout compartido (guard + `WorkspaceProvider` + shell).
      `WorkspaceProvider`: tenant seleccionado (persistido en localStorage), sus
      módulos activos, `hasModule`, `isPlatformAdmin` (nuevo campo en `/me`).
      Sidebar con nav gateada: ítem `module` visible si el tenant lo tiene activo,
      ítem `adminOnly` solo para superadmin. Panel `/admin`: tabla inmobiliarias ×
      módulos con `Switch` (nuevo primitivo `du-switch`) que llama a
      `PUT /admin/tenants/:slug/modules/:code`; guard cliente + 403 en backend.
      Verificado en navegador: owner ve "Micrositio" (módulo activo) y NO Admin;
      superadmin ve "Admin" y NO Micrositio; toggle persiste en BBDD. 37+4 tests.
- [x] **Dashboard module-first + white-label total** (revisión de concepto) —
      dejó de ser vista de estado/fontanería. Sidebar = secciones funcionales del
      cliente (Clientes, Micrositio, Ajustes…) gateadas por módulo; nunca muestra
      "activo/inactivo" al cliente. La marca de la inmobiliaria tiñe TODO el
      dashboard vía `brandConfigToUiVars` (tokens `--ui-*`, guardarraíl de contraste
      on-primary, fondo oscuro deriva superficie/tinta). `WorkspaceProvider` carga
      `brandConfig`; `useRequireModule` protege secciones. Catálogo real en el seed
      (clients/properties/accounting/whatsapp_bot/microsite). 11 tests @rep/ui.
      Verificado: martinez ve su nombre + azul de marca + Clientes/Micrositio;
      `/propiedades` (no contratado) rebota a Inicio.
- [x] **Martinez = design system Dwell** (prueba real del white-label total del
      dashboard). `brand_config` de martinez codifica Dwell: off-white `#FBFBFB`,
      negro/gris `#878787`/negro sin acento, `borderRadius:0` + `buttonRadius:999`
      (nuevo token `--ui-radius-btn`: tarjetas rectas + botones píldora, la firma
      Dwell). Fuentes Archivo+Hanken (defaults). Tratamiento display Dwell en
      `@rep/ui` (h1 26px/800, tracking -0.02em). Verificado por medición de ancho
      en navegador que Archivo se dibuja de verdad (no era fallback; el problema era
      el tratamiento tímido, no la familia). Seed hecho **autoritativo** (deja el
      estado exacto de módulos, no acumula toggles de pruebas). 13 tests @rep/ui.
- [x] **Módulo Clientes (CRM)** — primer módulo funcional real. Modelo Drizzle
      `clients` tenant-scoped (name/email/phone/stage lead|active|closed/notes),
      migración `0002`. API `apps/api/src/modules/clients/` (schema Zod, service
      vía `tenantDb`, routes bajo `/tenant/clients`) con cadena de guardas
      tenant→auth→membership→`requireModule('clients')`. CRUD completo. Front:
      `/clientes` con tabla + alta (form) + borrado usando `@rep/ui`.
      43 tests API (CRUD + aislamiento A/B + gating). Verificado en navegador.
- [x] **Módulo Propiedades** — mismo patrón que Clientes. Modelo `properties`
      tenant-scoped (title/description/operation sale|rent/kind flat|house|
      commercial|land|garage/status draft|published|archived/price/bedrooms/
      bathrooms/areaM2/city/address), migración `0003`. API
      `apps/api/src/modules/properties/` bajo `/tenant/properties` con las mismas
      guardas + `requireModule('properties')`. Front `/propiedades` (tabla + alta +
      borrado, precio formateado es-ES). Seed activa properties en martinez.
      49 tests API. Verificado en navegador.
- [x] **Propiedades → micrositio** — endpoint público `GET /tenant/listings`
      (gateado por `microsite`, solo `published`). `@rep/ui-tenant`: componente
      `PropertyGrid` + clases `rt-listing*` / `rt-eyebrow` / `rt-section-title`
      100% con tokens `--tenant-*` (fuentes, espacios, radius Dwell). tenant-site
      `fetchListings` + sección "Propiedades" con ISR. Verificado: el micrositio de
      martinez muestra "Ático con terraza · 320.000 €" en estética Dwell.
- [x] **Arquitectura micrositio: `site_config` (Capa 2 contenido)** — el contenido
      del micrositio dejó de estar hardcodeado. Nuevo `tenants.site_config` jsonb
      (`SiteConfig`: template, heroEyebrow/Title/Subtitle, about, contactEmail/Phone,
      social[]), migración `0004`. `/tenant` lo devuelve; la plantilla lo lee con
      defaults sensatos (tenant sin config sigue viéndose bien). Seed pre-rellena
      martinez (modelo **híbrido**: nosotros en onboarding, editable por el cliente
      después). 3 capas: brand_config (marca) / site_config (contenido) / properties
      (datos). Verificado: hero de martinez sale de su site_config.
- [x] **Editor del micrositio (self-serve)** — sección Micrositio del dashboard es
      ahora un editor de `site_config`. API `apps/api/src/modules/site/` (`GET/PATCH
      /tenant/site`, auth+membership+`requireModule('microsite')`; el tenant se edita
      a sí mismo por id del contexto). UI: Portada (antetítulo/titular/subtítulo),
      Sobre, Contacto (email/teléfono/redes dinámicas) con `@rep/ui` (+ nuevo
      `Textarea`). Guarda vía PATCH → BBDD → micrositio en ≤60s (ISR). Cierra el
      modelo híbrido. Verificado: editar+guardar persiste en BBDD.
- [x] **Fotos de propiedades + ficha por inmueble** — `@rep/storage` cableado:
      `POST/DELETE /tenant/properties/:id/photos` (multipart, valida tipo/tamaño),
      `properties.photos` jsonb, `app.use("/uploads/*", serveStatic)` (local en dev,
      R2 en prod). Dashboard: gestor de fotos por propiedad (subir/borrar/miniaturas).
      Público: `GET /tenant/listings/:id` + ficha `/s/[tenant]/propiedad/[id]` con
      galería (clases `rt-gallery`/`rt-detail*` 100% tokens Dwell); la tarjeta del
      grid usa la 1ª foto y enlaza a la ficha. Verificado E2E: subir foto → BBDD →
      servida por HTTP → grid + ficha. 49 tests.
- [x] **Ajustes del cliente = logo + diseño en solo-lectura** (corrección de
      concepto: el design system NO lo toca el cliente). API `/tenant/brand` GET +
      `POST/DELETE /logo` (owner, sube logo a `@rep/storage`). Ajustes: subir/quitar
      logo (se ve al instante en el sidebar) + preview read-only "gestionado por
      nosotros". Se quitaron los selectores de color/radio del cliente.
- [x] **Sistema de temas del micrositio (motor + temas CSS intercambiables)** —
      `@rep/ui-tenant` refactorizado: `base.css` (MOTOR, componentes rt-* con solo
      variables) + `tokens.css` (:root, contrato neutro) + `themes/<id>.css` (cada
      tema un bloque scoped `[data-theme="<id>"]`, mismo formato; `_template.css` =
      plantilla). El micrositio pone `data-theme={brandConfig.theme ?? "dwell"}`.
      Intercambiar diseño = cambiar `brand_config.theme` (un archivo = un diseño a
      medida). Temas: `dwell` (default), `costa` (ejemplo). El micrositio ya no
      inyecta brandConfigToCssVars (el tema define todo). Verificado: dwell→costa
      transforma la web entera. Añadir tema a medida: copiar `_template.css`,
      rellenar, registrar `@import` en `index.css`, asignar `theme` al tenant.
- [x] **Sistema de temas en el dashboard** — `@rep/ui` refactorizado igual que
      `@rep/ui-tenant`: motor (`base.css`) + contrato (`tokens.css` :root) +
      `themes/<id>.css` (`dwell`, `costa`, `_template`, scoped `[data-theme]`).
      El shell pone `data-theme={brandConfig.theme ?? "dwell"}` (ya no inyecta
      `brandConfigToUiVars`). **Un solo campo `brand_config.theme` tiñe dashboard +
      micrositio** de forma consistente. Verificado: swap dwell→costa re-tiñe el
      dashboard (azul/redondeado) igual que el micrositio.
- [x] **Editor de temas en el superadmin** — sección "Diseño" en `/admin`: selector
      de tema por inmobiliaria. Registro `THEMES` en `@rep/ui` (dwell, costa; mantener
      sync con los archivos themes/*.css). API `PUT /admin/tenants/:slug/theme`
      (requirePlatformAdmin → `brand_config.theme`); `GET /admin/tenants` incluye
      `theme`. Verificado: cambiar el tema desde el panel persiste y tiñe dashboard +
      micrositio de esa inmobiliaria. Themes a medida (no en el registro) salen como
      "&lt;id&gt; (a medida)" en el select.
- [x] **Captación: leads del micrositio → CRM** — formulario de contacto en la
      ficha pública que crea un `client` (`stage=lead`, `source=microsite`,
      `interest_property_id` validado contra published del tenant). Migraciones
      `0007` (enum `client_source`) — API `POST /tenant/leads` (público, gateado
      por `microsite`, honeypot + throttle en memoria con purga; claves de cuota
      COMPARTIDAS entre formularios públicos vía `leads/public-intake.ts`).
      DS: `LeadForm` + clases `rt-form*`. CORS: rutas públicas del micrositio
      reflejan cualquier origen (dominios de tenant dinámicos), resto sigue
      restringido a TRUSTED_ORIGINS. Badge "Micrositio" en /clientes.
- [x] **Módulo `valuation` — widget "Valora tu piso gratis"** (producto 04 del
      catálogo Hodex, pata no bloqueada; `whatsapp_bot` llegará con el alta en
      Meta). Code `valuation` en el catálogo (activable por tenant en /admin),
      migración `0008` (source `valuation`). API `POST /tenant/valuations`:
      estimación €/m² desde los comparables PUBLICADOS en venta del propio tenant
      (misma ciudad si hay; precio>0; horquilla ±10% redondeada; degenerada →
      null, nunca "0–0 €") + lead de propietario con la horquilla en notes.
      DS: `ValuationForm` (+`rt-select`, `rt-form__row`, `rt-valuation__*`).
      Sección + enlace de nav en el micrositio solo si el tenant tiene el módulo
      (`fetchModules` LANZA en error para no cachear la página sin la sección).
      Badge "Valoración" en /clientes.
- [x] **Galería premium en la ficha (mosaico + lightbox)** — componente cliente
      `Gallery` en `@rep/ui-tenant`: mosaico adaptativo (principal + hasta 4
      tiles, overlay "+N fotos", botón "Ver las N"), visor fullscreen (flechas,
      teclado, contador, scroll-lock) con los vídeos integrados como slides
      (badge ▶); en móvil colapsa a carrusel scroll-snap. Clases `rt-mosaic*` /
      `rt-lightbox*` 100% tokens + nuevos `--tenant-scrim`/`--tenant-on-scrim`
      en contrato y temas. Ficha: facts con jerarquía display 22px. Verificado
      E2E a 1280/360 (navegación, scroll-lock, sin overflow).
- [x] **Portada premium + menú móvil + dedup de labels** — hero split con
      propiedad destacada (foto + chip título·precio enlazando a la ficha;
      fallback solo-texto), badge de operación en las tarjetas del grid, y
      menú hamburguesa en ≤640px (`MobileNav` cliente, overlay portaleado al
      `.rt-root` — el backdrop-filter del topbar hace containing block de los
      fixed, y fuera de `.rt-root` se pierden fuentes/tema). Dedup:
      `PROPERTY_KIND_LABELS`/`OPERATION_LABELS` como fuente única en
      `@rep/ui-tenant` (5→3 copias; API y dashboard mantienen la suya
      server/app-side) y `ValuationEstimate` reusado en tenant-site.
- [x] **Footer personalizado por inmobiliaria (home + ficha)** — `SiteFooter`
      compartido en tenant-site (la ficha no tenía footer): logo de Ajustes
      (`brand_config.logoUrl`, fallback al wordmark), columna "Visítanos" con
      dirección/horario nuevos en `site_config` (`footerAddress`/`footerSchedule`,
      editables en el editor Micrositio) y barra de copyright con el año y el
      nombre del tenant. `Footer` del DS admite ítems sin href (texto plano),
      logo y bottomText. Seed pre-rellena martinez.
- [x] **Módulo Agenda de visitas (`visits`, producto 05)** — tabla `visits`
      tenant-scoped (migración 0009: propiedad, solicitante snapshot,
      scheduled_at, estado requested|confirmed|done|cancelled, client_id al
      lead). API: `POST /tenant/visits/request` PÚBLICO (ficha; path propio
      para que el CORS abierto no alcance al GET privado; intake guard
      compartido; valida inmueble publicado del tenant y fecha futura; crea o
      reusa el lead del CRM) + GET/PATCH/DELETE privados con **detección de
      choques**: confirmar en una franja de 30 min ya confirmada → 409
      slot_conflict. DS: `VisitForm` (día + franja + contacto). Ficha: widget
      "Pedir visita" gateado. Dashboard: sección **Agenda** (/agenda) con
      confirmar/cancelar/hecha y aviso de choque. 7 tests API (69 total).
- [x] **Módulo Portal del propietario (`owner_portal`, producto 05)** — el dueño
      (cliente del CRM) ve el rendimiento de sus inmuebles sin cuenta: enlace
      con token capability. Migración 0010: `properties.owner_client_id` (FK
      set null) + `clients.portal_token` (unique). API `modules/portal/`:
      POST /tenant/portal/clients/:id/token (privado, idempotente) + GET
      /tenant/portal/:token (público; lo consume el tenant-site server-side →
      sin CORS; visitas SIN datos personales del visitante). Página
      /portal/[token] temada, no-store + robots noindex. Dashboard: select
      "Propietario" en la edición de propiedad (validado contra el tenant,
      `invalid_owner`) y botón "Portal" en Clientes que copia el enlace
      (NEXT_PUBLIC_TENANT_SITE_URL). **Bugfix de regresión encontrado por el
      E2E**: en zod v4 `.partial()` re-aplica los `.default()` → los PATCH
      parciales reseteaban status/kind/operation (properties) y stage
      (clients); update schemas sobreescritos con enums opcionales sin default
      + 2 tests de regresión. 75 tests API.
- [x] **Módulo Alquileres (`rentals`) — contratos, cobros y rendimiento** —
      la inmobiliaria gestiona; el propietario ve el rendimiento en su portal.
      Migración 0011: `rentals` (propiedad, inquilino snapshot + cliente
      opcional set null, renta, inicio/fin, active|ended) y `rental_payments`
      (unique rental+period, amount, pending|paid, paidAt). API privada
      /tenant/rentals: crear (un solo contrato ACTIVO por inmueble → 409),
      finalizar (endDate automática), y `PUT /:id/payments/:YYYY-MM` upsert
      idempotente (amount default = renta). Portal service añade `rental`:
      renta/mes, cobrado este año, últimos 6 meses — SIN identidad del
      inquilino. Dashboard: sección **Alquileres** (alta con selects de
      inmueble/cliente, chips de meses clicables ✓/!/·, finalizar, 409 con
      copy claro). Portal: bloque "Rendimiento del alquiler" con facts y chips
      de meses. Update schemas sin defaults (lección zod v4). 80 tests API.
- [x] **Gastos y facturas por inmueble (dentro de `rentals`)** — la agencia
      sube la factura (PDF/imagen, multipart a `@rep/storage`, máx. 10 MB)
      categorizada (agua, luz, gas, comunidad, impuestos, derrama,
      mantenimiento, seguro, otros). Migración 0012: `property_expenses` con
      `amount_cents` (céntimos: las facturas llevan decimales). API
      /tenant/expenses (GET ?propertyId / POST multipart / DELETE) validando
      inmueble del tenant y tipo de archivo. Dashboard: card "Gastos y
      facturas" en Alquileres (selector de inmueble, alta con adjunto, lista
      con enlace 📎, borrar). Portal: bloque "Gastos y facturas" — gastos del
      año, **Neto este año** (cobrado − gastos) si hay contrato, y lista con
      "Ver factura" descargable. 84 tests API.
- [x] **Portal: gráfico mensual + resumen global + alerta de pendientes** —
      la API del portal añade `summary` (cobrado/gastos/neto del año +
      pendingPayments agregados) y `monthly` (12 meses ingresos vs gastos por
      inmueble). Página: banda de resumen, alerta en `--tenant-danger` si hay
      meses pendientes, y gráfico SVG server-rendered (sin JS): barras
      pareadas por mes con identidad de serie por MODO DE RELLENO (sólida =
      ingresos, hueca = gastos) porque los temas white-label no garantizan
      separación por color (validado con el skill dataviz: Dwell monocromo y
      costa fallaban el floor de visión normal); tooltips nativos <title>,
      leyenda, tokens del tema. Pendiente anotado: desglose por categoría,
      informe imprimible, ofertas, rentabilidad % (necesita valor del inmueble).
- [x] **Portal: detalle por inmueble con tabs + portada aligerada** — la
      portada del portal muestra tarjetas COMPACTAS (foto, chips, 4 cifras
      clave, "Ver detalle completo"); el resto vive en
      `/portal/[token]/[propertyId]` con tabs Resumen (facts + gráfico) /
      Cobros (**registro íntegro** mes a mes: importe, estado, fecha de pago)
      / Gastos (desglose por categoría + tabla con facturas) / Visitas
      (próximas + historial). API: GET /tenant/portal/:token/properties/:id
      (404 si el inmueble no es del dueño del token). `PortalTabs` cliente
      (contenido server-rendered), clases `rt-tabs`/`rt-table` con tokens y
      `.rt-table-scroll` (las tablas scrollean en su contenedor en móvil,
      overflow cazado y corregido en el E2E a 360). 85 tests API.
- [x] **Perfil de cliente (CRM de verdad)** — migración 0013: enum
      `client_kind` (owner/renter/buyer/seeker/other), `monthly_fee_cents`
      (cuota acordada) y tabla `client_notes` (historial manual).
      **Auto-clasificación** en la captación: lead de valoración → owner;
      lead de ficha/visita → buyer (testeado). **Portal solo para
      propietarios**: generar el enlace exige inmuebles asignados (400
      no_properties, validado servidor + mensaje claro en UI). API:
      GET /tenant/clients/:id/profile (cliente + inmuebles en propiedad +
      contratos como inquilino + interés + **timeline** derivado de
      alta/visitas/contratos/cobros + notas) y POST /:id/notes. Dashboard:
      página `/clientes/[id]` (tipo/estado/cuota editables inline, vínculos,
      notas, actividad) + columna Tipo y nombre clicable en la lista.
      88 tests API.
- [ ] **Deuda anotada (review 18-jul-2026)**: mover `isPublicMicrositePath`
      a un sub-app público con su propia política CORS; throttle a Redis
      multi-instancia; helpers `tenantGet/tenantPost` en tenant-site;
      KIND_LABEL residual en API/dashboard si algún día compensa un leaf package.
- [x] **Plantillas de portada editorial/minimal/bold** — `site_config.template`
      por fin se renderiza: editorial (split texto+foto destacada), minimal
      (centrado solo-texto), bold (hero full-bleed con la foto de fondo y
      titular sobre degradado de scrim, tratamiento `rt-hero--bold` con
      tokens/color-mix). Selector "Plantilla de portada" en el editor
      Micrositio (self-serve). Sin foto publicada, bold/editorial caen al
      solo-texto. Verificadas las 3 en navegador.
- [x] **Módulo Contabilidad (facturas + pagos + PDF)** — absorbe `property_expenses`
      en una entidad `invoices` generalizada con `direction` (`expense`|`income`),
      migración 0014 (+ 0015 borra la tabla vieja tras migrar sus 2 filas reales,
      script one-off verificado idempotente y luego eliminado). Un documento
      cuelga opcionalmente de inmueble y/o cliente (nunca obligatorio). Ingresos:
      numeración secuencial por año (`2026-0001`), IVA en `taxRateBps` (céntimos,
      sin floats). `invoice_payments` (1:N, pagos parciales) — el estado pasa a
      `paid` automáticamente al cubrirse el total; gasto con `status=paid` al
      crear se auto-paga con un pago del total. API `apps/api/src/modules/invoices/`
      bajo `/tenant/invoices` (CRUD + `POST /:id/payments` + upload multipart del
      justificante + `GET /:id/pdf`), gateada por `requireModule('accounting')`.
      PDF con `pdfkit` (texto-only en v1, sin logo — evita fetch remoto en
      caliente) **solo para facturas `income`** (alcance decidido con el usuario:
      sin IA en v1, PDF solo de facturas emitidas). Dashboard: página
      `/contabilidad` reemplaza el stub — resumen (cobrado/pendiente/gastos/
      balance del año), tabs Facturas emitidas / Gastos, alta de ambas, cobro
      parcial inline, descarga de PDF (fetch autenticado a blob, no `<a href>`
      directo porque el endpoint exige cookie+header de tenant). Card de Gastos
      en Alquileres y portal del propietario migrados a `invoices`/`InvoiceCategory`
      (antes `property_expenses`/`ExpenseCategory`). 101 tests API (15 en
      `invoices.test.ts`, incl. aislamiento y PDF). Verificado E2E en navegador:
      alta de factura con IVA, PDF descargado y con los datos correctos, cobro
      parcial actualiza estado/resumen en vivo, gastos migrados visibles con su
      adjunto original.
- [x] **Contabilidad: filtros + vista de cuentas agrupada** — dos mejoras sobre
      el módulo. (1) Filtros por inmueble/cliente en Movimientos, client-side
      sobre los datos ya cargados (sin roundtrip), con columnas Inmueble/Cliente
      en la tabla para verlo de un vistazo. (2) Pestañas "Por inmueble" / "Por
      cliente": agregan facturado/cobrado/pendiente/gastos/balance por cuenta
      (incluye grupo "Sin asignar"), ordenadas por actividad. Clic en una fila
      vuelve a Movimientos con el filtro de esa cuenta ya aplicado — reutiliza
      el mismo mecanismo de filtrado, sentinel `NONE` para distinguir "sin
      filtro" de "sin inmueble/cliente asignado". Verificado en navegador:
      filtro por cliente recalcula resumen y tabla en vivo, drill-down desde
      la vista agrupada abre Movimientos con el filtro correcto.
- [ ] **Pendiente retomar**: theming/fuentes por inmobiliaria (ver gotcha de
      next/font arriba) y edición de marca en Ajustes.
