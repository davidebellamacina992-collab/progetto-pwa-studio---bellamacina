import { WorkStatus } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, errorResponse } from "@/lib/errors";

function uiStatus(status: WorkStatus) {
  if (status === WorkStatus.PENDING_APPROVAL || status === WorkStatus.PARTIALLY_APPROVED) return "DA_APPROVARE";
  if (status === WorkStatus.APPROVED) return "APPROVATO";
  if (status === WorkStatus.REJECTED) return "RESPINTO";
  if (status === WorkStatus.FINALIZED) return "FINALIZZATO";
  return "BOZZA";
}

type Snapshot = {
  description?: string;
  displayName?: string;
  kind?: string;
  taxCode?: string | null;
  vatNumber?: string | null;
  email?: string | null;
  countryCode?: string;
  sourceFileName?: string;
  rowCount?: number;
  fileHash?: string;
  extraction?: {
    supplierName?: string | null;
    supplierVatNumber?: string | null;
    documentNumber?: string | null;
    issueDate?: string | null;
    currencyCode?: string;
    taxableCents?: string | null;
    vatCents?: string | null;
    totalCents?: string | null;
    confidencePermille?: number;
  } | null;
  lines?: Array<{
    accountCode?: string;
    code?: string;
    description?: string;
    name?: string;
    debitCents?: string;
    creditCents?: string;
  }>;
};
type Anomaly = { severity?: string; message?: string };

export async function GET(_request: Request, routeContext: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireSession();
    const { id } = await routeContext.params;
    const item = await db.approvalRequest.findFirst({
      where: { id, companyId: context.companyId },
      include: {
        requestedBy: { select: { displayName: true } },
        draft: { select: { description: true } },
        chartImport: { select: { sourceFileName: true } },
        businessPartner: { select: { displayName: true } },
        chartSelection: { include: { chartImport: { select: { sourceFileName: true } } } },
        accountingDocument: { select: { sourceFileName: true } }
      }
    });
    if (!item) throw new AppError("NOT_FOUND", "Richiesta non trovata.", 404);
    const snapshot = item.snapshot as Snapshot;
    const anomalies = (item.anomalies as Anomaly[]).map((anomaly, index) => ({
      id: String(index + 1),
      severity: anomaly.severity === "BLOCCANTE" ? "BLOCCANTE" : anomaly.severity === "INFO" ? "INFO" : "ATTENZIONE",
      message: anomaly.message ?? "Anomalia senza descrizione"
    }));
    const lineSummary = snapshot.lines?.map((line) => `${line.accountCode} · D ${line.debitCents} / A ${line.creditCents}`).join("; ") ?? null;
    const isChartImport = item.objectType === "CHART_IMPORT";
    const isBusinessPartner = item.objectType === "BUSINESS_PARTNER";
    const isChartSelection = item.objectType === "CHART_SELECTION";
    const isAccountingDocument = item.objectType === "ACCOUNTING_DOCUMENT";
    const chartLineSummary = snapshot.lines?.slice(0, 20)
      .map((line) => (line.code ?? "—") + " · " + (line.name ?? "—"))
      .join("; ") ?? null;
    return Response.json({
      id: item.id,
      title: isChartImport
        ? "Piano dei conti · " + (item.chartImport?.sourceFileName ?? snapshot.sourceFileName ?? "Importazione")
        : isBusinessPartner
          ? "Anagrafica · " + (item.businessPartner?.displayName ?? snapshot.displayName ?? "Cliente o fornitore")
          : isChartSelection
            ? "Piano operativo · " + (item.chartSelection?.chartImport.sourceFileName ?? snapshot.sourceFileName ?? "Selezione")
            : isAccountingDocument
              ? "Documento · " + (item.accountingDocument?.sourceFileName ?? snapshot.sourceFileName ?? "FatturaPA")
              : (item.draft?.description ?? snapshot.description ?? "Scrittura contabile"),
      description: isChartImport
        ? "L'importazione sara revisionata; la finalizzazione immutabile resta un passaggio separato e tracciato."
        : isBusinessPartner
          ? "I dati identificativi saranno revisionati; la finalizzazione li rende immutabili e resta separata dall'approvazione."
          : isChartSelection
            ? "Il piano diventera operativo soltanto dopo approvazione e finalizzazione separate e tracciate."
            : isAccountingDocument
              ? "I dati estratti saranno revisionati; nessuna registrazione contabile o trasmissione viene eseguita automaticamente."
              : "La bozza sara approvata; la finalizzazione resta un passaggio separato e tracciato.",
      objectType: isChartImport ? "Piano dei conti" : isBusinessPartner ? "Anagrafica" : isChartSelection ? "Piano operativo" : isAccountingDocument ? "Documento contabile" : "Scrittura contabile",
      status: uiStatus(item.status),
      requestedBy: item.requestedBy.displayName,
      requestedAt: item.createdAt.toISOString(),
      riskLevel: item.requiresSecondApproval ? "ALTO" : "MEDIO",
      requiresStrongConfirmation: item.requiresStrongConfirm,
      requiresSecondApproval: item.requiresSecondApproval,
      changes: [
        { field: "Stato", before: "Bozza", after: uiStatus(item.status) },
        {
          field: isChartImport ? "Conti importati" : isBusinessPartner ? "Dati identificativi" : isChartSelection ? "Piano selezionato" : isAccountingDocument ? "Dati estratti" : "Righe contabili (importi in centesimi)",
          before: null,
          after: isChartImport && snapshot.rowCount
            ? snapshot.rowCount + " righe · " + chartLineSummary
            : isBusinessPartner
              ? [snapshot.kind, snapshot.taxCode, snapshot.vatNumber, snapshot.email, snapshot.countryCode].filter(Boolean).join(" · ")
              : isChartSelection
                ? [snapshot.sourceFileName, snapshot.rowCount ? snapshot.rowCount + " conti" : null, snapshot.fileHash].filter(Boolean).join(" · ")
                : isAccountingDocument
                  ? [snapshot.extraction?.supplierName, snapshot.extraction?.supplierVatNumber, snapshot.extraction?.documentNumber, snapshot.extraction?.issueDate, snapshot.extraction?.totalCents ? `${snapshot.extraction.currencyCode ?? "EUR"} ${snapshot.extraction.totalCents} centesimi` : null].filter(Boolean).join(" · ")
                  : lineSummary
        }
      ],
      anomalies
    });
  } catch (error) {
    return errorResponse(error);
  }
}
