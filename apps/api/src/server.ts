import { serve } from "@hono/node-server";
import { apiEnv } from "@rep/config/api";
import { app } from "./app.js";

serve({ fetch: app.fetch, port: apiEnv.PORT }, (info) => {
  console.log(`API escuchando en http://localhost:${info.port}`);
});
