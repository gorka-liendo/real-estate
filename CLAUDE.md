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
# Raíz del monorepo
pnpm dev:up           # docker compose up -d (db+redis) + turbo dev — entorno completo
pnpm dev              # turbo dev — todas las apps en paralelo (infra ya levantada)
pnpm infra:up         # solo docker compose up -d (db + redis)
pnpm infra:down       # docker compose down
pnpm build            # turbo build
pnpm lint             # turbo lint
pnpm test             # turbo test

# Base de datos (desde packages/db/)
docker compose up -d db   # ¡desde la raíz! Postgres 18 en puerto 5433
pnpm db:generate      # genera migración tras cambiar el schema
pnpm db:migrate       # aplica migraciones
pnpm db:seed          # seed idempotente (2 tenants: martinez, lopez)
pnpm db:studio        # Drizzle Studio

# Puertos fijos
# dashboard :3000 · tenant-site :3001 · api :3002 · postgres :5433 (host)
```

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
- [ ] **Dashboard: tabs gateadas por módulo** en el sidebar (según `useModule`).
- [ ] **Dashboard: panel superadmin** (UI de `/admin/*` — gestión de módulos por tenant).

> Solo se empieza un módulo funcional cuando los pasos 1-7 están completos.
> Primer módulo previsto: **micrositio + landing por inmueble**.
