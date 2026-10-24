CREATE TYPE "OnboardingStatus" AS ENUM ('IN_PROGRESS', 'READY_FOR_REVIEW');
CREATE TYPE "VatPeriodicity" AS ENUM ('MONTHLY', 'QUARTERLY', 'NOT_APPLICABLE');

CREATE TABLE "CompanyOnboarding" (
    "companyId" UUID NOT NULL,
    "countryCode" VARCHAR(2),
    "legalForm" TEXT,
    "accountingRegime" TEXT,
    "vatPeriodicity" "VatPeriodicity",
    "managementSoftware" TEXT,
    "hasChartOfAccounts" BOOLEAN,
    "hasOpeningBalances" BOOLEAN,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyOnboarding_pkey" PRIMARY KEY ("companyId"),
    CONSTRAINT "CompanyOnboarding_currentStep_check" CHECK ("currentStep" BETWEEN 1 AND 5),
    CONSTRAINT "CompanyOnboarding_countryCode_check" CHECK ("countryCode" IS NULL OR "countryCode" ~ '^[A-Z]{2}$')
);

CREATE INDEX "CompanyOnboarding_status_idx" ON "CompanyOnboarding"("status");

ALTER TABLE "CompanyOnboarding" ADD CONSTRAINT "CompanyOnboarding_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyOnboarding" ADD CONSTRAINT "CompanyOnboarding_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
