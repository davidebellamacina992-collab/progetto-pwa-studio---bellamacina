import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { AuditLog } from "@/components/audit-log";
import { requirePageSession } from "@/lib/page-auth";

export const metadata: Metadata = { title: "Registro attività" };

export default async function AuditPage() {
  await requirePageSession();
  return (
    <AppShell currentPath="/audit">
      <div className="pageHeading compact">
        <div>
          <span className="eyebrow">Tracciabilità append-only</span>
          <h1>Registro attività</h1>
          <p>Consulta le azioni della società selezionata e la catena di integrità degli eventi.</p>
        </div>
      </div>
      <section className="panel" aria-labelledby="audit-title">
        <div className="panelHeader">
          <div><span className="eyebrow">Azioni registrate</span><h2 id="audit-title">Eventi più recenti</h2></div>
          <span className="statusBadge success">Solo lettura</span>
        </div>
        <AuditLog />
      </section>
    </AppShell>
  );
}
