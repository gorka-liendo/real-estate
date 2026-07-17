import { getEmailer } from "@rep/email";
import { queueStatus, registerWorker, type Job, type JobData } from "@rep/queue";
import { getStorage } from "@rep/storage";

// Punto de entrada de los workers BullMQ.
// Sin REDIS_URL (local) los workers no arrancan: registerWorker devuelve null
// y el proceso queda idle — cero errores, listo para cuando haya Redis.

console.log(`[workers] cola: ${queueStatus()}`);
console.log(`[workers] storage: ${getStorage().name} · email: ${getEmailer().name}`);

// --- media: procesa imágenes (resize/optimize). Placeholder por ahora. ---
registerWorker("media", async (job: Job<JobData["media"]>) => {
  const { tenantId, assetKey, op } = job.data;
  console.log(`[workers:media] ${op} ${assetKey} (tenant ${tenantId})`);
  // TODO: descargar de storage, procesar con sharp, volver a subir.
});

// --- email: envíos asíncronos vía @rep/email. ---
registerWorker("email", async (job: Job<JobData["email"]>) => {
  const { to, template, vars } = job.data;
  console.log(`[workers:email] plantilla '${template}' → ${to}`, vars);
  // TODO: resolver plantilla y getEmailer().send(...)
});

console.log("[workers] listos (o idle si no hay Redis)");
