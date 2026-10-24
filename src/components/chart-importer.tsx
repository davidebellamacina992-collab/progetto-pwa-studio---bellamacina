"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "./status-badge";

export type ChartImportView = {
  id: string;
  sourceFileName: string;
  fileHash: string;
  rowCount: number;
  status: string;
  createdAt: string;
  lines: Array<{
    id: string;
    code: string;
    name: string;
    accountType: string | null;
    parentCode: string | null;
    position: number;
  }>;
};

export function ChartImporter({
  imports,
  canEdit
}: {
  imports: ChartImportView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/chart-imports", {
        method: "POST",
        body: new FormData(event.currentTarget)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.message ?? "Importazione non riuscita.");
      } else {
        setSuccess("Piano dei conti acquisito come bozza. Nessun dato e stato attivato.");
        formRef.current?.reset();
        router.refresh();
      }
    } catch {
      setError("Connessione non disponibile. La bozza non e stata creata.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chartLayout">
      <section className="panel" aria-labelledby="chart-upload-title">
        <span className="eyebrow">Importazione controllata</span>
        <h2 id="chart-upload-title">Carica un piano dei conti</h2>
        <p className="mutedText">
          CSV UTF-8, massimo 2 MiB e 5.000 righe. Colonne obbligatorie:
          <strong> codice</strong> e <strong>nome</strong>. Facoltative: <strong>tipo</strong> e <strong>codice_padre</strong>.
        </p>
        <div className="formNotice">
          Il caricamento crea soltanto una bozza. Il piano non e utilizzabile nelle registrazioni
          finche non saranno disponibili revisione e approvazione esplicita.
        </div>
        {error ? <div className="errorPanel" role="alert">{error}</div> : null}
        {success ? <div className="successPanel" role="status">{success}</div> : null}
        <form ref={formRef} className="uploadForm" onSubmit={submit}>
          <div className="field">
            <label htmlFor="chart-file">File CSV</label>
            <input id="chart-file" name="file" type="file" accept=".csv,text/csv" required disabled={!canEdit || busy} />
          </div>
          <button className="button primary" type="submit" disabled={!canEdit || busy}>
            {busy ? "Verifica in corso…" : "Verifica e crea bozza"}
          </button>
        </form>
        {!canEdit ? <p className="formHint">Il tuo ruolo consente la consultazione, non il caricamento.</p> : null}
      </section>

      <section className="panel" aria-labelledby="chart-history-title">
        <div className="panelHeader">
          <div>
            <span className="eyebrow">Azienda selezionata</span>
            <h2 id="chart-history-title">Bozze recenti</h2>
          </div>
          <StatusBadge tone="warning">Solo bozze</StatusBadge>
        </div>
        {imports.length === 0 ? (
          <p className="emptyInline">Nessun piano dei conti importato.</p>
        ) : imports.map((item) => (
          <details className="chartImportCard" key={item.id}>
            <summary>
              <span><strong>{item.sourceFileName}</strong><small>{item.rowCount} conti · {new Date(item.createdAt).toLocaleString("it-IT")}</small></span>
              <StatusBadge tone="warning">Bozza</StatusBadge>
            </summary>
            <p className="hashLine">SHA-256: <code>{item.fileHash}</code></p>
            <div className="tableScroll">
              <table>
                <thead><tr><th>Codice</th><th>Nome</th><th>Tipo</th><th>Padre</th></tr></thead>
                <tbody>
                  {item.lines.map((line) => (
                    <tr key={line.id}>
                      <td><strong>{line.code}</strong></td>
                      <td>{line.name}</td>
                      <td>{line.accountType ?? "—"}</td>
                      <td>{line.parentCode ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {item.rowCount > item.lines.length ? <p className="formHint">Anteprima limitata alle prime 100 righe.</p> : null}
          </details>
        ))}
      </section>
    </div>
  );
}
