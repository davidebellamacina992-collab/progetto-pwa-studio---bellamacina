CREATE TYPE "DocumentKind" AS ENUM ('FATTURA_PA_XML');

CREATE TABLE "AccountingDocument" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "kind" "DocumentKind" NOT NULL,
  "sourceFileName" VARCHAR(255) NOT NULL,
  "mediaType" VARCHAR(100) NOT NULL,
  "fileHash" VARCHAR(64) NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "storageKey" VARCHAR(500) NOT NULL,
  "status" "WorkStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "finalizedAt" TIMESTAMP(3),
  CONSTRAINT "AccountingDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingDocument_hash_check" CHECK ("fileHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "AccountingDocument_size_check" CHECK ("byteSize" > 0 AND "byteSize" <= 10485760),
  CONSTRAINT "AccountingDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccountingDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AccountingDocument_companyId_fileHash_key" ON "AccountingDocument"("companyId", "fileHash");
CREATE INDEX "AccountingDocument_companyId_status_createdAt_idx" ON "AccountingDocument"("companyId", "status", "createdAt");

CREATE TABLE "DocumentExtraction" (
  "id" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  "supplierName" VARCHAR(200),
  "supplierVatNumber" VARCHAR(20),
  "customerVatNumber" VARCHAR(20),
  "documentNumber" VARCHAR(50),
  "issueDate" DATE,
  "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'EUR',
  "taxableCents" BIGINT,
  "vatCents" BIGINT,
  "totalCents" BIGINT,
  "dueDate" DATE,
  "confidencePermille" INTEGER NOT NULL,
  "sourceReferences" JSONB NOT NULL,
  "warnings" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentExtraction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocumentExtraction_documentId_key" UNIQUE ("documentId"),
  CONSTRAINT "DocumentExtraction_currency_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "DocumentExtraction_confidence_check" CHECK ("confidencePermille" BETWEEN 0 AND 1000),
  CONSTRAINT "DocumentExtraction_amounts_check" CHECK (
    ("taxableCents" IS NULL OR "taxableCents" >= 0) AND
    ("vatCents" IS NULL OR "vatCents" >= 0) AND
    ("totalCents" IS NULL OR "totalCents" >= 0)
  ),
  CONSTRAINT "DocumentExtraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "ApprovalRequest" DROP CONSTRAINT "ApprovalRequest_exactly_one_object_check";
ALTER TABLE "ApprovalRequest" DROP CONSTRAINT "ApprovalRequest_object_type_matches_reference_check";
ALTER TABLE "ApprovalRequest" ADD COLUMN "accountingDocumentId" UUID;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_exactly_one_object_check"
  CHECK ((("draftId" IS NOT NULL)::integer + ("chartImportId" IS NOT NULL)::integer +
    ("businessPartnerId" IS NOT NULL)::integer + ("chartSelectionId" IS NOT NULL)::integer +
    ("accountingDocumentId" IS NOT NULL)::integer) = 1);
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_object_type_matches_reference_check"
  CHECK (
    ("draftId" IS NOT NULL AND "objectType" = 'ACCOUNTING_DRAFT') OR
    ("chartImportId" IS NOT NULL AND "objectType" = 'CHART_IMPORT') OR
    ("businessPartnerId" IS NOT NULL AND "objectType" = 'BUSINESS_PARTNER') OR
    ("chartSelectionId" IS NOT NULL AND "objectType" = 'CHART_SELECTION') OR
    ("accountingDocumentId" IS NOT NULL AND "objectType" = 'ACCOUNTING_DOCUMENT')
  );
CREATE UNIQUE INDEX "ApprovalRequest_accountingDocumentId_objectVersion_key" ON "ApprovalRequest"("accountingDocumentId", "objectVersion");
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_accountingDocumentId_fkey"
  FOREIGN KEY ("accountingDocumentId") REFERENCES "AccountingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_accounting_document_status_transition()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN RAISE EXCEPTION 'Un documento deve nascere in bozza'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status = 'PENDING_APPROVAL') OR
    (OLD.status = 'PENDING_APPROVAL' AND NEW.status IN ('PARTIALLY_APPROVED', 'APPROVED', 'REJECTED')) OR
    (OLD.status = 'PARTIALLY_APPROVED' AND NEW.status IN ('APPROVED', 'REJECTED')) OR
    (OLD.status = 'APPROVED' AND NEW.status = 'FINALIZED')
  ) THEN RAISE EXCEPTION 'Transizione di stato non consentita per il documento'; END IF;
  IF NEW.status = 'FINALIZED' AND NEW."finalizedAt" IS NULL THEN
    RAISE EXCEPTION 'La finalizzazione richiede il timestamp';
  END IF;
  IF NEW.status = 'FINALIZED' AND NOT EXISTS (
    SELECT 1 FROM "ApprovalRequest" request
    WHERE request."accountingDocumentId" = NEW.id
      AND request."objectVersion" = NEW.version
      AND request.status = 'APPROVED'
      AND (SELECT COUNT(DISTINCT decision."actorId") FROM "ApprovalDecision" decision
        WHERE decision."approvalRequestId" = request.id AND decision.decision = 'APPROVE'
          AND decision."observedHash" = request."objectHash") >=
          CASE WHEN request."requiresSecondApproval" THEN 2 ELSE 1 END
  ) THEN RAISE EXCEPTION 'La finalizzazione richiede una approvazione umana valida'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounting_document_status_gate
BEFORE INSERT OR UPDATE OF status ON "AccountingDocument"
FOR EACH ROW EXECUTE FUNCTION enforce_accounting_document_status_transition();

CREATE OR REPLACE FUNCTION prevent_finalized_accounting_document_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'FINALIZED' THEN RAISE EXCEPTION 'Un documento finalizzato e immutabile'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounting_document_finalized_immutable
BEFORE UPDATE OR DELETE ON "AccountingDocument"
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_accounting_document_mutation();

CREATE OR REPLACE FUNCTION prevent_finalized_document_extraction_mutation()
RETURNS trigger AS $$
DECLARE target_document_id UUID;
BEGIN
  target_document_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."documentId" ELSE NEW."documentId" END;
  IF EXISTS (SELECT 1 FROM "AccountingDocument" WHERE id = target_document_id AND status = 'FINALIZED') THEN
    RAISE EXCEPTION 'I dati estratti da un documento finalizzato sono immutabili';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_extraction_finalized_immutable
BEFORE UPDATE OR DELETE ON "DocumentExtraction"
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_document_extraction_mutation();
