import { emailEnv } from "./env.js";
import type { Emailer, EmailMessage, SendResult } from "./types.js";

/** Driver de desarrollo: imprime el email por consola en vez de enviarlo. */
export class ConsoleEmailer implements Emailer {
  readonly name = "console";

  async send(message: EmailMessage): Promise<SendResult> {
    console.info(
      `[email:console] ${message.from ?? emailEnv.EMAIL_FROM} → ${[message.to].flat().join(", ")}\n` +
        `  subject: ${message.subject}\n` +
        `  (html ${message.html.length} chars — no enviado, driver=console)`,
    );
    return { id: null, delivered: false };
  }
}
