# Dominios propios (custom domains)

> Cada inmobiliaria puede publicar su micrositio en **su propio dominio**
> (`www.inmobiliaria-martinez.es`) en vez del subdominio de la plataforma
> (`martinez.plataforma.app`). Es lo que convierte el micrositio en "su web de
> verdad" y justifica cobrarlo como parte del producto.

**Estado:** resolución + panel de gestión **hechos y verificados en local**
(Blocks 1-2). Falta el **aprovisionamiento en Vercel (TLS)**, que solo aplica en
producción (Block 3, ver más abajo).

---

## 1. El problema en dos mitades

Servir el micrositio en un dominio del cliente exige resolver **dos** cosas
independientes. Es clave no confundirlas:

| Mitad | Qué resuelve | Dónde vive | ¿Testeable en local? |
|-------|--------------|-----------|----------------------|
| **Resolución** | "este Host, ¿de qué inmobiliaria es?" | código (API + proxy) | ✅ sí |
| **Aprovisionamiento + TLS** | que el tráfico del dominio del cliente llegue a nuestra app **con HTTPS válido** | infra (Vercel) | ❌ solo prod |

La **resolución** es nuestra lógica. El **aprovisionamiento** lo hace la
plataforma de hosting (Vercel) porque el certificado TLS de un dominio ajeno no
se puede pre-generar: hay que emitirlo bajo demanda cuando el cliente apunta su
DNS. Estar en Vercel es lo que hace esto abordable (TLS on-demand gratis); sin
Vercel habría que montar Caddy/ACME a mano.

---

## 2. Cómo funciona hoy (Blocks 1-2)

### Flujo de una petición a un dominio propio

```
Navegador  ──►  https://www.inmobiliaria-martinez.es/
                        │  (DNS del cliente apunta aquí)
                        ▼
             tenant-site (Next.js)  ──  proxy.ts
                        │
                        │  Host no es subdominio de la plataforma
                        │  y no hay ?__tenant → resolver por dominio
                        ▼
             GET /public/resolve-domain?host=www.inmobiliaria-martinez.es
                        │  (API, server-side, con caché en memoria)
                        ▼
                   { "slug": "martinez" }
                        │
                        ▼
             rewrite interno a /s/martinez  → se renderiza el micrositio
```

El usuario nunca ve `/s/martinez`: la URL sigue siendo su dominio.

### Piezas

**Campo en BBDD** — `tenants.custom_domain` (texto, único). Ya existía en el
schema (`packages/db/src/schema/tenants.ts`), así que **no hubo migración**.

**Endpoint de resolución** (`apps/api/src/app.ts`):

```
GET /public/resolve-domain?host=<host>
  → 200 { slug }        si el host casa con un custom_domain de un tenant activo
  → 404 { error }       si no
  → 400                 si falta ?host
```

Es **público** y **sin CORS**: lo llama el proxy del tenant-site *server-side*
(no el navegador). Hace un hit directo a `tenants.custom_domain` (sin caché en la
API: siempre fresco).

**Proxy del tenant-site** (`apps/tenant-site/proxy.ts`) — ahora `async`. Orden de
resolución del tenant:

1. `?__tenant=slug` (solo dev, para probar sin tocar DNS).
2. Subdominio de la plataforma (`martinez.<root>` → `martinez`).
3. **Dominio propio**: si el Host no es de la plataforma y no hay slug aún,
   llama a `/public/resolve-domain`.

Como el proxy corre en **cada** request, cachea el resultado en memoria (por
instancia) con TTL:

- **60 s** para resoluciones positivas (dominio → slug).
- **20 s** para negativas (dominio no registrado), para reintentar pronto.

Si la API está caída, no cachea y deja pasar (el visitante ve la landing, no un
error).

**Panel de superadmin** — asignar/quitar el dominio:

```
PUT /admin/tenants/:slug/domain        (requiere superadmin)
  body: { domain: string | null }      // null o "" limpia el dominio
  → 200 { tenant, customDomain }
  → 400 invalid_domain                 // no es un hostname válido
  → 409 domain_taken                   // ya está asignado a otro tenant
  → 404 tenant_not_found
```

Normaliza a minúsculas y valida que sea un hostname (sin `http://`, sin ruta, con
TLD). La UI es el componente `DomainManager` en
`apps/dashboard/app/(app)/admin/page.tsx`: campo de texto + Guardar/Quitar +
las **instrucciones DNS** que el superadmin relaya al cliente.

---

## 3. Configuración (env vars)

| Variable | App | Default | Para qué |
|----------|-----|---------|----------|
| `NEXT_PUBLIC_ROOT_DOMAIN` | tenant-site | `plataforma.app` | Raíz para resolver subdominios (`slug.<root>`). `localhost` se acepta **siempre** en dev. En prod, fijar al dominio real. |
| `NEXT_PUBLIC_DOMAIN_CNAME_TARGET` | dashboard | `cname.plataforma.app` | Destino del `CNAME` que se muestra al cliente en las instrucciones DNS. Lo emite la plataforma de hosting; se fija en el deploy. Solo informativo. |
| `NEXT_PUBLIC_API_URL` | tenant-site / dashboard | — | Base de la API (ya existía). |

Definidas en los slices de `@rep/config` (`packages/config/src/tenant-site.ts`) y
en `apps/dashboard/lib/config.ts`, validadas con Zod. **Cero hardcode.**

---

## 4. Cómo asignar un dominio (flujo operativo)

1. **Superadmin** entra en `/admin`, busca la inmobiliaria y escribe el dominio
   (p. ej. `www.inmobiliaria-martinez.es`) en "Dominio propio" → **Guardar**.
2. El panel muestra las **instrucciones DNS**. El superadmin se las pasa al
   cliente:
   > Crea en tu proveedor de dominio un registro **CNAME** de
   > `www.inmobiliaria-martinez.es` a `cname.plataforma.app`.
3. El **cliente** configura ese CNAME en su registrador (GoDaddy, IONOS, etc.).
4. *(Block 3, pendiente)* La plataforma verifica el DNS y **emite el certificado
   HTTPS automáticamente**. Hasta que Block 3 exista, el dominio **resuelve** al
   micrositio correcto pero el HTTPS del dominio ajeno no está aprovisionado.

Para **quitar** un dominio: botón "Quitar" (o guardar vacío) → `custom_domain`
pasa a `null` y el micrositio vuelve a servirse solo por el subdominio.

---

## 5. Block 3 — Aprovisionamiento + TLS en Vercel (PENDIENTE, solo prod)

Esta es la mitad de infraestructura. **No se puede probar en local** y depende de
que el **deploy en Vercel** esté hecho (Paso 11 del registro de `CLAUDE.md`).

### Qué hay que construir

Cuando el superadmin asigna un dominio, además de guardarlo en `custom_domain`
hay que **darlo de alta en el proyecto de Vercel** para que Vercel enrute ese
Host a nuestra app y le emita el certificado. El flujo real:

1. Superadmin asigna el dominio en `/admin`.
2. El backend llama a la **API de dominios de Vercel** para añadirlo al proyecto.
3. Vercel devuelve los **registros DNS de verificación** (el CNAME + a veces un
   TXT de verificación).
4. Esos registros se muestran al cliente (sustituyen al texto genérico de hoy).
5. El cliente configura el DNS.
6. La plataforma **verifica** (poll o botón "Verificar") contra Vercel; cuando
   pasa, Vercel **emite el certificado Let's Encrypt** automáticamente.
7. Se refleja el estado en el panel: `pendiente_dns` → `verificado` →
   `cert_emitido` (o `error`).

### Cómo encajarlo (patrón driver, como el resto de la infra)

Coherente con la filosofía del repo ("local por defecto, cloud por env" — ver
`@rep/storage`, `@rep/email`, `@rep/queue`):

- Nuevo módulo/paquete `domains` con una interfaz:
  `addDomain(host)`, `getDomainStatus(host)`, `removeDomain(host)`.
- Driver **no-op** por defecto (sin `VERCEL_TOKEN`): en local el `PUT .../domain`
  solo guarda `custom_domain` y la resolución funciona; no se toca Vercel.
- Driver **Vercel** cuando hay `VERCEL_TOKEN` + `VERCEL_PROJECT_ID`
  (+ `VERCEL_TEAM_ID` si aplica): habla con la API de Vercel de forma perezosa
  (SDK/fetch cargado solo si hay token).
- El endpoint `PUT /admin/tenants/:slug/domain` llama al driver tras guardar; un
  endpoint nuevo `GET /admin/tenants/:slug/domain/status` consulta el estado.

### API de Vercel (referencia)

- Añadir dominio: `POST /v10/projects/{projectId}/domains` `{ name }`.
- Estado/verificación: `GET /v9/projects/{projectId}/domains/{domain}` (incluye
  `verified` y los `verification` records a mostrar).
- Forzar verificación: `POST /v9/projects/{projectId}/domains/{domain}/verify`.
- Quitar: `DELETE /v9/projects/{projectId}/domains/{domain}`.
- Auth: header `Authorization: Bearer <VERCEL_TOKEN>`.

Vercel emite y renueva el certificado TLS automáticamente una vez verificado el
dominio. Nosotros **no** gestionamos certificados.

### Env vars que hará falta añadir (Block 3)

| Variable | Para qué |
|----------|----------|
| `VERCEL_TOKEN` | Auth de la API de Vercel. Sin ella, driver no-op. |
| `VERCEL_PROJECT_ID` | Proyecto (tenant-site) al que se añaden los dominios. |
| `VERCEL_TEAM_ID` | Solo si el proyecto está en un team. |

Añadir al slice de `@rep/config` de la API + a su `.env.example`.

### Decisiones aún abiertas

- **Root domain de producción** (`NEXT_PUBLIC_ROOT_DOMAIN`) y el **CNAME target**
  real (`NEXT_PUBLIC_DOMAIN_CNAME_TARGET`): se fijan al hacer el deploy.
- **Apex vs www**: hoy se guarda un `custom_domain` exacto. Si un cliente quiere
  que resuelvan tanto `midominio.es` como `www.midominio.es`, se decide en Block 3
  (Vercel puede gestionar la redirección apex↔www).

---

## 6. Tests

`apps/api/src/__tests__/domains.test.ts` (9 tests) cubre:

- Asignar dominio (superadmin), normalización a minúsculas, persistencia.
- `403` para usuario no superadmin.
- `400` dominio inválido (`http://x/y`, `sin-tld`).
- `409` dominio ya asignado a otro tenant; reasignar al mismo tenant no es conflicto.
- Resolución pública: dominio asignado → slug; ignora el puerto; no registrado →
  `404`; tras limpiar deja de resolver.

Verificación E2E manual (local): `curl -H "Host: <dominio>" http://localhost:3001/`
sirve el micrositio correcto; Host desconocido → landing de plataforma.

---

## 7. Mapa de archivos

| Archivo | Rol |
|---------|-----|
| `packages/db/src/schema/tenants.ts` | Campo `custom_domain` (único). |
| `apps/api/src/app.ts` | `GET /public/resolve-domain`. |
| `apps/api/src/modules/admin/admin.routes.ts` | `PUT /admin/tenants/:slug/domain`. |
| `apps/api/src/__tests__/domains.test.ts` | Tests. |
| `apps/tenant-site/proxy.ts` | Resolución por Host + caché TTL. |
| `packages/config/src/tenant-site.ts` | `NEXT_PUBLIC_ROOT_DOMAIN`. |
| `apps/dashboard/app/(app)/admin/page.tsx` | `DomainManager` (UI). |
| `apps/dashboard/lib/config.ts` | `DOMAIN_CNAME_TARGET`. |
| `apps/dashboard/lib/api.ts` | `adminSetDomain`. |
| *(Block 3)* `packages/domains/` + slice de Vercel | Aprovisionamiento + TLS. |
