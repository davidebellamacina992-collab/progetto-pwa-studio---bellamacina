CREATE TABLE "ChartImport" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "status" "WorkStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChartImport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChartImport_rowCount_check" CHECK ("rowCount" BETWEEN 1 AND 5000),
    CONSTRAINT "ChartImport_draft_only_check" CHECK ("status" = 'DRAFT')
);

CREATE TABLE "ChartAccountDraftLine" (
    "id" UUID NOT NULL,
    "importId" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "accountType" VARCHAR(80),
    "parentCode" VARCHAR(40),
    "position" INTEGER NOT NULL,

    CONSTRAINT "ChartAccountDraftLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChartAccountDraftLine_position_check" CHECK ("position" > 0),
    CONSTRAINT "ChartAccountDraftLine_no_self_parent_check" CHECK ("parentCode" IS NULL OR "parentCode" <> "code")
);

CREATE UNIQUE INDEX "ChartImport_companyId_fileHash_key" ON "ChartImport"("companyId", "fileHash");
CREATE INDEX "ChartImport_companyId_status_idx" ON "ChartImport"("companyId", "status");
CREATE UNIQUE INDEX "ChartAccountDraftLine_importId_code_key" ON "ChartAccountDraftLine"("importId", "code");
CREATE INDEX "ChartAccountDraftLine_importId_position_idx" ON "ChartAccountDraftLine"("importId", "position");

ALTER TABLE "ChartImport" ADD CONSTRAINT "ChartImport_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChartImport" ADD CONSTRAINT "ChartImport_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChartAccountDraftLine" ADD CONSTRAINT "ChartAccountDraftLine_importId_fkey"
  FOREIGN KEY ("importId") REFERENCES "ChartImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
