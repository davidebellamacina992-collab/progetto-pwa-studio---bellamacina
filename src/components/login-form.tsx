"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
          totpCode: mfaRequired ? formData.get("totpCode") : undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        if ((payload as { error?: string } | null)?.error === "MFA_REQUIRED") setMfaRequired(true);
        setError(payload?.message ?? "Accesso non riuscito. Controlla i dati e riprova.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Il servizio non è raggiungibile. Riprova tra qualche istante.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="loginForm" onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="email">Email di lavoro</label>
        <input id="email" name="email" type="email" autoComplete="email" required placeholder="nome@azienda.it" />
      </div>
      {mfaRequired ? <div className="field"><label htmlFor="totpCode">Codice di autenticazione</label><input id="totpCode" name="totpCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /><small>Inserisci le 6 cifre mostrate nell’app di autenticazione.</small></div> : null}
      <div className="field">
        <div className="labelRow">
          <label htmlFor="password">Password</label>
          <span className="disabledText" title="Il recupero autonomo non e attivo">Password dimenticata? Contatta l’amministratore</span>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required minLength={12} />
      </div>
      {error ? <p className="formError" role="alert">{error}</p> : null}
      <button className="button primary full" type="submit" disabled={submitting}>
        {submitting ? "Accesso in corso…" : "Accedi in sicurezza"}
      </button>
      <p className="formHint">Per gli approvatori l’autenticazione a due fattori è obbligatoria salvo configurazione aziendale esplicita.</p>
    </form>
  );
}
