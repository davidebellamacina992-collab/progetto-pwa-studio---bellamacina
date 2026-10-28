ALTER TABLE "AccountingDraft"
  ADD COLUMN "sourceType" VARCHAR(40),
  ADD COLUMN "sourceFileName" VARCHAR(255),
  ADD COLUMN "sourceFileHash" VARCHAR(64),
  ADD COLUMN "sourceChartImportId" UUID;

CREATE UNIQUE INDEX "AccountingDraft_companyId_sourceFileHash_key"
  ON "AccountingDraft"("companyId", "sourceFileHash");

ALTER TABLE "AccountingDraft" ADD CONSTRAINT "AccountingDraft_sourceChartImportId_fkey"
  FOREIGN KEY ("sourceChartImportId") REFERENCES "ChartImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountingDraft" ADD CONSTRAINT "AccountingDraft_opening_balance_source_check"
  CHECK (
    ("sourceType" IS NULL AND "sourceFileName" IS NULL AND "sourceFileHash" IS NULL AND "sourceChartImportId" IS NULL) OR
    ("sourceType" = 'OPENING_BALANCE_CSV' AND "sourceFileName" IS NOT NULL AND "sourceFileHash" ~ '^[a-f0-9]{64}$' AND "sourceChartImportId" IS NOT NULL)
  );
