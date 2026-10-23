"use client";

import { FormEvent, useEffect, useState } from "react";

type TotpStatus = { enabled: boolean; verifiedInCurrentSession: boolean; requiredForApprovals: boolean };
type Setup = { secret: string; uri: string };

export function TotpSettings() {
  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/totp").then(async (response) => {
      if (!response.ok) throw new Error("Impossibile leggere lo stato MFA.");
      setStatus(await response.json() as TotpStatus);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "Errore MFA."));
  }, []);

  async function request(body: object) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/totp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as Setup & TotpStatus & { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Operazione non riuscita.");
      setMessage(payload.message ?? "Operazione completata.");
      return payload;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operazione non riuscita.");
      return null;
    } finally { setBusy(false); }
  }

  async function beginSetup() {
    const payload = await request({ action: "setup" });
    if (payload) setSetup({ secret: payload.secret, uri: payload.uri });
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    const payload = await request({ action: "verify", code });
    if (payload) { setStatus({ enabled: true, verifiedInCurrentSession: true, requiredForApprovals: status?.requiredForApprovals ?? false }); setSetup(null); setCode(""); }
  }

  async function disable(event: FormEvent) {
    event.preventDefault();
    const payload = await request({ action: "disable", code });
    if (payload) { setStatus({ enabled: false, verifiedInCurrentSession: false, requiredForApprovals: false }); setCode(""); }
  }

  return <section className="panel" aria-labelledby="mfa-title">
    <div className="panelHeader"><div><span className="eyebrow">Protezione account</span><h2 id="mfa-title">Autenticazione a due fattori</h2></div></div>
    {status?.requiredForApprovals ? <div className="blockingMessage">Obbligatoria per approvare o finalizzare operazioni in questa azienda.</div> : null}
    <p>Usa un’app compatibile TOTP. Il codice cambia ogni 30 secondi e non viene mai salvato dall’applicazione.</p>
    {message ? <div className="successPanel" role="status">{message}</div> : null}
    {error ? <div className="errorPanel" role="alert">{error}</div> : null}
    {!status ? <p role="status">Caricamento…</p> : null}
    {status && !status.enabled && !setup ? <button type="button" className="button primary" onClick={beginSetup} disabled={busy}>Configura autenticazione</button> : null}
    {setup ? <div className="decisionForm">
      <h3>1. Salva il segreto nell’app di autenticazione</h3>
      <p className="codeValue"><code>{setup.secret}</code></p>
      <p><a href={setup.uri}>Apri nell’app di autenticazione</a></p>
      <p>Il segreto è mostrato una sola volta. Non condividerlo e non inserirlo in documenti o ticket.</p>
      <form onSubmit={verify}><div className="field"><label htmlFor="setup-code">2. Verifica il codice a 6 cifre</label><input id="setup-code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="one-time-code" /></div><button className="button primary" disabled={busy}>Verifica e attiva</button></form>
    </div> : null}
    {status?.enabled ? <form className="decisionForm" onSubmit={disable}><p><strong>Stato:</strong> attiva{status.verifiedInCurrentSession ? " e verificata in questa sessione" : ""}.</p><div className="field"><label htmlFor="disable-code">Codice corrente per disattivare</label><input id="disable-code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="one-time-code" /></div><button className="button danger" disabled={busy || status.requiredForApprovals}>Disattiva</button></form> : null}
  </section>;
}
