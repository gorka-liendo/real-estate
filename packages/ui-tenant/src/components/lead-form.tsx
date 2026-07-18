"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

// Formulario de captación del micrositio. Presentacional en cuanto a red: recibe
// `onSubmit(data)` (la app hace el fetch al endpoint) y gestiona SOLO la UX del
// envío (estados, honeypot, mensaje de éxito). Estilo 100% con tokens --tenant-*.
export type LeadFormData = {
  name: string;
  email: string;
  phone: string;
  message: string;
  company: string; // honeypot: oculto a humanos, cebo para bots
};

const EMPTY: LeadFormData = { name: "", email: "", phone: "", message: "", company: "" };

type Field = HTMLInputElement | HTMLTextAreaElement;

export function LeadForm({
  onSubmit,
  submitLabel = "Solicitar información",
  title,
}: {
  onSubmit: (data: LeadFormData) => Promise<void>;
  submitLabel?: string;
  title?: string;
}) {
  const [data, setData] = useState<LeadFormData>(EMPTY);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [rateLimited, setRateLimited] = useState(false);

  const set = (key: keyof LeadFormData) => (e: ChangeEvent<Field>) =>
    setData((d) => ({ ...d, [key]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    try {
      await onSubmit(data);
      setStatus("sent");
    } catch (err) {
      setRateLimited(err instanceof Error && err.message === "rate_limited");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="rt-form__status rt-form__status--ok" role="status">
        Gracias{data.name ? `, ${data.name}` : ""}. Hemos recibido tu solicitud y te
        contactaremos muy pronto.
      </div>
    );
  }

  return (
    <form className="rt-form" onSubmit={handleSubmit} noValidate>
      {title ? <p className="rt-form__title">{title}</p> : null}

      <div className="rt-field">
        <label className="rt-label" htmlFor="lead-name">
          Nombre
        </label>
        <input
          id="lead-name"
          className="rt-input"
          value={data.name}
          onChange={set("name")}
          required
          maxLength={200}
          autoComplete="name"
        />
      </div>

      <div className="rt-field">
        <label className="rt-label" htmlFor="lead-email">
          Email
        </label>
        <input
          id="lead-email"
          type="email"
          className="rt-input"
          value={data.email}
          onChange={set("email")}
          maxLength={200}
          autoComplete="email"
        />
      </div>

      <div className="rt-field">
        <label className="rt-label" htmlFor="lead-phone">
          Teléfono
        </label>
        <input
          id="lead-phone"
          type="tel"
          className="rt-input"
          value={data.phone}
          onChange={set("phone")}
          maxLength={40}
          autoComplete="tel"
        />
      </div>

      <div className="rt-field">
        <label className="rt-label" htmlFor="lead-message">
          Mensaje
        </label>
        <textarea
          id="lead-message"
          className="rt-textarea"
          value={data.message}
          onChange={set("message")}
          rows={3}
          maxLength={1000}
        />
      </div>

      {/* honeypot — oculto a humanos. El name del DOM es deliberadamente
          no-semántico: un name tipo "company" invita al AUTOFILL del navegador
          (que ignora autocomplete=off) y descartaría leads reales como bots.
          Los bots que rellenan todo input siguen cayendo. */}
      <input
        className="rt-form__hp"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        name="extra_field"
        value={data.company}
        onChange={set("company")}
      />

      <button className="rt-btn" type="submit" disabled={status === "sending"}>
        {status === "sending" ? "Enviando…" : submitLabel}
      </button>

      <p className="rt-form__hint">Déjanos un email o un teléfono para poder responderte.</p>

      {status === "error" ? (
        <p className="rt-form__status rt-form__status--err" role="alert">
          {rateLimited
            ? "Has hecho varias solicitudes seguidas. Espera un minuto e inténtalo de nuevo."
            : "No se pudo enviar. Revisa los datos e inténtalo de nuevo."}
        </p>
      ) : null}
    </form>
  );
}
