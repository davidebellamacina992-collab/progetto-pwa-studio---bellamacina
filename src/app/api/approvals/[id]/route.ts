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

type Snapshot = { description?: string; lines?: Array<{ accountCode: string; description: string; debitCents: string; creditCents: string }> };
type Anomaly = { severity?: string; message?: string };

export async function GET(_request: Request, routeContext: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireSession();
    const { id } = await routeContext.params;
    const item = await db.approvalRequest.findFirst({
      where: { id, companyId: context.companyId },
      include: { requestedBy: { select: { displayName: true } }, draft: { select: { description: true } } }
    });
    if (!item) throw new AppError("NOT_FOUND", "Richiesta non trovata.", 404);
    const snapshot = item.snapshot as Snapshot;
    const anomalies = (item.anomalies as Anomaly[]).map((anomaly, index) => ({
      id: String(index + 1),
      severity: anomaly.severity === "BLOCCANTE" ? "BLOCCANTE" : anomaly.severity === "INFO" ? "INFO" : "ATTENZIONE",
      message: anomaly.message ?? "Anomalia senza descrizione"
    }));
    const lineSummary = snapshot.lines?.map((line) => `${line.accountCode} · D ${line.debitCents} / A ${line.creditCents}`).join("; ") ?? null;
    return Response.json({
      id: item.id,
      title: item.draft.description,
      description: "La bozza sara approvata; la finalizzazione resta un passaggio separato e tracciato.",
      objectType: "Scrittura contabile",
      status: uiStatus(item.status),
      requestedBy: item.requestedBy.displayName,
      requestedAt: item.createdAt.toISOString(),
      riskLevel: item.requiresSecondApproval ? "ALTO" : "MEDIO",
      requiresStrongConfirmation: item.requiresStrongConfirm,
      requiresSecondApproval: item.requiresSecondApproval,
      changes: [
        { field: "Stato", before: "Bozza", after: uiStatus(item.status) },
        { field: "Righe contabili (importi in centesimi)", before: null, after: lineSummary }
      ],
      anomalies
    });
  } catch (error) {
    return errorResponse(error);
  }
}
