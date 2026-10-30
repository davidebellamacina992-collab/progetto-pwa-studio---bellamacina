"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "./status-badge";

type Warning = { severity?: string; message?: string };

export type AccountingDocumentView = {
  id: string;
  sourceFileName: string;
  fileHash: string;
  byteSize: number;
  status: string;
  createdAt: string;
  approvalId: string | null;
  extraction: {
    supplierName: string | null;
    supplierVatNumber: string | null;
    customerVatNumber: string | null;
    documentNumber: string | null;
    issueDate: string | null;
    currencyCode: string;
    taxableCents: string | null;
    vatCents: string | null;
    totalCents: string | null;
    dueDate: string | null;
    confidencePermille: number;
    warnings: Warning[];
  } | null;
};

function statusView(status: string) {
  if (status === "PENDING_APPROVAL" || status === "PARTIALLY_APPROVED") return { label: "Da approvare", tone: "warning" as const };
  if (status === "APPROVED") return { label: "Approvato", tone: "info" as const };
  if (status === "REJECTED") return { label: "Respinto", tone: "danger" as const };
  if (status === "FINALIZED") return { label: "Finalizzato", tone: "success" as const };
  return { label: "Bozza", tone: "warning" as const };
}

function formatCents(value: string | null, currency: string) {
  if (value === null) return "—";
  const cents = BigInt(value);
  return `${currency} ${(cents / 100n).toLocaleString("it-IT")},${(cents % 100n).toString().padStart(2, "0")}`;
}

export function AccountingDocuments({ items, canEdit }: { items: AccountingDocumentView[]; canEdit: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [reviewingId, setReviewingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/documents", { method: "POST", body: new FormData(event.currentTarget) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message ?? "Caricamento non riuscito.");
      setSuccess("Fattura acquisita ed estratta come bozza. Nessuna registrazione e stata creata.");
      formRef.current?.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Caricamento non riuscito.");
    } finally { setBusy(false); }
  }

  async function requestReview(id: string) {
    setReviewingId(id); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(id)}/request-approval`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message ?? "Invio alla revisione non riuscito.");
      setSuccess("Documento inviato alla revisione umana.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invio alla revisione non riuscito.");
    } finally { setReviewingId(""); }
  }

  return <div className="chartLayout">
    <section className="panel" aria-labelledby="document-upload-title">
      <span className="eyebrow">Acquisizione controllata</span>
      <h2 id="document-upload-title">Carica una fattura elettronica</h2>
      <p className="mutedText">File XML FatturaPA in UTF-8, massimo 10 MiB. Il sistema conserva l’originale con hash SHA-256 ed estrae soltanto una bozza verificabile.</p>
      <div className="formNotice">Nessun dato viene registrato in contabilità e nessun file viene inviato all’esterno. Controlla sempre i valori estratti.</div>
      {error ? <div className="errorPanel" role="alert">{error}</div> : null}
      {success ? <div className="successPanel" role="status">{success}</div> : null}
      <form ref={formRef} className="uploadForm" onSubmit={upload}>
        <div className="field"><label htmlFor="fatturapa-file">File XML FatturaPA</label><input id="fatturapa-file" name="file" type="file" accept=".xml,application/xml,text/xml" required disabled={!canEdit || busy} /></div>
        <button className="button primary" type="submit" disabled={!canEdit || busy}>{busy ? "Analisi in corso…" : "Analizza e crea bozza"}</button>
      </form>
      {!canEdit ? <p className="formHint">Il tuo ruolo consente la consultazione, non il caricamento.</p> : null}
    </section>

    <section className="panel" aria-labelledby="document-history-title">
      <div className="panelHeader"><div><span className="eyebrow">Azienda selezionata</span><h2 id="document-history-title">Documenti recenti</h2></div><StatusBadge tone="info">FatturaPA XML</StatusBadge></div>
      {items.length === 0 ? <p className="emptyInline">Nessun documento caricato.</p> : items.map((item) => {
        const status = statusView(item.status);
        const extraction = item.extraction;
        return <details className="chartImportCard" key={item.id}>
          <summary><span><strong>{item.sourceFileName}</strong><small>{Math.ceil(item.byteSize / 1024)} KiB · {new Date(item.createdAt).toLocaleString("it-IT")}</small></span><StatusBadge tone={status.tone}>{status.label}</StatusBadge></summary>
          <p className="hashLine">SHA-256: <code>{item.fileHash}</code></p>
          {extraction ? <>
            <dl className="summaryList">
              <div><dt>Fornitore</dt><dd>{extraction.supplierName ?? "—"}</dd></div>
              <div><dt>Partita IVA fornitore</dt><dd>{extraction.supplierVatNumber ?? "—"}</dd></div>
              <div><dt>Documento</dt><dd>{extraction.documentNumber ?? "—"} · {extraction.issueDate ?? "data mancante"}</dd></div>
              <div><dt>Imponibile</dt><dd>{formatCents(extraction.taxableCents, extraction.currencyCode)}</dd></div>
              <div><dt>IVA</dt><dd>{formatCents(extraction.vatCents, extraction.currencyCode)}</dd></div>
              <div><dt>Totale</dt><dd><strong>{formatCents(extraction.totalCents, extraction.currencyCode)}</strong></dd></div>
              <div><dt>Affidabilita estrazione</dt><dd>{Math.floor(extraction.confidencePermille / 10)}%</dd></div>
            </dl>
            {extraction.warnings.length ? <ul className="anomalyList">{extraction.warnings.map((warning, index) => <li className="attenzione" key={index}><strong>Da controllare</strong><span>{warning.message ?? "Verifica richiesta"}</span></li>)}</ul> : <p className="checkOk">✓ I controlli strutturali non hanno rilevato anomalie.</p>}
          </> : <p className="errorPanel">Dati estratti non disponibili.</p>}
          <div className="chartImportActions">
            {item.status === "DRAFT" && canEdit ? <button className="button primary" type="button" disabled={reviewingId === item.id} onClick={() => requestReview(item.id)}>{reviewingId === item.id ? "Invio in corso…" : "Invia alla revisione"}</button> : null}
            {item.approvalId ? <Link className="button secondary" href={`/approvazioni/${item.approvalId}`}>Apri revisione</Link> : null}
          </div>
        </details>;
      })}
    </section>
  </div>;
}
