ALTER TABLE "ChartImport"
  DROP CONSTRAINT "ChartImport_draft_only_check",
  ADD COLUMN "finalizedAt" TIMESTAMP(3);

ALTER TABLE "ApprovalRequest"
  ALTER COLUMN "draftId" DROP NOT NULL,
  ADD COLUMN "chartImportId" UUID,
  ADD CONSTRAINT "ApprovalRequest_exactly_one_object_check"
    CHECK ((("draftId" IS NOT NULL)::integer + ("chartImportId" IS NOT NULL)::integer) = 1),
  ADD CONSTRAINT "ApprovalRequest_object_type_matches_reference_check"
    CHECK (
      ("draftId" IS NOT NULL AND "objectType" = 'ACCOUNTING_DRAFT') OR
      ("chartImportId" IS NOT NULL AND "objectType" = 'CHART_IMPORT')
    );

CREATE UNIQUE INDEX "ApprovalRequest_chartImportId_objectVersion_key"
  ON "ApprovalRequest"("chartImportId", "objectVersion");

ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_chartImportId_fkey"
  FOREIGN KEY ("chartImportId") REFERENCES "ChartImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_chart_import_status_transition()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status = 'PENDING_APPROVAL') OR
    (OLD.status = 'PENDING_APPROVAL' AND NEW.status IN ('PARTIALLY_APPROVED', 'APPROVED', 'REJECTED')) OR
    (OLD.status = 'PARTIALLY_APPROVED' AND NEW.status IN ('APPROVED', 'REJECTED')) OR
    (OLD.status = 'APPROVED' AND NEW.status = 'FINALIZED')
  ) THEN
    RAISE EXCEPTION 'Transizione di stato non consentita per il piano dei conti';
  END IF;
  IF NEW.status = 'FINALIZED' AND NEW."finalizedAt" IS NULL THEN
    RAISE EXCEPTION 'La finalizzazione richiede il timestamp';
  END IF;
  IF NEW.status = 'FINALIZED' AND NOT EXISTS (
    SELECT 1
    FROM "ApprovalRequest" request
    WHERE request."chartImportId" = NEW.id
      AND request."objectVersion" = NEW.version
      AND request.status = 'APPROVED'
      AND (
        SELECT COUNT(DISTINCT decision."actorId")
        FROM "ApprovalDecision" decision
        WHERE decision."approvalRequestId" = request.id
          AND decision.decision = 'APPROVE'
          AND decision."observedHash" = request."objectHash"
      ) >= CASE WHEN request."requiresSecondApproval" THEN 2 ELSE 1 END
  ) THEN
    RAISE EXCEPTION 'La finalizzazione richiede una approvazione umana valida';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chart_import_status_gate
BEFORE UPDATE OF status ON "ChartImport"
FOR EACH ROW EXECUTE FUNCTION enforce_chart_import_status_transition();

CREATE OR REPLACE FUNCTION prevent_finalized_chart_import_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'FINALIZED' THEN
    RAISE EXCEPTION 'Un piano dei conti finalizzato e immutabile';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chart_import_finalized_immutable
BEFORE UPDATE OR DELETE ON "ChartImport"
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_chart_import_mutation();

CREATE OR REPLACE FUNCTION prevent_finalized_chart_line_mutation()
RETURNS trigger AS $$
DECLARE
  target_import_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_import_id := OLD."importId";
  ELSE
    target_import_id := NEW."importId";
  END IF;
  IF EXISTS (SELECT 1 FROM "ChartImport" WHERE id = target_import_id AND status = 'FINALIZED') THEN
    RAISE EXCEPTION 'Le righe di un piano dei conti finalizzato sono immutabili';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."importId" <> NEW."importId" AND EXISTS (
    SELECT 1 FROM "ChartImport" WHERE id = OLD."importId" AND status = 'FINALIZED'
  ) THEN
    RAISE EXCEPTION 'Le righe di un piano dei conti finalizzato sono immutabili';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chart_account_line_finalized_immutable
BEFORE INSERT OR UPDATE OR DELETE ON "ChartAccountDraftLine"
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_chart_line_mutation();
