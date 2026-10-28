import { Role, WorkStatus } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { OpeningBalances } from "@/components/opening-balances";
import { db } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";

export default async function OpeningBalancesPage() {
  const context = await requirePageSession();
  const [charts, drafts] = await Promise.all([
    db.chartImport.findMany({ where: { companyId: context.companyId, status: WorkStatus.FINALIZED }, orderBy: { finalizedAt: "desc" }, select: { id: true, sourceFileName: true, rowCount: true } }),
    db.accountingDraft.findMany({ where: { companyId: context.companyId, sourceType: "OPENING_BALANCE_CSV" }, orderBy: { createdAt: "desc" }, take: 20, include: { lines: { take: 100 }, approvals: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } } } })
  ]);
  return <AppShell currentPath="/saldi-iniziali"><div className="pageHeading"><div><span className="eyebrow">Configurazione contabile</span><h1>Saldi iniziali</h1><p>Importa e quadra la situazione di apertura prima della revisione umana.</p></div></div><OpeningBalances charts={charts.map((item) => ({ id: item.id, name: item.sourceFileName, rowCount: item.rowCount }))} drafts={drafts.map((item) => ({ id: item.id, description: item.description, status: item.status, sourceFileHash: item.sourceFileHash, createdAt: item.createdAt.toISOString(), approvalId: item.approvals[0]?.id ?? null, lines: item.lines.map((line) => ({ ...line, debitCents: line.debitCents.toString(), creditCents: line.creditCents.toString() })) }))} canEdit={context.role === Role.OPERATOR || context.role === Role.ADMIN} /></AppShell>;
}
