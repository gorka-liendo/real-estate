import { Hono } from "hono";
import {
  authMiddleware,
  requireMembership,
  type MemberEnv,
} from "../../middlewares/auth.middleware.js";
import { requireModule } from "../../middlewares/module.middleware.js";
import { allowPublicCapture, clientIp } from "../leads/public-intake.js";
import { requestVisitSchema, updateVisitSchema } from "./visits.schema.js";
import * as service from "./visits.service.js";

// Agenda de visitas (producto 05). Montado bajo /tenant/visits, gateado por el
// módulo 'visits'. Dos superficies:
//   POST /request  → PÚBLICA (ficha del micrositio), con el guard de intake
//                    compartido. Path propio para que el CORS abierto de las
//                    rutas públicas NO alcance al GET/PATCH privados.
//   resto          → PRIVADA (dashboard): sesión + membership.
export const visits = new Hono<MemberEnv>();

visits.use("*", requireModule("visits"));

visits.post("/request", async (c) => {
  const parsed = requestVisitSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }

  // Honeypot relleno → bot. Fingimos éxito sin insertar.
  if (parsed.data.company) return c.body(null, 204);

  if (!allowPublicCapture(c.get("tenant").id, clientIp(c))) {
    return c.json({ error: "rate_limited" }, 429);
  }

  const { company: _company, ...data } = parsed.data;
  const visit = await service.requestVisit(data);
  if (!visit) return c.json({ error: "not_found" }, 404); // inmueble no visible
  return c.json({ ok: true, id: visit.id }, 201);
});

// --- privado: Agenda del dashboard ---
visits.get("/", authMiddleware, requireMembership, async (c) => {
  return c.json({ visits: await service.listVisits() });
});

visits.patch("/:id", authMiddleware, requireMembership, async (c) => {
  const parsed = updateVisitSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }

  const id = c.req.param("id");
  const current = await service.getVisit(id);
  if (!current) return c.json({ error: "not_found" }, 404);

  // Choque de agenda: al confirmar (o mover una confirmada), la franja debe
  // estar libre de otras visitas confirmadas.
  const nextStatus = parsed.data.status ?? current.status;
  const nextAt = parsed.data.scheduledAt ?? current.scheduledAt;
  if (nextStatus === "confirmed") {
    const conflict = await service.findConflict(nextAt, id);
    if (conflict) {
      return c.json(
        { error: "slot_conflict", conflictVisitId: conflict.id, conflictAt: conflict.scheduledAt },
        409,
      );
    }
  }

  const updated = await service.updateVisit(id, parsed.data);
  return c.json({ visit: updated });
});

visits.delete("/:id", authMiddleware, requireMembership, async (c) => {
  const ok = await service.deleteVisit(c.req.param("id"));
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.body(null, 204);
});
