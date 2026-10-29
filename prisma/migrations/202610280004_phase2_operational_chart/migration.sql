CREATE TABLE "ChartSelection" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "chartImportId" UUID NOT NULL,
  "status" "WorkStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "finalizedAt" TIMESTAMP(3),
  CONSTRAINT "ChartSelection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChartSelection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ChartSelection_chartImportId_fkey" FOREIGN KEY ("chartImportId") REFERENCES "ChartImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ChartSelection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ChartSelection_companyId_status_finalizedAt_idx" ON "ChartSelection"("companyId", "status", "finalizedAt");
CREATE INDEX "ChartSelection_chartImportId_idx" ON "ChartSelection"("chartImportId");

ALTER TABLE "ApprovalRequest" DROP CONSTRAINT "ApprovalRequest_exactly_one_object_check";
ALTER TABLE "ApprovalRequest" DROP CONSTRAINT "ApprovalRequest_object_type_matches_reference_check";
ALTER TABLE "ApprovalRequest" ADD COLUMN "chartSelectionId" UUID;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_exactly_one_object_check"
  CHECK ((("draftId" IS NOT NULL)::integer + ("chartImportId" IS NOT NULL)::integer +
    ("businessPartnerId" IS NOT NULL)::integer + ("chartSelectionId" IS NOT NULL)::integer) = 1);
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_object_type_matches_reference_check"
  CHECK (
    ("draftId" IS NOT NULL AND "objectType" = 'ACCOUNTING_DRAFT') OR
    ("chartImportId" IS NOT NULL AND "objectType" = 'CHART_IMPORT') OR
    ("businessPartnerId" IS NOT NULL AND "objectType" = 'BUSINESS_PARTNER') OR
    ("chartSelectionId" IS NOT NULL AND "objectType" = 'CHART_SELECTION')
  );
CREATE UNIQUE INDEX "ApprovalRequest_chartSelectionId_objectVersion_key" ON "ApprovalRequest"("chartSelectionId", "objectVersion");
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_chartSelectionId_fkey"
  FOREIGN KEY ("chartSelectionId") REFERENCES "ChartSelection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_chart_selection_status_transition()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status = 'PENDING_APPROVAL') OR
    (OLD.status = 'PENDING_APPROVAL' AND NEW.status IN ('PARTIALLY_APPROVED', 'APPROVED', 'REJECTED')) OR
    (OLD.status = 'PARTIALLY_APPROVED' AND NEW.status IN ('APPROVED', 'REJECTED')) OR
    (OLD.status = 'APPROVED' AND NEW.status = 'FINALIZED')
  ) THEN RAISE EXCEPTION 'Transizione di stato non consentita per la selezione del piano operativo'; END IF;
  IF NEW.status = 'FINALIZED' AND NEW."finalizedAt" IS NULL THEN
    RAISE EXCEPTION 'La finalizzazione richiede il timestamp';
  END IF;
  IF NEW.status = 'FINALIZED' AND NOT EXISTS (
    SELECT 1 FROM "ApprovalRequest" request
    WHERE request."chartSelectionId" = NEW.id
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

CREATE TRIGGER chart_selection_status_gate
BEFORE UPDATE OF status ON "ChartSelection"
FOR EACH ROW EXECUTE FUNCTION enforce_chart_selection_status_transition();

CREATE OR REPLACE FUNCTION prevent_finalized_chart_selection_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'FINALIZED' THEN RAISE EXCEPTION 'Una selezione del piano operativo finalizzata e immutabile'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chart_selection_finalized_immutable
BEFORE UPDATE OR DELETE ON "ChartSelection"
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_chart_selection_mutation();

CREATE OR REPLACE FUNCTION ensure_chart_selection_same_company_and_finalized()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "ChartImport" chart
    WHERE chart.id = NEW."chartImportId" AND chart."companyId" = NEW."companyId" AND chart.status = 'FINALIZED'
  ) THEN RAISE EXCEPTION 'Il piano operativo deve essere finalizzato e appartenere alla stessa azienda'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chart_selection_valid_target
BEFORE INSERT OR UPDATE OF "chartImportId", "companyId" ON "ChartSelection"
FOR EACH ROW EXECUTE FUNCTION ensure_chart_selection_same_company_and_finalized();
