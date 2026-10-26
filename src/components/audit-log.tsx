"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "./empty-state";

type AuditEvent = {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  reason: string | null;
  correlationId: string;
  entryHash: string;
  previousHash: string | null;
  createdAt: string;
};

function eventLabel(value: string) {
  const labels: Record<string, string> = {
    LOGIN_SUCCEEDED: "Accesso eseguito",
    APPROVAL_REQUESTED: "Approvazione richiesta",
    FIRST_APPROVAL_RECORDED: "Prima approvazione registrata",
    APPROVAL_COMPLETED: "Approvazione completata",
    APPROVAL_REJECTED: "Richiesta respinta",
    ACCOUNTING_DRAFT_FINALIZED: "Bozza finalizzata",
    CHART_IMPORT_APPROVAL_REQUESTED: "Piano dei conti inviato alla revisione",
    CHART_IMPORT_FINALIZED: "Piano dei conti finalizzato",
  };
  return labels[value] ?? value.replaceAll("_", " ").toLocaleLowerCase("it-IT");
}

function shortHash(value: string | null) {
  if (!value) return "Inizio catena";
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

export function AuditLog() {
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/audit", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("request_failed");
        const data = (await response.json()) as { items?: AuditEvent[] };
        if (active) setItems(data.items ?? []);
      })
      .catch(() => {
        if (active) setError("Non è stato possibile caricare il registro. Riprova.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("it-IT");
    if (!normalized) return items;
    return items.filter((item) =>
      [item.eventType, item.entityType, item.entityId, item.reason, item.correlationId, item.entryHash]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("it-IT").includes(normalized)),
    );
  }, [items, query]);

  if (loading) return <p className="loadingMessage" role="status">Caricamento del registro attività…</p>;
  if (error) return <div className="errorPanel" role="alert"><strong>Registro non disponibile</strong><p>{error}</p></div>;
  if (items.length === 0) return <EmptyState title="Registro ancora vuoto" description="Le azioni tracciate per questa azienda compariranno qui in ordine cronologico." />;

  return (
    <>
      <div className="auditToolbar">
        <div className="field auditSearch">
          <label htmlFor="audit-search">Cerca nel registro</label>
          <input
            id="audit-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Evento, oggetto, identificativo o hash"
          />
        </div>
        <p aria-live="polite">{filtered.length} {filtered.length === 1 ? "evento" : "eventi"}</p>
      </div>
      {filtered.length === 0 ? (
        <div className="emptyInline" role="status">Nessun evento corrisponde alla ricerca.</div>
      ) : (
        <div className="tableScroll">
          <table className="auditTable">
            <thead>
              <tr>
                <th scope="col">Data e ora</th>
                <th scope="col">Evento</th>
                <th scope="col">Oggetto</th>
                <th scope="col">Motivo</th>
                <th scope="col">Integrità</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td className="auditDate">
                    <time dateTime={item.createdAt}>
                      {new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(item.createdAt))}
                    </time>
                  </td>
                  <td><strong>{eventLabel(item.eventType)}</strong><small>Correlazione: {item.correlationId}</small></td>
                  <td><strong>{item.entityType}</strong><small>{item.entityId}</small></td>
                  <td>{item.reason || "—"}</td>
                  <td>
                    <details className="hashDetails">
                      <summary>{shortHash(item.entryHash)}</summary>
                      <dl>
                        <dt>Hash evento</dt><dd><code>{item.entryHash}</code></dd>
                        <dt>Hash precedente</dt><dd><code>{item.previousHash ?? "Inizio catena"}</code></dd>
                      </dl>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
