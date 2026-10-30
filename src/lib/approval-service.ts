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
  sourceType?: string | null;
  sourceFileName?: string | null;
  sourceFileHash?: string | null;
  sourceChartImportId?: string | null;
  lines: Array<{ accountCode: string; description: string; debitCents: bigint; creditCents: bigint }>;
}) {
  return {
    id: draft.id,
    description: draft.description,
    version: draft.version,
    ...(draft.sourceType ? {
      sourceType: draft.sourceType,
      sourceFileName: draft.sourceFileName,
      sourceFileHash: draft.sourceFileHash,
      sourceChartImportId: draft.sourceChartImportId
    } : {}),
    lines: draft.lines.map((line) => ({
      accountCode: line.accountCode,
      description: line.description,
      debitCents: line.debitCents.toString(),
      creditCents: line.creditCents.toString()
    }))
  };
}

function snapshotChartImport(chartImport: {
  id: string;
  sourceFileName: string;
  fileHash: string;
  rowCount: number;
  version: number;
  lines: Array<{ code: string; name: string; accountType: string | null; parentCode: string | null; position: number }>;
}) {
  return {
    id: chartImport.id,
    sourceFileName: chartImport.sourceFileName,
    fileHash: chartImport.fileHash,
    rowCount: chartImport.rowCount,
    version: chartImport.version,
    lines: chartImport.lines.map((line) => ({
      code: line.code,
      name: line.name,
      accountType: line.accountType,
      parentCode: line.parentCode,
      position: line.position
    }))
  };
}

function snapshotBusinessPartner(partner: {
  id: string;
  kind: string;
  displayName: string;
  taxCode: string | null;
  vatNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  countryCode: string;
  version: number;
}) {
  return {
    id: partner.id,
    kind: partner.kind,
    displayName: partner.displayName,
    taxCode: partner.taxCode,
    vatNumber: partner.vatNumber,
    email: partner.email,
    phone: partner.phone,
    address: partner.address,
    countryCode: partner.countryCode,
    version: partner.version
  };
}

function snapshotChartSelection(selection: {
  id: string;
  chartImportId: string;
  version: number;
  chartImport: { sourceFileName: string; fileHash: string; rowCount: number };
}) {
  return {
    id: selection.id,
    chartImportId: selection.chartImportId,
    version: selection.version,
    sourceFileName: selection.chartImport.sourceFileName,
    fileHash: selection.chartImport.fileHash,
    rowCount: selection.chartImport.rowCount
  };
}

function snapshotAccountingDocument(document: {
  id: string;
  kind: string;
  sourceFileName: string;
  fileHash: string;
  byteSize: number;
  version: number;
  extraction: {
    supplierName: string | null;
    supplierVatNumber: string | null;
    customerVatNumber: string | null;
    documentNumber: string | null;
    issueDate: Date | null;
    currencyCode: string;
    taxableCents: bigint | null;
    vatCents: bigint | null;
    totalCents: bigint | null;
    dueDate: Date | null;
    confidencePermille: number;
    sourceReferences: Prisma.JsonValue;
    warnings: Prisma.JsonValue;
  } | null;
}) {
  return {
    id: document.id,
    kind: document.kind,
    sourceFileName: document.sourceFileName,
    fileHash: document.fileHash,
    byteSize: document.byteSize,
    version: document.version,
    extraction: document.extraction ? {
      supplierName: document.extraction.supplierName,
      supplierVatNumber: document.extraction.supplierVatNumber,
      customerVatNumber: document.extraction.customerVatNumber,
      documentNumber: document.extraction.documentNumber,
      issueDate: document.extraction.issueDate?.toISOString().slice(0, 10) ?? null,
      currencyCode: document.extraction.currencyCode,
      taxableCents: document.extraction.taxableCents?.toString() ?? null,
      vatCents: document.extraction.vatCents?.toString() ?? null,
      totalCents: document.extraction.totalCents?.toString() ?? null,
      dueDate: document.extraction.dueDate?.toISOString().slice(0, 10) ?? null,
      confidencePermille: document.extraction.confidencePermille,
      sourceReferences: document.extraction.sourceReferences,
      warnings: document.extraction.warnings
    } : null
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
  assertRole(context, [Role.OPERATOR, Role.SUPERVISOR, Role.ADMIN]);
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

export async function requestChartImportApproval(
  context: SessionContext,
  chartImportId: string,
  ipAddress?: string | null
) {
  assertRole(context, [Role.OPERATOR, Role.ADMIN]);
  return db.$transaction(async (tx) => {
    const chartImport = await tx.chartImport.findFirst({
      where: { id: chartImportId, companyId: context.companyId },
      include: { lines: { orderBy: { position: "asc" } }, company: true }
    });
    if (!chartImport) throw new AppError("NOT_FOUND", "Importazione non trovata.", 404);
    if (chartImport.status !== WorkStatus.DRAFT) {
      throw new AppError("INVALID_STATE", "Il piano dei conti e gia in revisione o finalizzato.", 409);
    }
    if (chartImport.lines.length !== chartImport.rowCount || chartImport.lines.length === 0) {
      throw new AppError("INCOMPLETE_IMPORT", "Le righe del piano dei conti non corrispondono al riepilogo importato.", 409);
    }
    const snapshot = snapshotChartImport(chartImport);
    const hash = objectHash(snapshot);
    const approval = await tx.approvalRequest.create({
      data: {
        companyId: context.companyId,
        chartImportId: chartImport.id,
        objectType: "CHART_IMPORT",
        objectVersion: chartImport.version,
        objectHash: hash,
        requestedById: context.userId,
        requiresStrongConfirm: chartImport.company.strongApprovalRequired,
        requiresSecondApproval: chartImport.company.fourEyesRequired,
        snapshot: json(snapshot),
        diff: json({ from: chartImport.status, to: WorkStatus.PENDING_APPROVAL }),
        anomalies: json([])
      }
    });
    const changed = await tx.chartImport.updateMany({
      where: {
        id: chartImport.id,
        companyId: context.companyId,
        version: chartImport.version,
        status: chartImport.status
      },
      data: { status: WorkStatus.PENDING_APPROVAL }
    });
    if (changed.count !== 1) throw new AppError("CONCURRENT_UPDATE", "Il piano dei conti e cambiato: ricarica la pagina.", 409);
    await appendAudit(tx, {
      companyId: context.companyId,
      actorId: context.userId,
      eventType: "CHART_IMPORT_APPROVAL_REQUESTED",
      entityType: "ApprovalRequest",
      entityId: approval.id,
      beforeValue: json({ status: chartImport.status }),
      afterValue: json({ status: WorkStatus.PENDING_APPROVAL, objectHash: hash }),
      ipAddress,
      correlationId: randomUUID()
    });
    return approval;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function requestBusinessPartnerApproval(
  context: SessionContext,
  businessPartnerId: string,
  ipAddress?: string | null
) {
  assertRole(context, [Role.OPERATOR, Role.ADMIN]);
  return db.$transaction(async (tx) => {
    const partner = await tx.businessPartner.findFirst({
      where: { id: businessPartnerId, companyId: context.companyId },
      include: { company: true }
    });
    if (!partner) throw new AppError("NOT_FOUND", "Anagrafica non trovata.", 404);
    if (partner.status !== WorkStatus.DRAFT) {
      throw new AppError("INVALID_STATE", "L'anagrafica e gia in revisione o finalizzata.", 409);
    }
    const snapshot = snapshotBusinessPartner(partner);
    const hash = objectHash(snapshot);
    const approval = await tx.approvalRequest.create({
      data: {
        companyId: context.companyId,
        businessPartnerId: partner.id,
        objectType: "BUSINESS_PARTNER",
        objectVersion: partner.version,
        objectHash: hash,
        requestedById: context.userId,
        requiresStrongConfirm: partner.company.strongApprovalRequired,
        requiresSecondApproval: partner.company.fourEyesRequired,
        snapshot: json(snapshot),
        diff: json({ from: partner.status, to: WorkStatus.PENDING_APPROVAL }),
        anomalies: json([])
      }
    });
    const changed = await tx.businessPartner.updateMany({
      where: { id: partner.id, companyId: context.companyId, version: partner.version, status: WorkStatus.DRAFT },
      data: { status: WorkStatus.PENDING_APPROVAL }
    });
    if (changed.count !== 1) throw new AppError("CONCURRENT_UPDATE", "L'anagrafica e cambiata: ricarica la pagina.", 409);
    await appendAudit(tx, {
      companyId: context.companyId,
      actorId: context.userId,
      eventType: "BUSINESS_PARTNER_APPROVAL_REQUESTED",
      entityType: "ApprovalRequest",
      entityId: approval.id,
      beforeValue: json({ status: WorkStatus.DRAFT }),
      afterValue: json({ status: WorkStatus.PENDING_APPROVAL, objectHash: hash }),
      ipAddress,
      correlationId: randomUUID()
    });
    return approval;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function requestChartSelectionApproval(
  context: SessionContext,
  chartSelectionId: string,
  ipAddress?: string | null
) {
  assertRole(context, [Role.OPERATOR, Role.ADMIN]);
  return db.$transaction(async (tx) => {
    const selection = await tx.chartSelection.findFirst({
      where: { id: chartSelectionId, companyId: context.companyId },
      include: { chartImport: true, company: true }
    });
    if (!selection) throw new AppError("NOT_FOUND", "Selezione del piano operativo non trovata.", 404);
    if (selection.status !== WorkStatus.DRAFT) {
      throw new AppError("INVALID_STATE", "La selezione e gia in revisione o conclusa.", 409);
    }
    if (selection.chartImport.status !== WorkStatus.FINALIZED || selection.chartImport.companyId !== context.companyId) {
      throw new AppError("INVALID_CHART", "Il piano scelto non e finalizzato per questa azienda.", 409);
    }
    const snapshot = snapshotChartSelection(selection);
    const hash = objectHash(snapshot);
    const approval = await tx.approvalRequest.create({
      data: {
        companyId: context.companyId,
        chartSelectionId: selection.id,
        objectType: "CHART_SELECTION",
        objectVersion: selection.version,
        objectHash: hash,
        requestedById: context.userId,
        requiresStrongConfirm: selection.company.strongApprovalRequired,
        requiresSecondApproval: selection.company.fourEyesRequired,
        snapshot: json(snapshot),
        diff: json({ from: selection.status, to: WorkStatus.PENDING_APPROVAL }),
        anomalies: json([])
      }
    });
    const changed = await tx.chartSelection.updateMany({
      where: { id: selection.id, companyId: context.companyId, version: selection.version, status: WorkStatus.DRAFT },
      data: { status: WorkStatus.PENDING_APPROVAL }
    });
    if (changed.count !== 1) throw new AppError("CONCURRENT_UPDATE", "La selezione e cambiata: ricarica la pagina.", 409);
    await appendAudit(tx, {
      companyId: context.companyId,
      actorId: context.userId,
      eventType: "CHART_SELECTION_APPROVAL_REQUESTED",
      entityType: "ApprovalRequest",
      entityId: approval.id,
      beforeValue: json({ status: WorkStatus.DRAFT }),
      afterValue: json({ status: WorkStatus.PENDING_APPROVAL, objectHash: hash }),
      ipAddress,
      correlationId: randomUUID()
    });
    return approval;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function requestAccountingDocumentApproval(
  context: SessionContext,
  accountingDocumentId: string,
  ipAddress?: string | null
) {
  assertRole(context, [Role.OPERATOR, Role.ADMIN]);
  return db.$transaction(async (tx) => {
    const document = await tx.accountingDocument.findFirst({
      where: { id: accountingDocumentId, companyId: context.companyId },
      include: { extraction: true, company: true }
    });
    if (!document) throw new AppError("NOT_FOUND", "Documento non trovato.", 404);
    if (document.status !== WorkStatus.DRAFT) throw new AppError("INVALID_STATE", "Il documento e gia in revisione o concluso.", 409);
    if (!document.extraction) throw new AppError("MISSING_EXTRACTION", "Il documento non contiene dati estratti da revisionare.", 409);
    const snapshot = snapshotAccountingDocument(document);
    const hash = objectHash(snapshot);
    const warnings = Array.isArray(document.extraction.warnings) ? document.extraction.warnings : [];
    const approval = await tx.approvalRequest.create({
      data: {
        companyId: context.companyId,
        accountingDocumentId: document.id,
        objectType: "ACCOUNTING_DOCUMENT",
        objectVersion: document.version,
        objectHash: hash,
        requestedById: context.userId,
        requiresStrongConfirm: document.company.strongApprovalRequired,
        requiresSecondApproval: document.company.fourEyesRequired,
        snapshot: json(snapshot),
        diff: json({ from: document.status, to: WorkStatus.PENDING_APPROVAL }),
        anomalies: json(warnings)
      }
    });
    const changed = await tx.accountingDocument.updateMany({
      where: { id: document.id, companyId: context.companyId, version: document.version, status: WorkStatus.DRAFT },
      data: { status: WorkStatus.PENDING_APPROVAL }
    });
    if (changed.count !== 1) throw new AppError("CONCURRENT_UPDATE", "Il documento e cambiato: ricarica la pagina.", 409);
    await appendAudit(tx, {
      companyId: context.companyId,
      actorId: context.userId,
      eventType: "ACCOUNTING_DOCUMENT_APPROVAL_REQUESTED",
      entityType: "ApprovalRequest",
      entityId: approval.id,
      beforeValue: json({ status: WorkStatus.DRAFT }),
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
      include: {
        decisions: true,
        draft: { include: { lines: true } },
        chartImport: { include: { lines: { orderBy: { position: "asc" } } } },
        businessPartner: true,
        chartSelection: { include: { chartImport: true } },
        accountingDocument: { include: { extraction: true } }
      }
    });
    if (!approval) throw new AppError("NOT_FOUND", "Richiesta non trovata.", 404);
    const target = approval.objectType === "CHART_IMPORT"
      ? approval.chartImport
      : approval.objectType === "BUSINESS_PARTNER"
        ? approval.businessPartner
        : approval.objectType === "CHART_SELECTION"
          ? approval.chartSelection
          : approval.objectType === "ACCOUNTING_DOCUMENT"
            ? approval.accountingDocument
            : approval.draft;
    if (!target) throw new AppError("INVALID_APPROVAL_TARGET", "La richiesta non ha un oggetto valido.", 409);
    const currentSnapshot = approval.objectType === "CHART_IMPORT"
      ? snapshotChartImport(approval.chartImport!)
      : approval.objectType === "BUSINESS_PARTNER"
        ? snapshotBusinessPartner(approval.businessPartner!)
        : approval.objectType === "CHART_SELECTION"
          ? snapshotChartSelection(approval.chartSelection!)
          : approval.objectType === "ACCOUNTING_DOCUMENT"
            ? snapshotAccountingDocument(approval.accountingDocument!)
            : snapshotDraft(approval.draft!);
    if (target.version !== approval.objectVersion || objectHash(currentSnapshot) !== approval.objectHash) {
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
    let targetChanged: { count: number };
    if (approval.objectType === "CHART_IMPORT" && approval.chartImportId) {
      targetChanged = await tx.chartImport.updateMany({
        where: { id: approval.chartImportId, companyId: context.companyId, version: approval.objectVersion },
        data: { status: nextStatus }
      });
    } else if (approval.objectType === "BUSINESS_PARTNER" && approval.businessPartnerId) {
      targetChanged = await tx.businessPartner.updateMany({
        where: { id: approval.businessPartnerId, companyId: context.companyId, version: approval.objectVersion },
        data: { status: nextStatus }
      });
    } else if (approval.objectType === "CHART_SELECTION" && approval.chartSelectionId) {
      targetChanged = await tx.chartSelection.updateMany({
        where: { id: approval.chartSelectionId, companyId: context.companyId, version: approval.objectVersion },
        data: { status: nextStatus }
      });
    } else if (approval.objectType === "ACCOUNTING_DOCUMENT" && approval.accountingDocumentId) {
      targetChanged = await tx.accountingDocument.updateMany({
        where: { id: approval.accountingDocumentId, companyId: context.companyId, version: approval.objectVersion },
        data: { status: nextStatus }
      });
    } else if (approval.draftId) {
      targetChanged = await tx.accountingDraft.updateMany({
        where: { id: approval.draftId, companyId: context.companyId, version: approval.objectVersion },
        data: { status: nextStatus }
      });
    } else {
      throw new AppError("INVALID_APPROVAL_TARGET", "La richiesta non ha un oggetto valido.", 409);
    }
    if (targetChanged.count !== 1) throw new AppError("CONCURRENT_UPDATE", "L'oggetto in revisione e cambiato.", 409);
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
    let targetChanged: { count: number };
    if (approval.objectType === "CHART_IMPORT" && approval.chartImportId) {
      targetChanged = await tx.chartImport.updateMany({
        where: { id: approval.chartImportId, companyId: context.companyId },
        data: { status: WorkStatus.REJECTED }
      });
    } else if (approval.objectType === "BUSINESS_PARTNER" && approval.businessPartnerId) {
      targetChanged = await tx.businessPartner.updateMany({
        where: { id: approval.businessPartnerId, companyId: context.companyId },
        data: { status: WorkStatus.REJECTED }
      });
    } else if (approval.objectType === "CHART_SELECTION" && approval.chartSelectionId) {
      targetChanged = await tx.chartSelection.updateMany({
        where: { id: approval.chartSelectionId, companyId: context.companyId },
        data: { status: WorkStatus.REJECTED }
      });
    } else if (approval.objectType === "ACCOUNTING_DOCUMENT" && approval.accountingDocumentId) {
      targetChanged = await tx.accountingDocument.updateMany({
        where: { id: approval.accountingDocumentId, companyId: context.companyId },
        data: { status: WorkStatus.REJECTED }
      });
    } else if (approval.draftId) {
      targetChanged = await tx.accountingDraft.updateMany({
        where: { id: approval.draftId, companyId: context.companyId },
        data: { status: WorkStatus.REJECTED }
      });
    } else {
      throw new AppError("INVALID_APPROVAL_TARGET", "La richiesta non ha un oggetto valido.", 409);
    }
    if (targetChanged.count !== 1) throw new AppError("CONCURRENT_UPDATE", "L'oggetto in revisione e cambiato.", 409);
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
      include: {
        draft: { include: { lines: true } },
        chartImport: { include: { lines: { orderBy: { position: "asc" } } } },
        businessPartner: true,
        chartSelection: { include: { chartImport: true } },
        accountingDocument: { include: { extraction: true } }
      }
    });
    if (!approval) throw new AppError("NOT_FOUND", "Richiesta non trovata.", 404);
    assertCanFinalize(approval.status, context.role, confirmation);
    const target = approval.objectType === "CHART_IMPORT"
      ? approval.chartImport
      : approval.objectType === "BUSINESS_PARTNER"
        ? approval.businessPartner
        : approval.objectType === "CHART_SELECTION"
          ? approval.chartSelection
          : approval.objectType === "ACCOUNTING_DOCUMENT"
            ? approval.accountingDocument
            : approval.draft;
    if (!target) throw new AppError("INVALID_APPROVAL_TARGET", "La richiesta non ha un oggetto valido.", 409);
    const currentSnapshot = approval.objectType === "CHART_IMPORT"
      ? snapshotChartImport(approval.chartImport!)
      : approval.objectType === "BUSINESS_PARTNER"
        ? snapshotBusinessPartner(approval.businessPartner!)
        : approval.objectType === "CHART_SELECTION"
          ? snapshotChartSelection(approval.chartSelection!)
          : approval.objectType === "ACCOUNTING_DOCUMENT"
            ? snapshotAccountingDocument(approval.accountingDocument!)
            : snapshotDraft(approval.draft!);
    if (target.version !== approval.objectVersion || objectHash(currentSnapshot) !== approval.objectHash) {
      throw new AppError("STALE_APPROVAL", "L'approvazione non corrisponde piu alla bozza corrente.", 409);
    }
    const now = new Date();
    let changed: { count: number };
    let entityType: string;
    let entityId: string;
    let eventType: string;
    if (approval.objectType === "CHART_IMPORT" && approval.chartImportId && approval.chartImport) {
      changed = await tx.chartImport.updateMany({
        where: {
          id: approval.chartImportId,
          companyId: context.companyId,
          version: approval.objectVersion,
          status: WorkStatus.APPROVED
        },
        data: { status: WorkStatus.FINALIZED, finalizedAt: now }
      });
      entityType = "ChartImport";
      entityId = approval.chartImportId;
      eventType = "CHART_IMPORT_FINALIZED";
    } else if (approval.objectType === "BUSINESS_PARTNER" && approval.businessPartnerId && approval.businessPartner) {
      changed = await tx.businessPartner.updateMany({
        where: {
          id: approval.businessPartnerId,
          companyId: context.companyId,
          version: approval.objectVersion,
          status: WorkStatus.APPROVED
        },
        data: { status: WorkStatus.FINALIZED, finalizedAt: now }
      });
      entityType = "BusinessPartner";
      entityId = approval.businessPartnerId;
      eventType = "BUSINESS_PARTNER_FINALIZED";
    } else if (approval.objectType === "CHART_SELECTION" && approval.chartSelectionId && approval.chartSelection) {
      changed = await tx.chartSelection.updateMany({
        where: {
          id: approval.chartSelectionId,
          companyId: context.companyId,
          version: approval.objectVersion,
          status: WorkStatus.APPROVED
        },
        data: { status: WorkStatus.FINALIZED, finalizedAt: now }
      });
      entityType = "ChartSelection";
      entityId = approval.chartSelectionId;
      eventType = "CHART_SELECTION_FINALIZED";
    } else if (approval.objectType === "ACCOUNTING_DOCUMENT" && approval.accountingDocumentId && approval.accountingDocument) {
      changed = await tx.accountingDocument.updateMany({
        where: {
          id: approval.accountingDocumentId,
          companyId: context.companyId,
          version: approval.objectVersion,
          status: WorkStatus.APPROVED
        },
        data: { status: WorkStatus.FINALIZED, finalizedAt: now }
      });
      entityType = "AccountingDocument";
      entityId = approval.accountingDocumentId;
      eventType = "ACCOUNTING_DOCUMENT_FINALIZED";
    } else if (approval.draftId && approval.draft) {
      assertBalanced(approval.draft.lines);
      changed = await tx.accountingDraft.updateMany({
        where: {
          id: approval.draftId,
          companyId: context.companyId,
          version: approval.objectVersion,
          status: WorkStatus.APPROVED
        },
        data: { status: WorkStatus.FINALIZED, finalizedAt: now }
      });
      entityType = "AccountingDraft";
      entityId = approval.draftId;
      eventType = "ACCOUNTING_DRAFT_FINALIZED";
    } else {
      throw new AppError("INVALID_APPROVAL_TARGET", "La richiesta non ha un oggetto valido.", 409);
    }
    if (changed.count !== 1) throw new AppError("CONCURRENT_UPDATE", "La registrazione non puo essere finalizzata nello stato corrente.", 409);
    await tx.approvalRequest.update({ where: { id: approval.id }, data: { status: WorkStatus.FINALIZED, finalizedAt: now } });
    await appendAudit(tx, {
      companyId: context.companyId,
      actorId: context.userId,
      eventType,
      entityType,
      entityId,
      beforeValue: json({ status: WorkStatus.APPROVED }),
      afterValue: json({ status: WorkStatus.FINALIZED, objectHash: approval.objectHash }),
      ipAddress,
      correlationId: randomUUID()
    });
    return { id: approval.id, status: WorkStatus.FINALIZED };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
