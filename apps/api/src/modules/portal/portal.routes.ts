import { Hono } from "hono";
import {
  authMiddleware,
  requireMembership,
  type MemberEnv,
} from "../../middlewares/auth.middleware.js";
import { requireModule } from "../../middlewares/module.middleware.js";
import * as service from "./portal.service.js";

// Portal del propietario (producto 05). Bajo /tenant/portal, gateado por
// 'owner_portal'. Dos superficies:
//   POST /clients/:id/token → PRIVADA (dashboard): genera/recupera el enlace.
//   GET  /:token            → PÚBLICA: la página del portal la renderiza el
//                             tenant-site server-side con este endpoint. El
//                             token ES la credencial; sin él no hay datos.
export const portal = new Hono<MemberEnv>();

portal.use("*", requireModule("owner_portal"));

portal.post("/clients/:id/token", authMiddleware, requireMembership, async (c) => {
  const result = await service.getOrCreatePortalToken(c.req.param("id"));
  if (!result.ok) {
    return c.json({ error: result.error }, result.error === "not_found" ? 404 : 400);
  }
  return c.json({ token: result.token });
});

// Detalle de un inmueble del propietario (página con tabs). Más específico
// que /:token, se registra antes.
portal.get("/:token/properties/:propertyId", async (c) => {
  const data = await service.getPortalPropertyDetail(
    c.req.param("token"),
    c.req.param("propertyId"),
  );
  if (!data) return c.json({ error: "not_found" }, 404);
  return c.json(data);
});

portal.get("/:token", async (c) => {
  const data = await service.getPortalData(c.req.param("token"));
  if (!data) return c.json({ error: "not_found" }, 404);
  return c.json(data);
});
