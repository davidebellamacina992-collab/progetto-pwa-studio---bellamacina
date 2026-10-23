import { Role, WorkStatus } from "@prisma/client";
import { AppError } from "./errors";

export type ApprovalFacts = {
  status: WorkStatus;
  actorRole: Role;
  actorId: string;
  requesterId: string;
  requiresStrongConfirm: boolean;
  requiresSecondApproval: boolean;
  priorApproverIds: string[];
  confirmation?: string;
  reason?: string;
};

export function nextApprovalStatus(facts: ApprovalFacts): WorkStatus {
  if (facts.actorRole !== Role.SUPERVISOR) {
    throw new AppError("FORBIDDEN", "Solo un responsabile puo approvare.", 403);
  }
  if (facts.status !== WorkStatus.PENDING_APPROVAL && facts.status !== WorkStatus.PARTIALLY_APPROVED) {
    throw new AppError("INVALID_STATE", "La richiesta non e in attesa di approvazione.", 409);
  }
  if (facts.requiresStrongConfirm && facts.confirmation !== "APPROVO") {
    throw new AppError("STRONG_CONFIRMATION_REQUIRED", "Digita esattamente APPROVO per confermare.", 422);
  }
  if (facts.priorApproverIds.includes(facts.actorId)) {
    throw new AppError("DUPLICATE_APPROVER", "La seconda approvazione deve provenire da un'altra persona.", 409);
  }
  if (facts.requiresSecondApproval && facts.actorId === facts.requesterId) {
    throw new AppError("FOUR_EYES_REQUIRED", "Chi ha richiesto l'operazione non puo approvarla.", 409);
  }
  return facts.requiresSecondApproval && facts.priorApproverIds.length === 0
    ? WorkStatus.PARTIALLY_APPROVED
    : WorkStatus.APPROVED;
}

export function assertCanReject(facts: ApprovalFacts) {
  if (facts.actorRole !== Role.SUPERVISOR) throw new AppError("FORBIDDEN", "Solo un responsabile puo respingere.", 403);
  if (facts.status !== WorkStatus.PENDING_APPROVAL && facts.status !== WorkStatus.PARTIALLY_APPROVED) {
    throw new AppError("INVALID_STATE", "La richiesta non e in attesa di revisione.", 409);
  }
  if (!facts.reason || facts.reason.trim().length < 5) {
    throw new AppError("REASON_REQUIRED", "Indica una motivazione di almeno 5 caratteri.", 422);
  }
}

export function assertCanFinalize(status: WorkStatus, role: Role, confirmation?: string) {
  if (role !== Role.SUPERVISOR) throw new AppError("FORBIDDEN", "Solo un responsabile puo finalizzare.", 403);
  if (status !== WorkStatus.APPROVED) throw new AppError("APPROVAL_REQUIRED", "Serve un'approvazione valida prima di finalizzare.", 409);
  if (confirmation !== "FINALIZZO") {
    throw new AppError("STRONG_CONFIRMATION_REQUIRED", "Digita esattamente FINALIZZO per procedere.", 422);
  }
}
