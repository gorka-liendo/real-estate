# Real Estate Platform — Guía del proyecto

SaaS **multi-tenant** para inmobiliarias: plataforma base ("plantilla") que cada inmobiliaria
usa como "«su nombre» platform" con su propio design system encima del base.
Micrositios públicos white-label + dashboard interno + módulos vendibles con billing.

Stack: **Turborepo + pnpm** · **Next.js (dashboard, tenant-site) en Vercel** ·
**Hono + Node 24 (api) y BullMQ (workers) en Railway** · **PostgreSQL 18 + Drizzle** ·
**Better-Auth · Stripe Billing · Cloudflare R2 · Resend · Sentry**.

El repo hermano `../real-estate` (Express + Prisma) es el laboratorio original:
de ahí se portan **conceptos**, nunca código.

---

## Comandos esenciales

```bash
# Raíz del monorepo
pnpm dev              # turbo dev — todas las apps en paralelo
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
  ui/             # @rep/ui — design system interno del dashboard (NO personalizable)
  ui-tenant/      # @rep/ui-tenant — design system white-label (base "Dwell")
```

### Multi-tenancy (decisión estructural)
- **Shared database + shared schema**: cada tabla tenant-scoped lleva `tenant_id`.
- El tenant se resuelve por **Host header** en tenant-site y por **sesión** en dashboard/api.
- Toda query a tablas tenant-scoped pasa por el scoping de `@rep/db` — **nunca**
  un `db.select()` directo sobre esas tablas en handlers.
- El test de aislamiento (tenant A no puede leer datos de B) es innegociable y debe
  seguir pasando siempre.

### Módulos como plugins (feature flags + billing)
- Catálogo en tabla `modules`; activación por tenant en `subscriptions`.
- **Stripe es la fuente de verdad** de las subscripciones; la tabla es una réplica
  que actualizan los webhooks (Fase C). Backend: `requireModule(code)`.
  Frontend: `useModule(code)`.
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

### Fase C — Feature flags y billing
- [ ] **Paso 6** — `hasModule` / `requireModule` / `useModule` con caché Redis.
- [ ] **Paso 7** — Stripe Billing: producto por módulo, webhooks → `subscriptions`.

### Fase D — White-label y micrositio
- [ ] **Paso 8** — `@rep/ui-tenant`: tokens Dwell + 8 componentes signature.
- [ ] **Paso 9** — tenant-site: resolución por dominio (middleware Next) + ISR.

### Fase E — Infra de producción
- [ ] **Paso 10** — Redis + BullMQ, R2 (presigned uploads), Resend.
- [ ] **Paso 11** — Deploy Vercel + Railway, GitHub Actions, Sentry.

> Solo se empieza un módulo funcional cuando los pasos 1-7 están completos.
> Primer módulo previsto: **micrositio + landing por inmueble**.
