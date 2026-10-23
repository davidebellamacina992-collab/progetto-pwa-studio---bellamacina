import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ApprovalsList } from "@/components/approvals-list";
import { requirePageSession } from "@/lib/page-auth";

export const metadata: Metadata = { title: "Approvazioni" };

export default async function ApprovalsPage() {
  await requirePageSession();
  return (
    <AppShell currentPath="/approvazioni">
      <div className="pageHeading compact">
        <div>
          <span className="eyebrow">Supervisione umana</span>
          <h1>Approvazioni</h1>
          <p>Controlla contenuto, differenze e anomalie prima di decidere.</p>
        </div>
      </div>
      <section className="panel" aria-labelledby="pending-title">
        <div className="panelHeader">
          <div><span className="eyebrow">Coda di revisione</span><h2 id="pending-title">In attesa</h2></div>
        </div>
        <ApprovalsList />
      </section>
    </AppShell>
  );
}
