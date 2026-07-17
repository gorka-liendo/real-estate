import { Hono } from "hono";
import { logger } from "hono/logger";

// app sin listen() — importable en tests (mismo patrón que app.ts/server.ts en Express)
export const app = new Hono();

app.use("*", logger());

app.get("/health", (c) => c.json({ status: "ok" }));
