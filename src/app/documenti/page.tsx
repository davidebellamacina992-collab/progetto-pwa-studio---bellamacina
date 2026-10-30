import { Role } from "@prisma/client";
import { AccountingDocuments, type AccountingDocumentView } from "@/components/accounting-documents";
import { AppShell } from "@/components/app-shell";
import { db } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";

export default async function DocumentsPage() {
  const context = await requirePageSession();
  const documents = await db.accountingDocument.findMany({
    where: { companyId: context.companyId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { extraction: true, approvals: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } } }
  });
  const items: AccountingDocumentView[] = documents.map((item) => ({
    id: item.id,
    sourceFileName: item.sourceFileName,
    fileHash: item.fileHash,
    byteSize: item.byteSize,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    approvalId: item.approvals[0]?.id ?? null,
    extraction: item.extraction ? {
      supplierName: item.extraction.supplierName,
      supplierVatNumber: item.extraction.supplierVatNumber,
      customerVatNumber: item.extraction.customerVatNumber,
      documentNumber: item.extraction.documentNumber,
      issueDate: item.extraction.issueDate?.toISOString().slice(0, 10) ?? null,
      currencyCode: item.extraction.currencyCode,
      taxableCents: item.extraction.taxableCents?.toString() ?? null,
      vatCents: item.extraction.vatCents?.toString() ?? null,
      totalCents: item.extraction.totalCents?.toString() ?? null,
      dueDate: item.extraction.dueDate?.toISOString().slice(0, 10) ?? null,
      confidencePermille: item.extraction.confidencePermille,
      warnings: Array.isArray(item.extraction.warnings) ? item.extraction.warnings as Array<{ severity?: string; message?: string }> : []
    } : null
  }));
  return <AppShell currentPath="/documenti">
    <div className="pageHeading"><div><span className="eyebrow">Ciclo passivo e attivo</span><h1>Documenti contabili</h1><p>Carica e controlla fatture elettroniche senza registrazioni o invii automatici.</p></div></div>
    <AccountingDocuments items={items} canEdit={context.role === Role.OPERATOR || context.role === Role.ADMIN} />
  </AppShell>;
}
