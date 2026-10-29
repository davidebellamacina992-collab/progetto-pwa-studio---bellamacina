import { Prisma, Role, WorkStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { SessionContext } from "./auth";
import { assertRole } from "./auth";
import { appendAudit } from "./audit";
import { db } from "./db";
import { AppError } from "./errors";

export async function createChartSelectionDraft(
  context: SessionContext,
  chartImportId: string,
  ipAddress?: string | null
) {
  assertRole(context, [Role.OPERATOR, Role.ADMIN]);
  return db.$transaction(async (tx) => {
    const chart = await tx.chartImport.findFirst({
      where: { id: chartImportId, companyId: context.companyId, status: WorkStatus.FINALIZED },
      select: { id: true, sourceFileName: true, fileHash: true, rowCount: true }
    });
    if (!chart) {
      throw new AppError("INVALID_CHART", "Seleziona un piano dei conti finalizzato della stessa azienda.", 422);
    }
    const openSelection = await tx.chartSelection.findFirst({
      where: {
        companyId: context.companyId,
        status: { in: [WorkStatus.DRAFT, WorkStatus.PENDING_APPROVAL, WorkStatus.PARTIALLY_APPROVED, WorkStatus.APPROVED] }
      },
      select: { id: true }
    });
    if (openSelection) {
      throw new AppError("SELECTION_ALREADY_OPEN", "Esiste gia una selezione del piano operativo non conclusa.", 409);
    }
    const current = await tx.chartSelection.findFirst({
      where: { companyId: context.companyId, status: WorkStatus.FINALIZED },
      orderBy: { finalizedAt: "desc" },
      select: { chartImportId: true }
    });
    if (current?.chartImportId === chart.id) {
      throw new AppError("CHART_ALREADY_ACTIVE", "Questo piano dei conti e gia quello operativo.", 409);
    }
    const selection = await tx.chartSelection.create({
      data: {
        companyId: context.companyId,
        chartImportId: chart.id,
        status: WorkStatus.DRAFT,
        createdById: context.userId
      },
      include: { chartImport: { select: { sourceFileName: true, fileHash: true, rowCount: true } } }
    });
    await appendAudit(tx, {
      companyId: context.companyId,
      actorId: context.userId,
      eventType: "CHART_SELECTION_DRAFT_CREATED",
      entityType: "ChartSelection",
      entityId: selection.id,
      beforeValue: current ? ({ chartImportId: current.chartImportId } satisfies Prisma.InputJsonValue) : undefined,
      afterValue: {
        chartImportId: chart.id,
        sourceFileName: chart.sourceFileName,
        fileHash: chart.fileHash,
        rowCount: chart.rowCount,
        status: WorkStatus.DRAFT
      },
      ipAddress,
      correlationId: randomUUID()
    });
    return selection;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
