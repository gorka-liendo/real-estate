import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { account, db, session, user, verification } from "@rep/db";
import { authEnv } from "./env.js";

/**
 * Better-Auth gestiona SOLO autenticación (sesiones httpOnly, passwords scrypt).
 * El multi-tenancy (tenants, memberships, roles) es nuestro, en @rep/db —
 * la fuente de verdad de "quién pertenece a qué tenant" son las memberships.
 */
export const auth = betterAuth({
  secret: authEnv.BETTER_AUTH_SECRET,
  baseURL: authEnv.BETTER_AUTH_URL,
  trustedOrigins: authEnv.TRUSTED_ORIGINS,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
  },
});

export type Auth = typeof auth;
export type SessionData = typeof auth.$Infer.Session;

export { authEnv } from "./env.js";
