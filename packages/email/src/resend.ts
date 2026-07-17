import { emailEnv } from "./env.js";
import type { Emailer, EmailMessage, SendResult } from "./types.js";

// Resend. El SDK se carga de forma perezosa: en local (driver 'console') no se
// importa ni se pide RESEND_API_KEY.
export class ResendEmailer implements Emailer {
  readonly name = "resend";

  async send(message: EmailMessage): Promise<SendResult> {
    if (!emailEnv.RESEND_API_KEY) {
      throw new Error("EMAIL_DRIVER=resend requiere RESEND_API_KEY");
    }
    const { Resend } = await import("resend");
    const resend = new Resend(emailEnv.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: message.from ?? emailEnv.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
    });
    if (error) throw new Error(`Resend: ${error.message}`);
    return { id: data?.id ?? null, delivered: true };
  }
}
