import { ConsoleEmailer } from "./console.js";
import { emailEnv } from "./env.js";
import { ResendEmailer } from "./resend.js";
import type { Emailer } from "./types.js";

export type { Emailer, EmailMessage, SendResult } from "./types.js";
export { ConsoleEmailer } from "./console.js";
export { ResendEmailer } from "./resend.js";
export * from "./templates.js";

let instance: Emailer | undefined;

/** Devuelve el driver según EMAIL_DRIVER (por defecto 'console'). Singleton. */
export function getEmailer(): Emailer {
  if (!instance) {
    instance = emailEnv.EMAIL_DRIVER === "resend" ? new ResendEmailer() : new ConsoleEmailer();
  }
  return instance;
}
