"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { StatusBadge } from "./status-badge";

type Change = { field: string; before: string | null; after: string | null };
type Anomaly = { id: string; severity: "INFO" | "ATTENZIONE" | "BLOCCANTE"; message: string };
type ApprovalDetail = {
  id: string;
  title: string;
  description: string;
  objectType: string;
  status: string;
  requestedBy: string;
  requestedAt: string;
  riskLevel: "BASSO" | "MEDIO" | "ALTO";
  requiresStrongConfirmation: boolean;
  requiresSecondApproval: boolean;
  changes: Change[];
  anomalies: Anomaly[];
};

export function ApprovalDetailView({ id }: { id: string }) {
  const [data, setData] = useState<ApprovalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [decision, setDecision] = useState<"approve" | "reject" | "finalize" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/approvals/${encodeURIComponent(id)}`, { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("request_failed");
        const payload = (await response.json()) as ApprovalDetail;
        if (active) setData(payload);
      })
      .catch(() => { if (active) setError("Non è stato possibile caricare questa richiesta."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !decision) return;
    if (decision === "reject" && reason.trim().length < 5) {
      setError("Indica una motivazione di almeno 5 caratteri per il rifiuto.");
      return;
    }
    if (decision === "approve" && data.requiresStrongConfirmation && confirmation !== "APPROVO") {
      setError("Per confermare, digita esattamente APPROVO.");
      return;
    }
    if (decision === "finalize" && confirmation !== "FINALIZZO") {
      setError("Per finalizzare, digita esattamente FINALIZZO.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/approvals/${encodeURIComponent(id)}/${decision}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined, confirmation }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; status?: string } | null;
      if (!response.ok) throw new Error(payload?.message ?? "La decisione non è stata registrata.");
      setResult(payload?.message ?? (decision === "approve" ? "Approvazione registrata." : decision === "finalize" ? "Finalizzazione registrata." : "Rifiuto registrato."));
      const nextStatus = payload?.status === "PARTIALLY_APPROVED"
        ? "DA_APPROVARE"
        : decision === "finalize"
          ? "FINALIZZATO"
          : decision === "reject"
            ? "RESPINTO"
            : "APPROVATO";
      setData({ ...data, status: nextStatus });
      setDecision(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operazione non riuscita.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="loadingMessage" role="status">Caricamento del dettaglio…</p>;
  if (!data) return <div className="errorPanel" role="alert"><strong>Richiesta non disponibile</strong><p>{error || "La richiesta non esiste o non è accessibile per questa azienda."}</p><Link href="/approvazioni">Torna alle approvazioni</Link></div>;

  const hasBlockingAnomaly = data.anomalies.some((item) => item.severity === "BLOCCANTE");
  return (
    <>
      <div className="detailBreadcrumb"><Link href="/approvazioni">Approvazioni</Link><span aria-hidden="true">/</span><span>Dettaglio richiesta</span></div>
      <div className="pageHeading compact">
        <div><span className="eyebrow">{data.objectType}</span><h1>{data.title}</h1><p>{data.description}</p></div>
        <StatusBadge tone={data.status === "FINALIZZATO" ? "success" : data.status === "RESPINTO" ? "danger" : data.status === "APPROVATO" ? "info" : "warning"}>
          {data.status === "DA_APPROVARE" ? "Da approvare" : data.status.toLowerCase()}
        </StatusBadge>
      </div>

      {result ? <div className="successPanel" role="status">{result}</div> : null}
      {error ? <div className="errorPanel" role="alert">{error}</div> : null}

      <div className="detailGrid">
        <div className="detailMain">
          <section className="panel" aria-labelledby="summary-title">
            <div className="panelHeader"><div><span className="eyebrow">Cosa verrà fatto</span><h2 id="summary-title">Riepilogo dell’operazione</h2></div></div>
            <dl className="summaryList">
              <div><dt>Richiesta da</dt><dd>{data.requestedBy}</dd></div>
              <div><dt>Data richiesta</dt><dd>{new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeStyle: "short" }).format(new Date(data.requestedAt))}</dd></div>
              <div><dt>Livello di impatto</dt><dd><StatusBadge tone={data.riskLevel === "ALTO" ? "danger" : data.riskLevel === "MEDIO" ? "warning" : "info"}>{data.riskLevel.toLowerCase()}</StatusBadge></dd></div>
              <div><dt>Seconda approvazione</dt><dd>{data.requiresSecondApproval ? "Richiesta" : "Non richiesta"}</dd></div>
            </dl>
          </section>

          <section className="panel" aria-labelledby="diff-title">
            <div className="panelHeader"><div><span className="eyebrow">Prima e dopo</span><h2 id="diff-title">Differenze</h2></div></div>
            {data.changes.length ? (
              <div className="tableScroll"><table><thead><tr><th scope="col">Campo</th><th scope="col">Valore attuale</th><th scope="col">Nuovo valore</th></tr></thead><tbody>{data.changes.map((change) => <tr key={change.field}><th scope="row">{change.field}</th><td className="beforeValue">{change.before ?? "—"}</td><td className="afterValue">{change.after ?? "—"}</td></tr>)}</tbody></table></div>
            ) : <p className="mutedCopy">Nessuna differenza disponibile.</p>}
          </section>

          <section className="panel" aria-labelledby="anomaly-title">
            <div className="panelHeader"><div><span className="eyebrow">Controlli automatici</span><h2 id="anomaly-title">Anomalie rilevate</h2></div><StatusBadge tone={hasBlockingAnomaly ? "danger" : data.anomalies.length ? "warning" : "success"}>{data.anomalies.length}</StatusBadge></div>
            {data.anomalies.length ? <ul className="anomalyList">{data.anomalies.map((item) => <li key={item.id} className={item.severity.toLowerCase()}><strong>{item.severity === "BLOCCANTE" ? "Bloccante" : item.severity === "ATTENZIONE" ? "Da controllare" : "Informazione"}</strong><span>{item.message}</span></li>)}</ul> : <p className="checkOk">✓ Nessuna anomalia rilevata dai controlli configurati.</p>}
          </section>
        </div>

        <aside className="decisionCard" aria-labelledby="decision-title">
          <span className="eyebrow">Decisione umana</span><h2 id="decision-title">Controlla e decidi</h2>
          <p>La decisione sarà registrata nel registro di audit e non potrà essere cancellata.</p>
          {hasBlockingAnomaly ? <div className="blockingMessage">Risolvi le anomalie bloccanti prima di approvare.</div> : null}
          <button className="button primary full" type="button" onClick={() => setDecision("approve")} disabled={hasBlockingAnomaly || data.status !== "DA_APPROVARE"}>Approva</button>
          <button className="button danger full" type="button" onClick={() => setDecision("reject")} disabled={data.status !== "DA_APPROVARE"}>Respingi con motivazione</button>
          {data.status === "APPROVATO" ? <button className="button primary full" type="button" onClick={() => setDecision("finalize")}>Finalizza l’operazione</button> : null}
          <span className="button secondary full disabledButton" aria-disabled="true" title="La modifica guidata sarà disponibile nella fase successiva">
            Modifica la bozza · Fase successiva
          </span>
          {decision ? (
            <form className="decisionForm" onSubmit={submitDecision}>
              <h3>{decision === "approve" ? "Conferma l’approvazione" : decision === "finalize" ? "Conferma la finalizzazione" : "Motiva il rifiuto"}</h3>
              {decision === "approve" && data.requiresStrongConfirmation ? <div className="field"><label htmlFor="confirmation">Digita <strong>APPROVO</strong></label><input id="confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></div> : null}
              {decision === "reject" ? <div className="field"><label htmlFor="reason">Motivazione obbligatoria</label><textarea id="reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={4} required minLength={5} /></div> : null}
              {decision === "finalize" ? <div className="field"><label htmlFor="final-confirmation">Digita <strong>FINALIZZO</strong></label><input id="final-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></div> : null}
              <div className="decisionFormActions"><button className="button primary" type="submit" disabled={submitting}>{submitting ? "Registrazione…" : "Conferma decisione"}</button><button className="button ghost" type="button" onClick={() => setDecision(null)}>Annulla</button></div>
            </form>
          ) : null}
        </aside>
      </div>
    </>
  );
}
