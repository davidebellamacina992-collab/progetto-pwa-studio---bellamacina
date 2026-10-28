CREATE OR REPLACE FUNCTION ensure_balanced_before_finalization()
RETURNS trigger AS $$
DECLARE
  debit_total BIGINT;
  credit_total BIGINT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status IN ('DRAFT', 'REJECTED') AND NEW.status = 'PENDING_APPROVAL') OR
    (OLD.status = 'PENDING_APPROVAL' AND NEW.status IN ('PARTIALLY_APPROVED', 'APPROVED', 'REJECTED')) OR
    (OLD.status = 'PARTIALLY_APPROVED' AND NEW.status IN ('APPROVED', 'REJECTED')) OR
    (OLD.status = 'APPROVED' AND NEW.status = 'FINALIZED')
  ) THEN RAISE EXCEPTION 'Transizione di stato non consentita per la registrazione'; END IF;

  IF NEW.status = 'FINALIZED' THEN
    SELECT COALESCE(SUM("debitCents"), 0), COALESCE(SUM("creditCents"), 0)
      INTO debit_total, credit_total FROM "AccountingLine" WHERE "draftId" = NEW.id;
    IF debit_total = 0 OR debit_total <> credit_total THEN
      RAISE EXCEPTION 'Registrazione non quadrata: Dare % Avere %', debit_total, credit_total;
    END IF;
    IF NEW."finalizedAt" IS NULL THEN RAISE EXCEPTION 'La finalizzazione richiede il timestamp'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "ApprovalRequest" request
      WHERE request."draftId" = NEW.id AND request."objectVersion" = NEW.version
        AND request.status = 'APPROVED'
        AND (SELECT COUNT(DISTINCT decision."actorId") FROM "ApprovalDecision" decision
          WHERE decision."approvalRequestId" = request.id AND decision.decision = 'APPROVE'
            AND decision."observedHash" = request."objectHash") >=
            CASE WHEN request."requiresSecondApproval" THEN 2 ELSE 1 END
    ) THEN RAISE EXCEPTION 'La finalizzazione richiede una approvazione umana valida'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
