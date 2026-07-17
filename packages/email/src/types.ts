// Contrato común de email. Los módulos envían SIEMPRE por esta interfaz.
export interface Emailer {
  readonly name: string;
  send(message: EmailMessage): Promise<SendResult>;
}

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string; // por defecto EMAIL_FROM
  replyTo?: string;
};

export type SendResult = { id: string | null; delivered: boolean };
