"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

// Widget "Valora tu piso gratis". Presentacional en cuanto a red: la app hace el
// fetch en `onSubmit` y devuelve la estimación (o null si la agencia no tiene
// comparables). Estilo 100% con tokens --tenant-*.
export type ValuationFormData = {
  name: string;
  email: string;
  phone: string;
  kind: string;
  areaM2: string;
  city: string;
  bedrooms: string;
  company: string; // honeypot
};

export type ValuationEstimate = {
  low: number;
  high: number;
  pricePerM2: number;
  comparables: number;
};

const EMPTY: ValuationFormData = {
  name: "",
  email: "",
  phone: "",
  kind: "flat",
  areaM2: "",
  city: "",
  bedrooms: "",
  company: "",
};

const KIND_OPTIONS = [
  { value: "flat", label: "Piso" },
  { value: "house", label: "Casa" },
  { value: "commercial", label: "Local" },
  { value: "land", label: "Terreno" },
  { value: "garage", label: "Garaje" },
];

const fmt = (n: number) => n.toLocaleString("es-ES");

type Field = HTMLInputElement | HTMLSelectElement;

export function ValuationForm({
  onSubmit,
  submitLabel = "Valorar mi piso",
}: {
  onSubmit: (data: ValuationFormData) => Promise<ValuationEstimate | null>;
  submitLabel?: string;
}) {
  const [data, setData] = useState<ValuationFormData>(EMPTY);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [estimate, setEstimate] = useState<ValuationEstimate | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

  const set = (key: keyof ValuationFormData) => (e: ChangeEvent<Field>) =>
    setData((d) => ({ ...d, [key]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    try {
      setEstimate(await onSubmit(data));
      setStatus("sent");
    } catch (err) {
      setRateLimited(err instanceof Error && err.message === "rate_limited");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="rt-valuation__result" role="status">
        {estimate ? (
          <>
            <div className="rt-eyebrow">Estimación orientativa</div>
            <div className="rt-valuation__range">
              {fmt(estimate.low)} – {fmt(estimate.high)} €
            </div>
            <p className="rt-form__hint">
              Basada en {estimate.comparables}{" "}
              {estimate.comparables === 1 ? "inmueble comparable" : "inmuebles comparables"} de
              nuestra cartera ({fmt(estimate.pricePerM2)} €/m²). Te contactamos para afinarla
              con una visita.
            </p>
          </>
        ) : (
          <p className="rt-form__status rt-form__status--ok">
            Gracias{data.name ? `, ${data.name}` : ""}. Hemos recibido los datos de tu inmueble
            y te enviaremos una valoración personalizada muy pronto.
          </p>
        )}
      </div>
    );
  }

  return (
    <form className="rt-form" onSubmit={handleSubmit} noValidate>
      <div className="rt-form__row">
        <div className="rt-field">
          <label className="rt-label" htmlFor="val-kind">
            Tipo
          </label>
          <select id="val-kind" className="rt-select" value={data.kind} onChange={set("kind")}>
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="rt-field">
          <label className="rt-label" htmlFor="val-area">
            Superficie (m²)
          </label>
          <input
            id="val-area"
            className="rt-input"
            type="number"
            min={1}
            inputMode="numeric"
            value={data.areaM2}
            onChange={set("areaM2")}
            required
          />
        </div>
      </div>

      <div className="rt-form__row">
        <div className="rt-field">
          <label className="rt-label" htmlFor="val-city">
            Ciudad
          </label>
          <input id="val-city" className="rt-input" value={data.city} onChange={set("city")} maxLength={120} />
        </div>
        <div className="rt-field">
          <label className="rt-label" htmlFor="val-bedrooms">
            Habitaciones
          </label>
          <input
            id="val-bedrooms"
            className="rt-input"
            type="number"
            min={0}
            inputMode="numeric"
            value={data.bedrooms}
            onChange={set("bedrooms")}
          />
        </div>
      </div>

      <div className="rt-field">
        <label className="rt-label" htmlFor="val-name">
          Nombre
        </label>
        <input
          id="val-name"
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
          <label className="rt-label" htmlFor="val-email">
            Email
          </label>
          <input
            id="val-email"
            type="email"
            className="rt-input"
            value={data.email}
            onChange={set("email")}
            maxLength={200}
            autoComplete="email"
          />
        </div>
        <div className="rt-field">
          <label className="rt-label" htmlFor="val-phone">
            Teléfono
          </label>
          <input
            id="val-phone"
            type="tel"
            className="rt-input"
            value={data.phone}
            onChange={set("phone")}
            maxLength={40}
            autoComplete="tel"
          />
        </div>
      </div>

      {/* honeypot — oculto a humanos. Name no-semántico a propósito: un name
          tipo "company" invita al AUTOFILL del navegador (que ignora
          autocomplete=off) y descartaría leads reales como bots. */}
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
        {status === "sending" ? "Calculando…" : submitLabel}
      </button>

      <p className="rt-form__hint">Déjanos un email o un teléfono para enviarte la valoración.</p>

      {status === "error" ? (
        <p className="rt-form__status rt-form__status--err" role="alert">
          {rateLimited
            ? "Has hecho varias solicitudes seguidas. Espera un minuto e inténtalo de nuevo."
            : "No se pudo calcular la valoración. Revisa los datos e inténtalo de nuevo."}
        </p>
      ) : null}
    </form>
  );
}
