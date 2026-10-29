import { Role } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { ChartImporter, type ChartImportView, type ChartSelectionView } from "@/components/chart-importer";
import { db } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";

export default async function ChartOfAccountsPage() {
  const context = await requirePageSession();
  const [imports, selections] = await Promise.all([
    db.chartImport.findMany({
      where: { companyId: context.companyId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        lines: { orderBy: { position: "asc" }, take: 100 },
        approvals: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } }
      }
    }),
    db.chartSelection.findMany({
      where: { companyId: context.companyId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        chartImport: { select: { id: true, sourceFileName: true, fileHash: true, rowCount: true } },
        approvals: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } }
      }
    })
  ]);
  const serialized: ChartImportView[] = imports.map((item) => ({
    id: item.id,
    sourceFileName: item.sourceFileName,
    fileHash: item.fileHash,
    rowCount: item.rowCount,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    approvalId: item.approvals[0]?.id ?? null,
    lines: item.lines
  }));
  const serializedSelections: ChartSelectionView[] = selections.map((item) => ({
    id: item.id,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    finalizedAt: item.finalizedAt?.toISOString() ?? null,
    approvalId: item.approvals[0]?.id ?? null,
    chartImport: item.chartImport
  }));
  return (
    <AppShell currentPath="/piano-dei-conti">
      <div className="pageHeading">
        <div>
          <span className="eyebrow">Configurazione contabile</span>
          <h1>Piano dei conti</h1>
          <p>Acquisisci, controlla e conserva una versione in bozza separata per ogni azienda.</p>
        </div>
      </div>
      <ChartImporter
        imports={serialized}
        selections={serializedSelections}
        canEdit={context.role === Role.OPERATOR || context.role === Role.ADMIN}
      />
    </AppShell>
  );
}
