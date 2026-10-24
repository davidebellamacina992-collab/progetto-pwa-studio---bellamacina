import { Role } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { ChartImporter, type ChartImportView } from "@/components/chart-importer";
import { db } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";

export default async function ChartOfAccountsPage() {
  const context = await requirePageSession();
  const imports = await db.chartImport.findMany({
    where: { companyId: context.companyId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { lines: { orderBy: { position: "asc" }, take: 100 } }
  });
  const serialized: ChartImportView[] = imports.map((item) => ({
    id: item.id,
    sourceFileName: item.sourceFileName,
    fileHash: item.fileHash,
    rowCount: item.rowCount,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    lines: item.lines
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
        canEdit={context.role === Role.OPERATOR || context.role === Role.ADMIN}
      />
    </AppShell>
  );
}
