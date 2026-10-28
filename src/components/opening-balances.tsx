"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { StatusBadge } from "./status-badge";

type ChartOption = { id: string; name: string; rowCount: number };
type DraftView = { id: string; description: string; status: string; sourceFileHash: string | null; createdAt: string; approvalId: string | null; lines: Array<{ id: string; accountCode: string; description: string; debitCents: string; creditCents: string }> };

function euro(cents: string) {
  const value = BigInt(cents);
  return `${new Intl.NumberFormat("it-IT").format(value / 100n)},${(value % 100n).toString().padStart(2, "0")} €`;
}
function status(status: string) {
  if (status === "PENDING_APPROVAL" || status === "PARTIALLY_APPROVED") return { label: "Da approvare", tone: "warning" as const };
  if (status === "APPROVED") return { label: "Approvata", tone: "info" as const };
  if (status === "REJECTED") return { label: "Respinta", tone: "danger" as const };
  if (status === "FINALIZED") return { label: "Finalizzata", tone: "success" as const };
  return { label: "Bozza", tone: "warning" as const };
}

export function OpeningBalances({ charts, drafts, canEdit }: { charts: ChartOption[]; drafts: DraftView[]; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [reviewing, setReviewing] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState("");
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/saldi-iniziali", { method: "POST", body: new FormData(form) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message ?? "Importazione non riuscita.");
      form.reset(); setMessage("Saldi acquisiti come bozza quadrata. Nessuna registrazione e stata finalizzata."); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Importazione non riuscita."); }
    finally { setBusy(false); }
  }
  async function requestReview(id: string) {
    setReviewing(id); setError("");
    try {
      const response = await fetch(`/api/drafts/${encodeURIComponent(id)}/request-approval`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message ?? "Invio non riuscito.");
      setMessage("Scrittura dei saldi inviata alla revisione umana."); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Invio non riuscito."); }
    finally { setReviewing(""); }
  }
  return <div className="chartLayout">
    <section className="panel"><span className="eyebrow">Importazione controllata</span><h2>Carica i saldi iniziali</h2>
      <p className="mutedText">CSV UTF-8 con colonne: <strong>codice, descrizione, dare, avere</strong>. Importi con massimo due decimali.</p>
      <div className="formNotice">Il file deve quadrare e usare conti appartenenti a un piano finalizzato. Il risultato nasce sempre come bozza.</div>
      {error ? <div className="errorPanel" role="alert">{error}</div> : null}{message ? <div className="successPanel" role="status">{message}</div> : null}
      <form className="uploadForm" onSubmit={upload}><div className="field"><label htmlFor="opening-chart">Piano dei conti finalizzato</label><select id="opening-chart" name="chartImportId" required disabled={!canEdit || busy}><option value="">Seleziona…</option>{charts.map((chart) => <option key={chart.id} value={chart.id}>{chart.name} · {chart.rowCount} conti</option>)}</select></div><div className="field"><label htmlFor="opening-file">File CSV</label><input id="opening-file" name="file" type="file" accept=".csv,text/csv" required disabled={!canEdit || busy || charts.length === 0} /></div><button className="button primary" disabled={!canEdit || busy || charts.length === 0}>{busy ? "Controllo…" : "Verifica e crea bozza"}</button></form>
      {charts.length === 0 ? <p className="formHint">Finalizza prima un piano dei conti.</p> : null}
    </section>
    <section className="panel"><div className="panelHeader"><div><span className="eyebrow">Azienda selezionata</span><h2>Importazioni recenti</h2></div><StatusBadge tone="info">{drafts.length}</StatusBadge></div>
      {drafts.length === 0 ? <p className="emptyInline">Nessun saldo iniziale importato.</p> : drafts.map((draft) => { const view = status(draft.status); return <details className="chartImportCard" key={draft.id}><summary><span><strong>{draft.description}</strong><small>{new Date(draft.createdAt).toLocaleString("it-IT")}</small></span><StatusBadge tone={view.tone}>{view.label}</StatusBadge></summary><div className="tableScroll"><table><thead><tr><th>Conto</th><th>Descrizione</th><th>Dare</th><th>Avere</th></tr></thead><tbody>{draft.lines.map((line) => <tr key={line.id}><td>{line.accountCode}</td><td>{line.description}</td><td>{euro(line.debitCents)}</td><td>{euro(line.creditCents)}</td></tr>)}</tbody></table></div><div className="chartImportActions">{draft.status === "DRAFT" && canEdit ? <button className="button primary" type="button" disabled={reviewing === draft.id} onClick={() => requestReview(draft.id)}>{reviewing === draft.id ? "Invio…" : "Invia alla revisione"}</button> : null}{draft.approvalId ? <Link className="button secondary" href={`/approvazioni/${draft.approvalId}`}>Apri revisione</Link> : null}</div></details>; })}
    </section>
  </div>;
}
