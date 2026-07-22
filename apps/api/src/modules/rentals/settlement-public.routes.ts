import { Hono } from "hono";
import type { MemberEnv } from "../../middlewares/auth.middleware.js";
import { requireModule } from "../../middlewares/module.middleware.js";
import * as service from "./shared-expenses.service.js";

// Liquidación PÚBLICA por token (enlace que la inmobiliaria comparte con los
// inquilinos). Bajo /tenant/settlement. Sin auth: el token ES la credencial; la
// inmobiliaria lo activa/revoca. La renderiza el tenant-site server-side.
export const settlementPublic = new Hono<MemberEnv>();

settlementPublic.use("*", requireModule("rentals"));

settlementPublic.get("/:token", async (c) => {
  const data = await service.getSettlementByToken(c.req.param("token"));
  if (!data) return c.json({ error: "not_found" }, 404);
  return c.json(data);
});
