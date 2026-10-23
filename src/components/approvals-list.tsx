"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState } from "./empty-state";
import { StatusBadge } from "./status-badge";

type ApprovalListItem = {
  id: string;
  title: string;
  objectType: string;
  requestedBy: string;
  requestedAt: string;
  riskLevel: "BASSO" | "MEDIO" | "ALTO";
  status: "DA_APPROVARE" | "APPROVATO" | "RESPINTO" | "FINALIZZATO";
};

export function ApprovalsList() {
  const [items, setItems] = useState<ApprovalListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/approvals", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("request_failed");
        const data = (await response.json()) as { items?: ApprovalListItem[] } | ApprovalListItem[];
        if (active) setItems(Array.isArray(data) ? data : (data.items ?? []));
      })
      .catch(() => { if (active) setError("Non è stato possibile caricare le approvazioni. Riprova."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <p className="loadingMessage" role="status">Caricamento delle approvazioni…</p>;
  if (error) return <div className="errorPanel" role="alert"><strong>Caricamento non riuscito</strong><p>{error}</p></div>;
  if (items.length === 0) return <EmptyState title="Nessuna approvazione in attesa" description="Le nuove richieste compariranno qui dopo l’elaborazione e la revisione." />;

  return (
    <div className="approvalList">
      {items.map((item) => (
        <Link href={`/approvazioni/${item.id}`} className="approvalRow" key={item.id}>
          <span className={`riskDot ${item.riskLevel.toLowerCase()}`} aria-label={`Impatto ${item.riskLevel.toLowerCase()}`} />
          <span className="approvalMain"><strong>{item.title}</strong><small>{item.objectType} · Richiesta da {item.requestedBy}</small></span>
          <span className="approvalDate">{new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.requestedAt))}</span>
          <StatusBadge tone={item.status === "FINALIZZATO" ? "success" : item.status === "RESPINTO" ? "danger" : item.status === "APPROVATO" ? "info" : "warning"}>
            {item.status === "DA_APPROVARE" ? "Da approvare" : item.status.toLowerCase()}
          </StatusBadge>
          <span aria-hidden="true">→</span>
        </Link>
      ))}
    </div>
  );
}
