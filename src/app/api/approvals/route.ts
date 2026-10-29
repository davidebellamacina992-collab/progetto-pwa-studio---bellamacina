import { WorkStatus } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";

function uiStatus(status: WorkStatus) {
  return ({
    DRAFT: "BOZZA", PENDING_APPROVAL: "DA_APPROVARE", PARTIALLY_APPROVED: "DA_APPROVARE",
    APPROVED: "APPROVATO", REJECTED: "RESPINTO", FINALIZED: "FINALIZZATO"
  } as const)[status];
}

export async function GET(request: Request) {
  try {
    const context = await requireSession();
    const url = new URL(request.url);
    const filter = url.searchParams.get("status");
    const statuses = filter === "DA_APPROVARE" ? [WorkStatus.PENDING_APPROVAL, WorkStatus.PARTIALLY_APPROVED] : undefined;
    const approvals = await db.approvalRequest.findMany({
      where: { companyId: context.companyId, status: statuses ? { in: statuses } : undefined },
      include: {
        requestedBy: { select: { displayName: true } },
        draft: { select: { description: true } },
        chartImport: { select: { sourceFileName: true } },
        businessPartner: { select: { displayName: true, kind: true } },
        chartSelection: { include: { chartImport: { select: { sourceFileName: true } } } }
      },
      orderBy: { createdAt: "desc" }, take: 100
    });
    return Response.json({ items: approvals.map((item) => ({
      id: item.id,
      title: item.objectType === "CHART_IMPORT"
        ? "Piano dei conti · " + (item.chartImport?.sourceFileName ?? "Importazione")
        : item.objectType === "BUSINESS_PARTNER"
          ? "Anagrafica · " + (item.businessPartner?.displayName ?? "Cliente o fornitore")
          : item.objectType === "CHART_SELECTION"
            ? "Piano operativo · " + (item.chartSelection?.chartImport.sourceFileName ?? "Selezione")
            : (item.draft?.description ?? "Scrittura contabile"),
      objectType: item.objectType === "CHART_IMPORT"
        ? "Piano dei conti"
        : item.objectType === "BUSINESS_PARTNER" ? "Anagrafica" : item.objectType === "CHART_SELECTION" ? "Piano operativo" : "Scrittura contabile",
      requestedBy: item.requestedBy.displayName,
      requestedAt: item.createdAt.toISOString(),
      riskLevel: item.requiresSecondApproval ? "ALTO" : "MEDIO",
      status: uiStatus(item.status)
    })) });
  } catch (error) {
    return errorResponse(error);
  }
}
