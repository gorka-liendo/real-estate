import type { EmailMessage } from "./types.js";

// Plantillas de email (HTML inline, sin dependencias). Se usarán en Fase 2
// (invitaciones a tenant) y siguientes.

export function invitationEmail(params: {
  to: string;
  tenantName: string;
  inviteUrl: string;
}): EmailMessage {
  const { to, tenantName, inviteUrl } = params;
  return {
    to,
    subject: `Te han invitado a ${tenantName}`,
    text: `Únete a ${tenantName}: ${inviteUrl}`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h1 style="font-size:20px">Te han invitado a ${tenantName}</h1>
  <p style="color:#555">Haz clic para crear tu cuenta y unirte al equipo.</p>
  <p><a href="${inviteUrl}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px">Aceptar invitación</a></p>
  <p style="color:#999;font-size:12px">Si no esperabas esta invitación, ignora este correo.</p>
</div>`,
  };
}
