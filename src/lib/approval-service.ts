import { Prisma, Role, WorkStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import type { SessionContext } from "./auth";
import { assertRole } from "./auth";
import { appendAudit } from "./audit";
import { AppError } from "./errors";
import { assertCanFinalize, assertCanReject, nextApprovalStatus } from "./approval-domain";
import { objectHash } from "./security";

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function snapshotDraft(draft: {
  id: string;
  description: string;
  version: number;
  lines: Array<{ accountCode: string; description: string; debitCents: bigint; creditCents: bigint }>;
}) {
  return {
    id: draft.id,
    description: draft.description,
    version: draft.version,
    lines: draft.lines.map((line) => ({
      accountCode: line.accountCode,
      description: line.description,
      debitCents: line.debitCents.toString(),
      creditCents: line.creditCents.toString()
    }))
  };
}

function assertBalanced(lines: Array<{ debitCents: bigint; creditCents: bigint }>) {
  const debit = lines.reduce((sum, line) => sum + line.debitCents, 0n);
  const credit = lines.reduce((sum, line) => sum + line.creditCents, 0n);
  if (debit === 0n || debit !== credit) {
    throw new AppError("UNBALANCED_ENTRY", "La scrittura deve avere Dare e Avere uguali e maggiori di zero.", 422);
  }
}

export async function requestDraftApproval(context: SessionContext, draftId: string, ipAddress?: string | null) {
  assertRole(context, [Role.OPERATOR, Role.SUPERVISOR]);
  return db.$transaction(async (tx) => {
    const draft = await tx.accountingDraft.findFirst({
      where: { id: draftId, companyId: context.companyId },
      include: { lines: true, company: true }
    });
    if (!draft) throw new AppError("NOT_FOUND", "Bozza non trovata.", 404);
    if (draft.status !== WorkStatus.DRAFT && draft.status !== WorkStatus.REJECTED) {
      throw new AppError("INVALID_STATE", "La bozza e gia stata inviata o finalizzata.", 409);
    }
    assertBalanced(draft.lines);
    const snapshot = snapshotDraft(draft);
    const hash = objectHash(snapshot);
    const anomalies: Array<{ severity: string; message: string }> = [];
    const approval = await tx.approvalRequest.create({
      data: {
        companyId: context.companyId,
        draftId: draft.id,
        objectType: "ACCOUNTING_DRAFT",
        objectVersion: draft.version,
        objectHash: hash,
        requestedById: context.userId,
        requiresStrongConfirm: draft.company.strongApprovalRequired,
        requiresSecondApproval: draft.company.fourEyesRequired,
        snapshot: json(snapshot),
        diff: json({ from: draft.status, to: WorkStatus.PENDING_APPROVAL }),
        anomalies: json(anomalies)
      }
    });
    const changed = await tx.accountingDraft.updateMany({
      where: { id: draft.id, companyId: context.companyId, version: draft.version, status: draft.status },
      data: { status: WorkStatus.PENDING_APPROVAL }
    });
    if (changed.count !== 1) throw new AppError("CONCURRENT_UPDATE", "La bozza e cambiata: ricarica la pagina.", 409);
    await appendAudit(tx, {
      companyId: context.companyId,
      actorId: context.userId,
      eventType: "APPROVAL_REQUESTED",
      entityType: "ApprovalRequest",
      entityId: approval.id,
      beforeValue: json({ status: draft.status }),
      afterValue: json({ status: WorkStatus.PENDING_APPROVAL, objectHash: hash }),
      ipAddress,
      correlationId: randomUUID()
    });
    return approval;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approveRequest(
  context: SessionContext,
  approvalId: string,
  confirmation: string,
  ipAddress?: string | null
) {
  assertRole(context, [Role.SUPERVISOR]);
  return db.$transaction(async (tx) => {
    const approval = await tx.approvalRequest.findFirst({
      where: { id: approvalId, companyId: context.companyId },
      include: { decisions: true, draft: { include: { lines: true } } }
    });
    if (!approval) throw new AppError("NOT_FOUND", "Richiesta non trovata.", 404);
    const currentSnapshot = snapshotDraft(approval.draft);
    if (approval.draft.version !== approval.objectVersion || objectHash(currentSnapshot) !== approval.objectHash) {
      throw new AppError("STALE_APPROVAL", "La bozza e cambiata: occorre una nuova revisione.", 409);
    }
    const nextStatus = nextApprovalStatus({
      status: approval.status,
      actorRole: context.role,
      actorId: context.userId,
      requesterId: approval.requestedById,
      requiresStrongConfirm: approval.requiresStrongConfirm,
      requiresSecondApproval: approval.requiresSecondApproval,
      priorApproverIds: approval.decisions.filter((item) => item.decision === "APPROVE").map((item) => item.actorId),
      confirmation
    });
    await tx.approvalDecision.create({
      data: {
        approvalRequestId: approval.id,
        actorId: context.userId,
        decision: "APPROVE",
        observedHash: approval.objectHash,
        ipAddress
      }
    });
    const changed = await tx.approvalRequest.updateMany({
      where: { id: approval.id, companyId: context.companyId, status: approval.status },
      data: { status: nextStatus, approvedAt: nextStatus === WorkStatus.APPROVED ? new Date() : null }
    });
    if (changed.count !== 1) throw new AppError("CONCURRENT_UPDATE", "La richiesta e stata gia elaborata.", 409);
    await tx.accountingDraft.updateMany({
      where: { id: approval.draftId, companyId: context.companyId, version: approval.objectVersion },
      data: { status: nextStatus }
    });
    await appendAudit(tx, {
      companyId: context.companyId,
      actorId: context.userId,
      eventType: nextStatus === WorkStatus.APPROVED ? "APPROVAL_COMPLETED" : "FIRST_APPROVAL_RECORDED",
      entityType: "ApprovalRequest",
      entityId: approval.id,
      beforeValue: json({ status: approval.status }),
      afterValue: json({ status: nextStatus }),
      ipAddress,
      correlationId: randomUUID()
    });
    return { id: approval.id, status: nextStatus };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function rejectRequest(
  context: SessionContext,
  approvalId: string,
  reason: string,
  ipAddress?: string | null
) {
  assertRole(context, [Role.SUPERVISOR]);
  return db.$transaction(async (tx) => {
    const approval = await tx.approvalRequest.findFirst({ where: { id: approvalId, companyId: context.companyId } });
    if (!approval) throw new AppError("NOT_FOUND", "Richiesta non trovata.", 404);
    assertCanReject({
      status: approval.status,
      actorRole: context.role,
      actorId: context.userId,
      requesterId: approval.requestedById,
      requiresStrongConfirm: approval.requiresStrongConfirm,
      requiresSecondApproval: approval.requiresSecondApproval,
      priorApproverIds: [],
      reason
    });
    await tx.approvalDecision.create({
      data: { approvalRequestId: approval.id, actorId: context.userId, decision: "REJECT", reason: reason.trim(), observedHash: approval.objectHash, ipAddress }
    });
    await tx.approvalRequest.update({ where: { id: approval.id }, data: { status: WorkStatus.REJECTED, rejectionReason: reason.trim() } });
    await tx.accountingDraft.updateMany({ where: { id: approval.draftId, companyId: context.companyId }, data: { status: WorkStatus.REJECTED } });
    await appendAudit(tx, {
      companyId: context.companyId,
      actorId: context.userId,
      eventType: "APPROVAL_REJECTED",
      entityType: "ApprovalRequest",
      entityId: approval.id,
      beforeValue: json({ status: approval.status }),
      afterValue: json({ status: WorkStatus.REJECTED }),
      reason: reason.trim(), ipAddress, correlationId: randomUUID()
    });
    return { id: approval.id, status: WorkStatus.REJECTED };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function finalizeRequest(
  context: SessionContext,
  approvalId: string,
  confirmation: string,
  ipAddress?: string | null
) {
  assertRole(context, [Role.SUPERVISOR]);
  return db.$transaction(async (tx) => {
    const approval = await tx.approvalRequest.findFirst({
      where: { id: approvalId, companyId: context.companyId },
      include: { draft: { include: { lines: true } } }
    });
    if (!approval) throw new AppError("NOT_FOUND", "Richiesta non trovata.", 404);
    assertCanFinalize(approval.status, context.role, confirmation);
    const currentSnapshot = snapshotDraft(approval.draft);
    if (approval.draft.version !== approval.objectVersion || objectHash(currentSnapshot) !== approval.objectHash) {
      throw new AppError("STALE_APPROVAL", "L'approvazione non corrisponde piu alla bozza corrente.", 409);
    }
    assertBalanced(approval.draft.lines);
    const now = new Date();
    const changed = await tx.accountingDraft.updateMany({
      where: { id: approval.draftId, companyId: context.companyId, version: approval.objectVersion, status: WorkStatus.APPROVED },
      data: { status: WorkStatus.FINALIZED, finalizedAt: now }
    });
    if (changed.count !== 1) throw new AppError("CONCURRENT_UPDATE", "La registrazione non puo essere finalizzata nello stato corrente.", 409);
    await tx.approvalRequest.update({ where: { id: approval.id }, data: { status: WorkStatus.FINALIZED, finalizedAt: now } });
    await appendAudit(tx, {
      companyId: context.companyId,
      actorId: context.userId,
      eventType: "ACCOUNTING_DRAFT_FINALIZED",
      entityType: "AccountingDraft",
      entityId: approval.draftId,
      beforeValue: json({ status: WorkStatus.APPROVED }),
      afterValue: json({ status: WorkStatus.FINALIZED, objectHash: approval.objectHash }),
      ipAddress,
      correlationId: randomUUID()
    });
    return { id: approval.id, status: WorkStatus.FINALIZED };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
