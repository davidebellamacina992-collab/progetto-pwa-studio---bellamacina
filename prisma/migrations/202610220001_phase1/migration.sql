-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OPERATOR', 'SUPERVISOR', 'ACCOUNTANT', 'ADMIN');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PARTIALLY_APPROVED', 'APPROVED', 'REJECTED', 'FINALIZED');

-- CreateEnum
CREATE TYPE "ApprovalDecisionType" AS ENUM ('APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "EntryKind" AS ENUM ('STANDARD', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpSecretEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "taxCode" TEXT,
    "fourEyesRequired" BOOLEAN NOT NULL DEFAULT false,
    "strongApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
    "approverTotpRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "userId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("userId","companyId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "mfaVerifiedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingDraft" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "status" "WorkStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "entryKind" "EntryKind" NOT NULL DEFAULT 'STANDARD',
    "adjustsEntryId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "AccountingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingLine" (
    "id" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "accountCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "debitCents" BIGINT NOT NULL DEFAULT 0,
    "creditCents" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "AccountingLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectVersion" INTEGER NOT NULL,
    "objectHash" TEXT NOT NULL,
    "status" "WorkStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requestedById" UUID NOT NULL,
    "requiresStrongConfirm" BOOLEAN NOT NULL DEFAULT true,
    "requiresSecondApproval" BOOLEAN NOT NULL DEFAULT false,
    "snapshot" JSONB NOT NULL,
    "diff" JSONB NOT NULL,
    "anomalies" JSONB NOT NULL,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDecision" (
    "id" UUID NOT NULL,
    "approvalRequestId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "decision" "ApprovalDecisionType" NOT NULL,
    "reason" TEXT,
    "observedHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "actorId" UUID,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeValue" JSONB,
    "afterValue" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "correlationId" TEXT NOT NULL,
    "previousHash" TEXT,
    "entryHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_companyId_role_idx" ON "Membership"("companyId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AccountingDraft_companyId_status_idx" ON "AccountingDraft"("companyId", "status");

-- CreateIndex
CREATE INDEX "AccountingLine_draftId_idx" ON "AccountingLine"("draftId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_companyId_status_idx" ON "ApprovalRequest"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_draftId_objectVersion_key" ON "ApprovalRequest"("draftId", "objectVersion");

-- CreateIndex
CREATE INDEX "ApprovalDecision_approvalRequestId_decision_idx" ON "ApprovalDecision"("approvalRequestId", "decision");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- Audit records are immutable even if application code is bypassed.
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Il registro di audit e append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
BEFORE UPDATE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE TRIGGER audit_log_no_delete
BEFORE DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- A finalized entry can only be corrected by a linked adjustment.
CREATE OR REPLACE FUNCTION prevent_finalized_draft_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'FINALIZED' THEN
    RAISE EXCEPTION 'Una registrazione finalizzata e immutabile: creare una rettifica';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounting_draft_finalized_immutable
BEFORE UPDATE OR DELETE ON "AccountingDraft"
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_draft_mutation();

-- Defense in depth: Dare and Avere must balance before finalization.
CREATE OR REPLACE FUNCTION ensure_balanced_before_finalization()
RETURNS trigger AS $$
DECLARE
  debit_total bigint;
  credit_total bigint;
BEGIN
  IF NEW.status = 'FINALIZED' AND OLD.status <> 'FINALIZED' THEN
    SELECT COALESCE(SUM("debitCents"), 0), COALESCE(SUM("creditCents"), 0)
      INTO debit_total, credit_total
      FROM "AccountingLine" WHERE "draftId" = NEW.id;
    IF debit_total <> credit_total OR debit_total = 0 THEN
      RAISE EXCEPTION 'Scrittura non quadrata o priva di importi';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounting_draft_balance_gate
BEFORE UPDATE OF status ON "AccountingDraft"
FOR EACH ROW EXECUTE FUNCTION ensure_balanced_before_finalization();

-- Lines belonging to a finalized entry are immutable as well as their header.
CREATE OR REPLACE FUNCTION prevent_finalized_line_mutation()
RETURNS trigger AS $$
DECLARE
  target_draft_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_draft_id := OLD."draftId";
  ELSE
    target_draft_id := NEW."draftId";
  END IF;
  IF EXISTS (SELECT 1 FROM "AccountingDraft" WHERE id = target_draft_id AND status = 'FINALIZED') THEN
    RAISE EXCEPTION 'Le righe di una registrazione finalizzata sono immutabili';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."draftId" <> NEW."draftId" AND EXISTS (
    SELECT 1 FROM "AccountingDraft" WHERE id = OLD."draftId" AND status = 'FINALIZED'
  ) THEN
    RAISE EXCEPTION 'Le righe di una registrazione finalizzata sono immutabili';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounting_line_finalized_immutable
BEFORE INSERT OR UPDATE OR DELETE ON "AccountingLine"
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_line_mutation();

CREATE OR REPLACE FUNCTION prevent_approval_decision_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Le decisioni di approvazione sono append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER approval_decision_no_update
BEFORE UPDATE ON "ApprovalDecision"
FOR EACH ROW EXECUTE FUNCTION prevent_approval_decision_mutation();

CREATE TRIGGER approval_decision_no_delete
BEFORE DELETE ON "ApprovalDecision"
FOR EACH ROW EXECUTE FUNCTION prevent_approval_decision_mutation();

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_companyId_entryHash_key" ON "AuditLog"("companyId", "entryHash");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDraft" ADD CONSTRAINT "AccountingDraft_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDraft" ADD CONSTRAINT "AccountingDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDraft" ADD CONSTRAINT "AccountingDraft_adjustsEntryId_fkey" FOREIGN KEY ("adjustsEntryId") REFERENCES "AccountingDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingLine" ADD CONSTRAINT "AccountingLine_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "AccountingDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "AccountingDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
