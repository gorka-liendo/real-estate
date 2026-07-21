"use client";

import { ArrowDownLeft, ArrowUpRight, Clock, Plus, Scale } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Select } from "@rep/ui";
import { useRequireModule, useWorkspace } from "@/contexts/workspace-context";
import { api, type Client, type Invoice, type InvoiceDirection, type Property } from "@/lib/api";
import {
  eurCents,
  ExpenseForm,
  IncomeForm,
  InvoiceTable,
  SummaryCard,
  TabButton,
} from "./_shared";

const currentYear = new Date().getFullYear();

// Sentinel para "sin inmueble/cliente asignado" — distinto de "" (que en los
// filtros significa "todos"), así la card "Sin asignar" de la vista agrupada
// puede filtrar específicamente los documentos sin ese vínculo.
const NONE = "__none__";

type GroupRow = {
  id: string;
  name: string;
  count: number;
  facturado: number;
  cobrado: number;
  pendiente: number;
  gastos: number;
  balance: number;
};

function groupInvoices(
  items: Invoice[],
  key: "propertyId" | "clientId",
  nameById: Record<string, string>,
): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const inv of items) {
    if (inv.status === "cancelled") continue;
    const id = inv[key] ?? NONE;
    const name = id === NONE ? "Sin asignar" : (nameById[id] ?? "—");
    let row = map.get(id);
    if (!row) {
      row = { id, name, count: 0, facturado: 0, cobrado: 0, pendiente: 0, gastos: 0, balance: 0 };
      map.set(id, row);
    }
    row.count += 1;
    if (inv.direction === "income") {
      row.facturado += inv.totalCents;
      row.cobrado += inv.paidCents;
      row.pendiente += inv.remainingCents;
    } else {
      row.gastos += inv.totalCents;
    }
  }
  for (const row of map.values()) row.balance = row.cobrado - row.gastos;
  return [...map.values()].sort((a, b) => b.facturado + b.gastos - (a.facturado + a.gastos));
}

function ContabilidadInner({ slug }: { slug: string }) {
  const { hasModule } = useWorkspace();
  const [items, setItems] = useState<Invoice[] | null>(null);
  const [propsList, setPropsList] = useState<Property[]>([]);
  const [clientsList, setClientsList] = useState<Client[]>([]);
  const [tab, setTab] = useState<InvoiceDirection>("income");
  const [showForm, setShowForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterPropertyId, setFilterPropertyId] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [viewMode, setViewMode] = useState<"movimientos" | "byProperty" | "byClient">("movimientos");

  const load = useCallback(async () => {
    try {
      setItems((await api.invoices.list(slug)).invoices);
    } catch {
      setError("No se pudieron cargar las facturas.");
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (hasModule("properties")) void api.properties.list(slug).then((r) => setPropsList(r.properties)).catch(() => {});
    if (hasModule("clients")) void api.clients.list(slug).then((r) => setClientsList(r.clients)).catch(() => {});
  }, [slug, hasModule]);

  function afterEdit(updated: Invoice) {
    setItems((prev) => (prev ?? []).map((i) => (i.id === updated.id ? updated : i)));
    setEditingInvoice(null);
    setShowForm(false);
  }

  function startEdit(inv: Invoice) {
    setTab(inv.direction);
    setEditingInvoice(inv);
    setViewMode("movimientos");
    setShowForm(true);
  }

  const propNameById = Object.fromEntries(propsList.map((p) => [p.id, p.title]));
  const clientNameById = Object.fromEntries(clientsList.map((c) => [c.id, c.name]));

  function matchesFilter(i: Invoice) {
    const propOk =
      !filterPropertyId || (filterPropertyId === NONE ? i.propertyId == null : i.propertyId === filterPropertyId);
    const clientOk =
      !filterClientId || (filterClientId === NONE ? i.clientId == null : i.clientId === filterClientId);
    return propOk && clientOk;
  }

  const all = (items ?? []).filter(matchesFilter);
  const yearItems = all.filter((i) => i.issueDate.startsWith(String(currentYear)) && i.status !== "cancelled");
  const incomeCollected = yearItems.filter((i) => i.direction === "income").reduce((a, i) => a + i.paidCents, 0);
  const incomePending = yearItems
    .filter((i) => i.direction === "income")
    .reduce((a, i) => a + i.remainingCents, 0);
  const expensesTotal = yearItems.filter((i) => i.direction === "expense").reduce((a, i) => a + i.totalCents, 0);
  const balance = incomeCollected - expensesTotal;

  const byProperty = groupInvoices(items ?? [], "propertyId", propNameById);
  const byClient = groupInvoices(items ?? [], "clientId", clientNameById);

  function openUnassigned(kind: "property" | "client") {
    if (kind === "property") {
      setFilterPropertyId(NONE);
      setFilterClientId("");
    } else {
      setFilterClientId(NONE);
      setFilterPropertyId("");
    }
    setViewMode("movimientos");
  }

  return (
    <div style={{ display: "grid", gap: "var(--ui-sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className="du-h1">Contabilidad</h1>
        <Button
          onClick={() => {
            setEditingInvoice(null);
            setViewMode("movimientos");
            setShowForm((v) => (viewMode === "movimientos" && !editingInvoice ? !v : true));
          }}
        >
          <Plus size={16} />
          {tab === "income" ? "Nueva factura" : "Nuevo gasto"}
        </Button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--ui-sp-4)",
        }}
      >
        <SummaryCard label={`Cobrado ${currentYear}`} value={eurCents(incomeCollected)} icon={<ArrowDownLeft size={20} />} />
        <SummaryCard label="Pendiente de cobro" value={eurCents(incomePending)} icon={<Clock size={20} />} />
        <SummaryCard label={`Gastos ${currentYear}`} value={eurCents(expensesTotal)} icon={<ArrowUpRight size={20} />} />
        <SummaryCard
          label="Balance"
          value={eurCents(balance)}
          accent={balance >= 0 ? "success" : "danger"}
          icon={<Scale size={20} />}
        />
      </div>

      {error ? <p className="du-alert">{error}</p> : null}

      <div style={{ display: "flex", gap: "var(--ui-sp-2)" }}>
        <TabButton active={viewMode === "movimientos"} onClick={() => setViewMode("movimientos")}>
          Movimientos
        </TabButton>
        {propsList.length > 0 ? (
          <TabButton active={viewMode === "byProperty"} onClick={() => setViewMode("byProperty")}>
            Por inmueble
          </TabButton>
        ) : null}
        {clientsList.length > 0 ? (
          <TabButton active={viewMode === "byClient"} onClick={() => setViewMode("byClient")}>
            Por cliente
          </TabButton>
        ) : null}
      </div>

      {viewMode === "byProperty" ? (
        <AccountsCards rows={byProperty} kind="inmueble" onSelectUnassigned={() => openUnassigned("property")} />
      ) : viewMode === "byClient" ? (
        <AccountsCards rows={byClient} kind="cliente" onSelectUnassigned={() => openUnassigned("client")} />
      ) : (
        <>
          <div style={{ display: "flex", gap: "var(--ui-sp-3)", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "var(--ui-sp-2)" }}>
              <TabButton
                active={tab === "income"}
                onClick={() => {
                  setTab("income");
                  setShowForm(false);
                  setEditingInvoice(null);
                }}
              >
                Facturas emitidas
              </TabButton>
              <TabButton
                active={tab === "expense"}
                onClick={() => {
                  setTab("expense");
                  setShowForm(false);
                  setEditingInvoice(null);
                }}
              >
                Gastos
              </TabButton>
            </div>

            {propsList.length > 0 ? (
              <Select
                aria-label="Filtrar por inmueble"
                value={filterPropertyId}
                onChange={(e) => setFilterPropertyId(e.target.value)}
                style={{ maxWidth: 220 }}
              >
                <option value="">Todos los inmuebles</option>
                {propsList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            ) : null}

            {clientsList.length > 0 ? (
              <Select
                aria-label="Filtrar por cliente"
                value={filterClientId}
                onChange={(e) => setFilterClientId(e.target.value)}
                style={{ maxWidth: 220 }}
              >
                <option value="">Todos los clientes</option>
                {clientsList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            ) : null}

            {filterPropertyId || filterClientId ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterPropertyId("");
                  setFilterClientId("");
                }}
              >
                Quitar filtros
              </Button>
            ) : null}
          </div>

          {showForm ? (
            tab === "income" ? (
              <IncomeForm
                slug={slug}
                propsList={propsList}
                clientsList={clientsList}
                initial={editingInvoice ?? undefined}
                onSaved={(inv) => {
                  if (editingInvoice) {
                    afterEdit(inv);
                  } else {
                    setItems((prev) => [inv, ...(prev ?? [])]);
                    setShowForm(false);
                  }
                }}
                onCancel={() => {
                  setEditingInvoice(null);
                  setShowForm(false);
                }}
              />
            ) : (
              <ExpenseForm
                slug={slug}
                propsList={propsList}
                clientsList={clientsList}
                initial={editingInvoice ?? undefined}
                onSaved={(inv) => {
                  if (editingInvoice) {
                    afterEdit(inv);
                  } else {
                    setItems((prev) => [inv, ...(prev ?? [])]);
                    setShowForm(false);
                  }
                }}
                onCancel={() => {
                  setEditingInvoice(null);
                  setShowForm(false);
                }}
              />
            )
          ) : null}

          <InvoiceTable
            slug={slug}
            items={all}
            direction={tab}
            propNameById={propNameById}
            clientNameById={clientNameById}
            onEdit={startEdit}
            onChange={setItems as (updater: (prev: Invoice[]) => Invoice[]) => void}
            emptyMessage={tab === "income" ? "Aún no has emitido ninguna factura." : "Aún no has registrado gastos."}
          />
        </>
      )}
    </div>
  );
}

function AccountsCards({
  rows,
  kind,
  onSelectUnassigned,
}: {
  rows: GroupRow[];
  kind: "inmueble" | "cliente";
  onSelectUnassigned: () => void;
}) {
  if (rows.length === 0) {
    return <p className="du-muted">Sin movimientos todavía.</p>;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: "var(--ui-sp-4)",
      }}
    >
      {rows.map((r) => {
        const body = (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--ui-sp-2)" }}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>{r.name}</span>
              <span className="du-muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                {r.count} doc{r.count === 1 ? "" : "s"}
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "4px 12px",
                fontSize: 13,
                marginTop: "var(--ui-sp-3)",
              }}
            >
              <span className="du-muted">Facturado</span>
              <span style={{ textAlign: "right" }}>{eurCents(r.facturado)}</span>
              <span className="du-muted">Pendiente</span>
              <span style={{ textAlign: "right" }}>{eurCents(r.pendiente)}</span>
              <span className="du-muted">Gastos</span>
              <span style={{ textAlign: "right" }}>{eurCents(r.gastos)}</span>
            </div>
            <div
              style={{
                marginTop: "var(--ui-sp-3)",
                paddingTop: "var(--ui-sp-3)",
                borderTop: "1px solid var(--ui-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span className="du-muted" style={{ fontSize: 13 }}>
                Balance
              </span>
              <span
                style={{
                  fontWeight: 700,
                  color: r.balance >= 0 ? "var(--ui-success)" : "var(--ui-danger)",
                }}
              >
                {eurCents(r.balance)}
              </span>
            </div>
          </>
        );

        const baseStyle = {
          display: "block",
          textAlign: "left" as const,
          background: "var(--ui-surface)",
          borderRadius: "var(--ui-radius-lg)",
          padding: "var(--ui-sp-4)",
          height: "100%",
          font: "inherit",
          color: "inherit",
        };

        if (r.id === NONE) {
          return (
            <button
              key={r.id}
              onClick={onSelectUnassigned}
              style={{ ...baseStyle, cursor: "pointer", border: "1px dashed var(--ui-border-strong)" }}
            >
              {body}
            </button>
          );
        }

        return (
          <Link
            key={r.id}
            href={`/contabilidad/${kind}/${r.id}`}
            className="dash-tile"
            style={{ ...baseStyle, textDecoration: "none", border: "1px solid var(--ui-border)", boxShadow: "var(--ui-shadow-sm)" }}
          >
            {body}
          </Link>
        );
      })}
    </div>
  );
}

export default function ContabilidadPage() {
  const { selected } = useWorkspace();
  const loading = useRequireModule("accounting");
  if (loading || !selected) return <p className="du-muted">Cargando…</p>;
  return <ContabilidadInner slug={selected.slug} />;
}
