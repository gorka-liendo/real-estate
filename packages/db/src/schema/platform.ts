import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

// Superadmins de la PLATAFORMA (nosotros) — distinto de las memberships de tenant.
// Gestionan tenants y activan/desactivan módulos por inmobiliaria desde /admin.
export const platformAdmins = pgTable("platform_admins", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
