CREATE TYPE "PartnerKind" AS ENUM ('CUSTOMER', 'SUPPLIER', 'BOTH');

CREATE TABLE "BusinessPartner" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "kind" "PartnerKind" NOT NULL,
  "displayName" VARCHAR(200) NOT NULL,
  "taxCode" VARCHAR(16),
  "vatNumber" VARCHAR(20),
  "email" VARCHAR(254),
  "phone" VARCHAR(40),
  "address" VARCHAR(300),
  "countryCode" VARCHAR(2) NOT NULL DEFAULT 'IT',
  "status" "WorkStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "finalizedAt" TIMESTAMP(3),
  CONSTRAINT "BusinessPartner_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessPartner_name_check" CHECK (LENGTH(BTRIM("displayName")) >= 2),
  CONSTRAINT "BusinessPartner_identity_check" CHECK (NULLIF(BTRIM("taxCode"), '') IS NOT NULL OR NULLIF(BTRIM("vatNumber"), '') IS NOT NULL),
  CONSTRAINT "BusinessPartner_tax_code_check" CHECK ("taxCode" IS NULL OR "taxCode" ~ '^[A-Z0-9]{11,16}$'),
  CONSTRAINT "BusinessPartner_vat_number_check" CHECK ("vatNumber" IS NULL OR "vatNumber" ~ '^[A-Z0-9]{5,20}$'),
  CONSTRAINT "BusinessPartner_country_code_check" CHECK ("countryCode" ~ '^[A-Z]{2}$'),
  CONSTRAINT "BusinessPartner_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BusinessPartner_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "BusinessPartner_companyId_status_idx" ON "BusinessPartner"("companyId", "status");
CREATE INDEX "BusinessPartner_companyId_displayName_idx" ON "BusinessPartner"("companyId", "displayName");
CREATE UNIQUE INDEX "BusinessPartner_companyId_taxCode_key" ON "BusinessPartner"("companyId", "taxCode");
CREATE UNIQUE INDEX "BusinessPartner_companyId_vatNumber_key" ON "BusinessPartner"("companyId", "vatNumber");

ALTER TABLE "ApprovalRequest" DROP CONSTRAINT "ApprovalRequest_exactly_one_object_check";
ALTER TABLE "ApprovalRequest" DROP CONSTRAINT "ApprovalRequest_object_type_matches_reference_check";
ALTER TABLE "ApprovalRequest" ADD COLUMN "businessPartnerId" UUID;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_exactly_one_object_check"
  CHECK ((("draftId" IS NOT NULL)::integer + ("chartImportId" IS NOT NULL)::integer + ("businessPartnerId" IS NOT NULL)::integer) = 1);
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_object_type_matches_reference_check"
  CHECK (
    ("draftId" IS NOT NULL AND "objectType" = 'ACCOUNTING_DRAFT') OR
    ("chartImportId" IS NOT NULL AND "objectType" = 'CHART_IMPORT') OR
    ("businessPartnerId" IS NOT NULL AND "objectType" = 'BUSINESS_PARTNER')
  );
CREATE UNIQUE INDEX "ApprovalRequest_businessPartnerId_objectVersion_key" ON "ApprovalRequest"("businessPartnerId", "objectVersion");
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_businessPartnerId_fkey"
  FOREIGN KEY ("businessPartnerId") REFERENCES "BusinessPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_business_partner_status_transition()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status = 'PENDING_APPROVAL') OR
    (OLD.status = 'PENDING_APPROVAL' AND NEW.status IN ('PARTIALLY_APPROVED', 'APPROVED', 'REJECTED')) OR
    (OLD.status = 'PARTIALLY_APPROVED' AND NEW.status IN ('APPROVED', 'REJECTED')) OR
    (OLD.status = 'APPROVED' AND NEW.status = 'FINALIZED')
  ) THEN RAISE EXCEPTION 'Transizione di stato non consentita per anagrafica'; END IF;
  IF NEW.status = 'FINALIZED' AND NEW."finalizedAt" IS NULL THEN
    RAISE EXCEPTION 'La finalizzazione richiede il timestamp';
  END IF;
  IF NEW.status = 'FINALIZED' AND NOT EXISTS (
    SELECT 1 FROM "ApprovalRequest" request
    WHERE request."businessPartnerId" = NEW.id
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

CREATE TRIGGER business_partner_status_gate
BEFORE UPDATE OF status ON "BusinessPartner"
FOR EACH ROW EXECUTE FUNCTION enforce_business_partner_status_transition();

CREATE OR REPLACE FUNCTION prevent_finalized_business_partner_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'FINALIZED' THEN RAISE EXCEPTION 'Una anagrafica finalizzata e immutabile'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER business_partner_finalized_immutable
BEFORE UPDATE OR DELETE ON "BusinessPartner"
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_business_partner_mutation();
