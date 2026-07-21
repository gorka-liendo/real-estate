import { Hono } from "hono";
import { requireMembership, type MemberEnv } from "../../middlewares/auth.middleware.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requireModule } from "../../middlewares/module.middleware.js";
import { createRoomSchema, updateRoomSchema } from "./rooms.schema.js";
import * as service from "./rooms.service.js";

// Habitaciones de un inmueble (privado, dashboard). Bajo /tenant/rooms.
// Guardas: tenant → auth → membership → módulo 'rentals'.
export const rooms = new Hono<MemberEnv>();

rooms.use("*", authMiddleware);
rooms.use("*", requireMembership);
rooms.use("*", requireModule("rentals"));

// GET /tenant/rooms?propertyId=xxx — habitaciones de un inmueble.
rooms.get("/", async (c) => {
  const propertyId = c.req.query("propertyId");
  if (!propertyId) return c.json({ error: "missing_property" }, 400);
  return c.json({ rooms: await service.listRooms(propertyId) });
});

rooms.post("/", async (c) => {
  const body = createRoomSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  const result = await service.createRoom(body.data);
  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.json({ room: result.room }, 201);
});

rooms.patch("/:id", async (c) => {
  const body = updateRoomSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_body", issues: body.error.issues }, 400);
  const updated = await service.updateRoom(c.req.param("id"), body.data);
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ room: updated });
});

rooms.delete("/:id", async (c) => {
  const result = await service.deleteRoom(c.req.param("id"));
  if (!result.ok) {
    return c.json({ error: result.error }, result.error === "not_found" ? 404 : 409);
  }
  return c.json({ ok: true });
});
