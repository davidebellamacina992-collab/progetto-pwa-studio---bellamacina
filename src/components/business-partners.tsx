"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { StatusBadge } from "./status-badge";

export type BusinessPartnerView = {
  id: string;
  kind: "CUSTOMER" | "SUPPLIER" | "BOTH";
  displayName: string;
  taxCode: string | null;
  vatNumber: string | null;
  email: string | null;
  countryCode: string;
  status: string;
  createdAt: string;
  approvalId: string | null;
};

const kindLabels = { CUSTOMER: "Cliente", SUPPLIER: "Fornitore", BOTH: "Cliente e fornitore" } as const;

function statusView(status: string) {
  if (status === "PENDING_APPROVAL" || status === "PARTIALLY_APPROVED") return { label: "Da approvare", tone: "warning" as const };
  if (status === "APPROVED") return { label: "Approvata", tone: "info" as const };
  if (status === "REJECTED") return { label: "Respinta", tone: "danger" as const };
  if (status === "FINALIZED") return { label: "Finalizzata", tone: "success" as const };
  return { label: "Bozza", tone: "warning" as const };
}

export function BusinessPartners({ items, canEdit }: { items: BusinessPartnerView[]; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reviewingId, setReviewingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch("/api/anagrafiche", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message ?? "Creazione non riuscita.");
      form.reset();
      setMessage("Anagrafica salvata come bozza. Nessun dato e stato attivato.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Creazione non riuscita.");
    } finally { setBusy(false); }
  }

  async function requestReview(id: string) {
    setReviewingId(id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/anagrafiche/${encodeURIComponent(id)}/request-approval`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message ?? "Invio alla revisione non riuscito.");
      setMessage("Anagrafica inviata alla revisione umana.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invio alla revisione non riuscito.");
    } finally { setReviewingId(""); }
  }

  return <div className="chartLayout">
    <section className="panel" aria-labelledby="partner-create-title">
      <span className="eyebrow">Nuova bozza</span>
      <h2 id="partner-create-title">Cliente o fornitore</h2>
      <p className="mutedText">Inserisci i dati identificativi. La creazione non rende l&apos;anagrafica operativa.</p>
      <div className="formNotice">Dopo il controllo, invia la bozza alla revisione. Solo un responsabile puo approvarla e finalizzarla.</div>
      {error ? <div className="errorPanel" role="alert">{error}</div> : null}
      {message ? <div className="successPanel" role="status">{message}</div> : null}
      <form className="uploadForm" onSubmit={create}>
        <div className="field"><label htmlFor="kind">Tipo</label><select id="kind" name="kind" required disabled={!canEdit || busy}><option value="CUSTOMER">Cliente</option><option value="SUPPLIER">Fornitore</option><option value="BOTH">Cliente e fornitore</option></select></div>
        <div className="field"><label htmlFor="displayName">Denominazione</label><input id="displayName" name="displayName" required minLength={2} maxLength={200} disabled={!canEdit || busy} /></div>
        <div className="formGrid">
          <div className="field"><label htmlFor="taxCode">Codice fiscale</label><input id="taxCode" name="taxCode" minLength={11} maxLength={16} disabled={!canEdit || busy} /></div>
          <div className="field"><label htmlFor="vatNumber">Partita IVA</label><input id="vatNumber" name="vatNumber" minLength={5} maxLength={20} disabled={!canEdit || busy} /></div>
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" maxLength={254} disabled={!canEdit || busy} /></div>
          <div className="field"><label htmlFor="phone">Telefono</label><input id="phone" name="phone" maxLength={40} disabled={!canEdit || busy} /></div>
          <div className="field"><label htmlFor="countryCode">Paese</label><input id="countryCode" name="countryCode" defaultValue="IT" pattern="[A-Za-z]{2}" maxLength={2} required disabled={!canEdit || busy} /></div>
        </div>
        <div className="field"><label htmlFor="address">Indirizzo</label><input id="address" name="address" maxLength={300} disabled={!canEdit || busy} /></div>
        <button className="button primary" type="submit" disabled={!canEdit || busy}>{busy ? "Salvataggio…" : "Salva come bozza"}</button>
      </form>
      {!canEdit ? <p className="formHint">Il tuo ruolo consente la consultazione, non la modifica.</p> : null}
    </section>
    <section className="panel" aria-labelledby="partner-list-title">
      <div className="panelHeader"><div><span className="eyebrow">Azienda selezionata</span><h2 id="partner-list-title">Anagrafiche</h2></div><StatusBadge tone="info">{items.length}</StatusBadge></div>
      {items.length === 0 ? <p className="emptyInline">Nessuna anagrafica presente.</p> : items.map((item) => {
        const status = statusView(item.status);
        return <article className="chartImportCard" key={item.id}>
          <div className="partnerRow"><span><strong>{item.displayName}</strong><small>{kindLabels[item.kind]} · {item.countryCode}</small></span><StatusBadge tone={status.tone}>{status.label}</StatusBadge></div>
          <dl className="partnerFacts"><div><dt>Codice fiscale</dt><dd>{item.taxCode ?? "—"}</dd></div><div><dt>Partita IVA</dt><dd>{item.vatNumber ?? "—"}</dd></div><div><dt>Email</dt><dd>{item.email ?? "—"}</dd></div></dl>
          <div className="chartImportActions">
            {item.status === "DRAFT" && canEdit ? <button className="button primary" type="button" disabled={reviewingId === item.id} onClick={() => requestReview(item.id)}>{reviewingId === item.id ? "Invio…" : "Invia alla revisione"}</button> : null}
            {item.approvalId ? <Link className="button secondary" href={`/approvazioni/${item.approvalId}`}>Apri revisione</Link> : null}
          </div>
        </article>;
      })}
    </section>
  </div>;
}
