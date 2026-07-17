import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { tenants } from "./tenants.js";

// Un usuario puede pertenecer a varios tenants — el rol vive en la membership,
// nunca en el usuario. La tabla `user` es de Better-Auth (schema/auth.ts).

export const membershipRole = pgEnum("membership_role", ["owner", "agent", "viewer"]);

export type MembershipRole = (typeof membershipRole.enumValues)[number];

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("memberships_user_tenant_unique").on(t.userId, t.tenantId)],
);
