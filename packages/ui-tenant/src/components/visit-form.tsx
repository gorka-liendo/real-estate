"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

// Formulario "Pedir visita" de la ficha. Presentacional en cuanto a red:
// la app hace el fetch en `onSubmit`. Fecha + franja de 30 min + contacto.
export type VisitFormData = {
  date: string; // yyyy-mm-dd
  time: string; // HH:mm
  name: string;
  email: string;
  phone: string;
  company: string; // honeypot
};

const EMPTY: VisitFormData = { date: "", time: "", name: "", email: "", phone: "", company: "" };

// Franjas de media hora en horario comercial (la agencia confirma después).
const TIME_SLOTS: string[] = [];
for (let h = 10; h < 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`, `${String(h).padStart(2, "0")}:30`);
}

function todayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1); // desde mañana
  return d.toISOString().slice(0, 10);
}

type Field = HTMLInputElement | HTMLSelectElement;

export function VisitForm({
  onSubmit,
  submitLabel = "Pedir visita",
}: {
  onSubmit: (data: VisitFormData) => Promise<void>;
  submitLabel?: string;
}) {
  const [data, setData] = useState<VisitFormData>(EMPTY);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [rateLimited, setRateLimited] = useState(false);

  const set = (key: keyof VisitFormData) => (e: ChangeEvent<Field>) =>
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
        Solicitud recibida{data.name ? `, ${data.name}` : ""}. Te confirmaremos la visita
        muy pronto.
      </div>
    );
  }

  return (
    <form className="rt-form" onSubmit={handleSubmit} noValidate>
      <div className="rt-form__row">
        <div className="rt-field">
          <label className="rt-label" htmlFor="visit-date">
            Día
          </label>
          <input
            id="visit-date"
            className="rt-input"
            type="date"
            min={todayISO()}
            value={data.date}
            onChange={set("date")}
            required
          />
        </div>
        <div className="rt-field">
          <label className="rt-label" htmlFor="visit-time">
            Hora
          </label>
          <select id="visit-time" className="rt-select" value={data.time} onChange={set("time")}>
            <option value="">Elegir…</option>
            {TIME_SLOTS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rt-field">
        <label className="rt-label" htmlFor="visit-name">
          Nombre
        </label>
        <input
          id="visit-name"
          className="rt-input"
          value={data.name}
          onChange={set("name")}
          required
          maxLength={200}
          autoComplete="name"
        />
      </div>

      <div className="rt-form__row">
        <div className="rt-field">
          <label className="rt-label" htmlFor="visit-email">
            Email
          </label>
          <input
            id="visit-email"
            type="email"
            className="rt-input"
            value={data.email}
            onChange={set("email")}
            maxLength={200}
            autoComplete="email"
          />
        </div>
        <div className="rt-field">
          <label className="rt-label" htmlFor="visit-phone">
            Teléfono
          </label>
          <input
            id="visit-phone"
            type="tel"
            className="rt-input"
            value={data.phone}
            onChange={set("phone")}
            maxLength={40}
            autoComplete="tel"
          />
        </div>
      </div>

      {/* honeypot — oculto a humanos, name no-autofillable */}
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

      <p className="rt-form__hint">Te confirmamos día y hora por email o teléfono.</p>

      {status === "error" ? (
        <p className="rt-form__status rt-form__status--err" role="alert">
          {rateLimited
            ? "Has hecho varias solicitudes seguidas. Espera un minuto e inténtalo de nuevo."
            : "No se pudo enviar. Revisa el día, la hora y tus datos de contacto."}
        </p>
      ) : null}
    </form>
  );
}
