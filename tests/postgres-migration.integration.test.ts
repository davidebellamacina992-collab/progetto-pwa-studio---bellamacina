import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

const migration = readFileSync(resolve("prisma/migrations/202610220001_phase1/migration.sql"), "utf8");
const onboardingMigration = readFileSync(resolve("prisma/migrations/202610240001_phase2_onboarding/migration.sql"), "utf8");
const chartImportMigration = readFileSync(resolve("prisma/migrations/202610240002_phase2_chart_import/migration.sql"), "utf8");
const chartApprovalMigration = readFileSync(resolve("prisma/migrations/202610260001_phase2_chart_approval/migration.sql"), "utf8");
const businessPartnerMigration = readFileSync(resolve("prisma/migrations/202610280001_phase2_business_partners/migration.sql"), "utf8");
const openingBalancesMigration = readFileSync(resolve("prisma/migrations/202610280002_phase2_opening_balances/migration.sql"), "utf8");
const accountingDraftGateMigration = readFileSync(resolve("prisma/migrations/202610280003_accounting_draft_approval_gate/migration.sql"), "utf8");
const operationalChartMigration = readFileSync(resolve("prisma/migrations/202610280004_phase2_operational_chart/migration.sql"), "utf8");
let database: PGlite;

const companyId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const draftId = "00000000-0000-4000-8000-000000000003";

async function seedDraft() {
  await database.exec(`
    INSERT INTO "Company" (id, name, "updatedAt") VALUES ('${companyId}', 'Azienda test isolata', now());
    INSERT INTO "User" (id, email, "passwordHash", "displayName", "updatedAt")
      VALUES ('${userId}', 'utente@example.test', 'hash-fittizio', 'Utente fittizio', now());
    INSERT INTO "AccountingDraft" (id, "companyId", description, "createdById", "updatedAt")
      VALUES ('${draftId}', '${companyId}', 'Scrittura di test', '${userId}', now());
  `);
}

describe("migrazione PostgreSQL eseguibile", () => {
  beforeEach(async () => {
    database = new PGlite();
    await database.exec(migration);
    await database.exec(onboardingMigration);
    await database.exec(chartImportMigration);
    await database.exec(chartApprovalMigration);
    await database.exec(businessPartnerMigration);
    await database.exec(openingBalancesMigration);
    await database.exec(accountingDraftGateMigration);
    await database.exec(operationalChartMigration);
  });

  it("blocca la finalizzazione di una scrittura non quadrata", async () => {
    await seedDraft();
    await database.exec(`
      INSERT INTO "AccountingLine" (id, "draftId", "accountCode", description, "debitCents", "creditCents") VALUES ('00000000-0000-4000-8000-000000000004', '${draftId}', '1000', 'Dare', 10000, 0);
      INSERT INTO "ApprovalRequest" (id, "companyId", "draftId", "objectType", "objectVersion", "objectHash", "requestedById", snapshot, diff, anomalies, "updatedAt")
        VALUES ('00000000-0000-4000-8000-000000000024', '${companyId}', '${draftId}', 'ACCOUNTING_DRAFT', 1, 'hash-non-quadrata', '${userId}', '{}', '{}', '[]', now());
      INSERT INTO "ApprovalDecision" (id, "approvalRequestId", "actorId", decision, "observedHash")
        VALUES ('00000000-0000-4000-8000-000000000025', '00000000-0000-4000-8000-000000000024', '${userId}', 'APPROVE', 'hash-non-quadrata');
      UPDATE "ApprovalRequest" SET status = 'APPROVED' WHERE id = '00000000-0000-4000-8000-000000000024';
      UPDATE "AccountingDraft" SET status = 'PENDING_APPROVAL' WHERE id = '${draftId}';
      UPDATE "AccountingDraft" SET status = 'APPROVED' WHERE id = '${draftId}';
    `);
    await expect(database.exec(`UPDATE "AccountingDraft" SET status = 'FINALIZED', "finalizedAt" = now() WHERE id = '${draftId}';`)).rejects.toThrow(/non quadrata/i);
  });

  it("richiede approvazione anche per una scrittura quadrata e la rende immutabile", async () => {
    await seedDraft();
    await database.exec(`
      INSERT INTO "AccountingLine" (id, "draftId", "accountCode", description, "debitCents", "creditCents") VALUES
        ('00000000-0000-4000-8000-000000000004', '${draftId}', '1000', 'Dare', 10000, 0),
        ('00000000-0000-4000-8000-000000000005', '${draftId}', '2000', 'Avere', 0, 10000);
    `);
    await expect(database.exec(`UPDATE "AccountingDraft" SET status = 'FINALIZED', "finalizedAt" = now() WHERE id = '${draftId}';`))
      .rejects.toThrow(/transizione|approvazione/i);
    await database.exec(`
      INSERT INTO "ApprovalRequest" (id, "companyId", "draftId", "objectType", "objectVersion", "objectHash", "requestedById", snapshot, diff, anomalies, "updatedAt")
        VALUES ('00000000-0000-4000-8000-000000000022', '${companyId}', '${draftId}', 'ACCOUNTING_DRAFT', 1, 'hash-scrittura', '${userId}', '{}', '{}', '[]', now());
      INSERT INTO "ApprovalDecision" (id, "approvalRequestId", "actorId", decision, "observedHash")
        VALUES ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000022', '${userId}', 'APPROVE', 'hash-scrittura');
      UPDATE "ApprovalRequest" SET status = 'APPROVED' WHERE id = '00000000-0000-4000-8000-000000000022';
      UPDATE "AccountingDraft" SET status = 'PENDING_APPROVAL' WHERE id = '${draftId}';
      UPDATE "AccountingDraft" SET status = 'APPROVED' WHERE id = '${draftId}';
      UPDATE "AccountingDraft" SET status = 'FINALIZED', "finalizedAt" = now() WHERE id = '${draftId}';
    `);
    await expect(database.exec(`UPDATE "AccountingDraft" SET description = 'Alterata' WHERE id = '${draftId}';`)).rejects.toThrow(/immutabile/i);
    await expect(database.exec(`UPDATE "AccountingLine" SET "debitCents" = 9999 WHERE id = '00000000-0000-4000-8000-000000000004';`)).rejects.toThrow(/immutabili/i);
    await expect(database.exec(`DELETE FROM "AccountingLine" WHERE id = '00000000-0000-4000-8000-000000000005';`)).rejects.toThrow(/immutabili/i);
  });

  it("impedisce modifica e cancellazione dell'audit", async () => {
    await database.exec(`
      INSERT INTO "Company" (id, name, "updatedAt") VALUES ('${companyId}', 'Azienda test isolata', now());
      INSERT INTO "AuditLog" (id, "companyId", "eventType", "entityType", "entityId", "correlationId", "entryHash")
        VALUES ('00000000-0000-4000-8000-000000000006', '${companyId}', 'TEST', 'Test', 'test-1', 'corr-1', 'hash-1');
    `);
    await expect(database.exec(`UPDATE "AuditLog" SET "eventType" = 'ALTERED' WHERE id = '00000000-0000-4000-8000-000000000006';`)).rejects.toThrow(/append-only/i);
    await expect(database.exec(`DELETE FROM "AuditLog" WHERE id = '00000000-0000-4000-8000-000000000006';`)).rejects.toThrow(/append-only/i);
  });

  it("vincola il wizard onboarding all'azienda e a passaggi validi", async () => {
    await database.exec(`
      INSERT INTO "Company" (id, name, "updatedAt") VALUES ('${companyId}', 'Azienda test isolata', now());
      INSERT INTO "User" (id, email, "passwordHash", "displayName", "updatedAt")
        VALUES ('${userId}', 'utente@example.test', 'hash-fittizio', 'Utente fittizio', now());
      INSERT INTO "CompanyOnboarding" ("companyId", "countryCode", "currentStep", "updatedById", "updatedAt")
        VALUES ('${companyId}', 'IT', 1, '${userId}', now());
    `);
    await expect(database.exec(`UPDATE "CompanyOnboarding" SET "currentStep" = 6 WHERE "companyId" = '${companyId}';`))
      .rejects.toThrow();
    await expect(database.exec(`UPDATE "CompanyOnboarding" SET "countryCode" = 'ita' WHERE "companyId" = '${companyId}';`))
      .rejects.toThrow();
  });

  it("mantiene gli import del piano dei conti in bozza e impedisce duplicati per azienda", async () => {
    await database.exec(
      "INSERT INTO \"Company\" (id, name, \"updatedAt\") VALUES ('" + companyId + "', 'Azienda test isolata', now());" +
      "INSERT INTO \"User\" (id, email, \"passwordHash\", \"displayName\", \"updatedAt\") VALUES ('" + userId +
        "', 'utente@example.test', 'hash-fittizio', 'Utente fittizio', now());" +
      "INSERT INTO \"ChartImport\" (id, \"companyId\", \"sourceFileName\", \"fileHash\", \"rowCount\", \"createdById\", \"updatedAt\") " +
        "VALUES ('00000000-0000-4000-8000-000000000007', '" + companyId +
        "', 'piano-fittizio.csv', 'hash-fittizio', 1, '" + userId + "', now());" +
      "INSERT INTO \"ChartAccountDraftLine\" (id, \"importId\", code, name, position) " +
        "VALUES ('00000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000007', '100', 'Cassa fittizia', 1);"
    );
    await expect(database.exec(
      "INSERT INTO \"ChartImport\" (id, \"companyId\", \"sourceFileName\", \"fileHash\", \"rowCount\", \"createdById\", \"updatedAt\") " +
        "VALUES ('00000000-0000-4000-8000-000000000009', '" + companyId +
        "', 'duplicato.csv', 'hash-fittizio', 1, '" + userId + "', now());"
    )).rejects.toThrow();
    await expect(database.exec(
      "UPDATE \"ChartImport\" SET status = 'APPROVED' " +
        "WHERE id = '00000000-0000-4000-8000-000000000007';"
    )).rejects.toThrow();
  });

  it("richiede un solo oggetto per approvazione e rende immutabile il piano finalizzato", async () => {
    await database.exec(
      "INSERT INTO \"Company\" (id, name, \"updatedAt\") VALUES ('" + companyId + "', 'Azienda test isolata', now());" +
      "INSERT INTO \"User\" (id, email, \"passwordHash\", \"displayName\", \"updatedAt\") VALUES ('" + userId +
        "', 'utente@example.test', 'hash-fittizio', 'Utente fittizio', now());" +
      "INSERT INTO \"ChartImport\" (id, \"companyId\", \"sourceFileName\", \"fileHash\", \"rowCount\", \"createdById\", \"updatedAt\") " +
        "VALUES ('00000000-0000-4000-8000-000000000010', '" + companyId +
        "', 'piano-fittizio.csv', 'hash-approvazione', 1, '" + userId + "', now());" +
      "INSERT INTO \"ChartAccountDraftLine\" (id, \"importId\", code, name, position) " +
        "VALUES ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000010', '100', 'Cassa fittizia', 1);"
    );
    await expect(database.exec(
      "INSERT INTO \"ApprovalRequest\" (id, \"companyId\", \"objectType\", \"objectVersion\", \"objectHash\", \"requestedById\", snapshot, diff, anomalies, \"updatedAt\") " +
        "VALUES ('00000000-0000-4000-8000-000000000012', '" + companyId +
        "', 'CHART_IMPORT', 1, 'hash', '" + userId + "', '{}', '{}', '[]', now());"
    )).rejects.toThrow();
    await database.exec(
      "INSERT INTO \"ApprovalRequest\" (id, \"companyId\", \"chartImportId\", \"objectType\", \"objectVersion\", \"objectHash\", \"requestedById\", snapshot, diff, anomalies, \"updatedAt\") " +
        "VALUES ('00000000-0000-4000-8000-000000000013', '" + companyId +
        "', '00000000-0000-4000-8000-000000000010', 'CHART_IMPORT', 1, 'hash', '" + userId +
        "', '{}', '{}', '[]', now());" +
      "INSERT INTO \"ApprovalDecision\" (id, \"approvalRequestId\", \"actorId\", decision, \"observedHash\") " +
        "VALUES ('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000013', '" +
        userId + "', 'APPROVE', 'hash');" +
      "UPDATE \"ApprovalRequest\" SET status = 'APPROVED' WHERE id = '00000000-0000-4000-8000-000000000013';" +
      "UPDATE \"ChartImport\" SET status = 'PENDING_APPROVAL' WHERE id = '00000000-0000-4000-8000-000000000010';" +
      "UPDATE \"ChartImport\" SET status = 'APPROVED' WHERE id = '00000000-0000-4000-8000-000000000010';" +
      "UPDATE \"ChartImport\" SET status = 'FINALIZED', \"finalizedAt\" = now() WHERE id = '00000000-0000-4000-8000-000000000010';"
    );
    await expect(database.exec(
      "UPDATE \"ChartAccountDraftLine\" SET name = 'Alterata' WHERE id = '00000000-0000-4000-8000-000000000011';"
    )).rejects.toThrow(/immutabili/i);
    await expect(database.exec(
      "UPDATE \"ChartImport\" SET \"sourceFileName\" = 'alterato.csv' WHERE id = '00000000-0000-4000-8000-000000000010';"
    )).rejects.toThrow(/immutabile/i);
  });

  it("impedisce il bypass e rende immutabile una anagrafica finalizzata", async () => {
    const partnerId = "00000000-0000-4000-8000-000000000015";
    const approvalId = "00000000-0000-4000-8000-000000000016";
    await database.exec(`
      INSERT INTO "Company" (id, name, "updatedAt") VALUES ('${companyId}', 'Azienda test isolata', now());
      INSERT INTO "User" (id, email, "passwordHash", "displayName", "updatedAt")
        VALUES ('${userId}', 'utente@example.test', 'hash-fittizio', 'Utente fittizio', now());
    `);
    await expect(database.exec(`
      INSERT INTO "BusinessPartner" (id, "companyId", kind, "displayName", "taxCode", "createdById", "updatedAt")
        VALUES ('00000000-0000-4000-8000-000000000018', '${companyId}', 'CUSTOMER', 'Cliente non valido', 'minuscolo123', '${userId}', now());
    `)).rejects.toThrow();
    await database.exec(`
      INSERT INTO "BusinessPartner" (id, "companyId", kind, "displayName", "taxCode", "createdById", "updatedAt")
        VALUES ('${partnerId}', '${companyId}', 'CUSTOMER', 'Cliente fittizio', 'RSSMRA80A01H501U', '${userId}', now());
    `);
    await expect(database.exec(`
      UPDATE "BusinessPartner" SET status = 'FINALIZED', "finalizedAt" = now() WHERE id = '${partnerId}';
    `)).rejects.toThrow(/transizione|approvazione/i);
    await database.exec(`
      INSERT INTO "ApprovalRequest" (id, "companyId", "businessPartnerId", "objectType", "objectVersion", "objectHash", "requestedById", snapshot, diff, anomalies, "updatedAt")
        VALUES ('${approvalId}', '${companyId}', '${partnerId}', 'BUSINESS_PARTNER', 1, 'hash-anagrafica', '${userId}', '{}', '{}', '[]', now());
      INSERT INTO "ApprovalDecision" (id, "approvalRequestId", "actorId", decision, "observedHash")
        VALUES ('00000000-0000-4000-8000-000000000017', '${approvalId}', '${userId}', 'APPROVE', 'hash-anagrafica');
      UPDATE "ApprovalRequest" SET status = 'APPROVED' WHERE id = '${approvalId}';
      UPDATE "BusinessPartner" SET status = 'PENDING_APPROVAL' WHERE id = '${partnerId}';
      UPDATE "BusinessPartner" SET status = 'APPROVED' WHERE id = '${partnerId}';
      UPDATE "BusinessPartner" SET status = 'FINALIZED', "finalizedAt" = now() WHERE id = '${partnerId}';
    `);
    await expect(database.exec(`UPDATE "BusinessPartner" SET "displayName" = 'Alterato' WHERE id = '${partnerId}';`))
      .rejects.toThrow(/immutabile/i);
    await expect(database.exec(`DELETE FROM "BusinessPartner" WHERE id = '${partnerId}';`))
      .rejects.toThrow(/immutabile/i);
  });

  it("vincola la provenienza dei saldi iniziali e impedisce file duplicati", async () => {
    await seedDraft();
    await expect(database.exec(`UPDATE "AccountingDraft" SET "sourceType" = 'OPENING_BALANCE_CSV' WHERE id = '${draftId}';`))
      .rejects.toThrow();
    await database.exec(`
      INSERT INTO "ChartImport" (id, "companyId", "sourceFileName", "fileHash", "rowCount", "createdById", "updatedAt")
        VALUES ('00000000-0000-4000-8000-000000000020', '${companyId}', 'piano-fittizio.csv', 'hash-saldi-chart', 1, '${userId}', now());
      UPDATE "AccountingDraft" SET "sourceType" = 'OPENING_BALANCE_CSV', "sourceFileName" = 'saldi-fittizi.csv',
        "sourceFileHash" = '${"a".repeat(64)}', "sourceChartImportId" = '00000000-0000-4000-8000-000000000020' WHERE id = '${draftId}';
    `);
    await expect(database.exec(`
      INSERT INTO "AccountingDraft" (id, "companyId", description, "createdById", "sourceType", "sourceFileName", "sourceFileHash", "sourceChartImportId", "updatedAt")
        VALUES ('00000000-0000-4000-8000-000000000021', '${companyId}', 'Duplicato', '${userId}', 'OPENING_BALANCE_CSV', 'duplicato.csv', '${"a".repeat(64)}', '00000000-0000-4000-8000-000000000020', now());
    `)).rejects.toThrow();
  });

  it("attiva un piano operativo soltanto con piano finalizzato e approvazione valida", async () => {
    const chartId = "00000000-0000-4000-8000-000000000030";
    const selectionId = "00000000-0000-4000-8000-000000000031";
    const approvalId = "00000000-0000-4000-8000-000000000032";
    await database.exec(`
      INSERT INTO "Company" (id, name, "updatedAt") VALUES ('${companyId}', 'Azienda test isolata', now());
      INSERT INTO "User" (id, email, "passwordHash", "displayName", "updatedAt")
        VALUES ('${userId}', 'utente@example.test', 'hash-fittizio', 'Utente fittizio', now());
      INSERT INTO "ChartImport" (id, "companyId", "sourceFileName", "fileHash", "rowCount", "createdById", status, "finalizedAt", "updatedAt")
        VALUES ('${chartId}', '${companyId}', 'piano-fittizio.csv', 'hash-operativo', 1, '${userId}', 'FINALIZED', now(), now());
      INSERT INTO "ChartSelection" (id, "companyId", "chartImportId", "createdById", "updatedAt")
        VALUES ('${selectionId}', '${companyId}', '${chartId}', '${userId}', now());
    `);
    await expect(database.exec(`UPDATE "ChartSelection" SET status = 'FINALIZED', "finalizedAt" = now() WHERE id = '${selectionId}';`))
      .rejects.toThrow(/transizione|approvazione/i);
    await database.exec(`
      INSERT INTO "ApprovalRequest" (id, "companyId", "chartSelectionId", "objectType", "objectVersion", "objectHash", "requestedById", snapshot, diff, anomalies, "updatedAt")
        VALUES ('${approvalId}', '${companyId}', '${selectionId}', 'CHART_SELECTION', 1, 'hash-selezione', '${userId}', '{}', '{}', '[]', now());
      INSERT INTO "ApprovalDecision" (id, "approvalRequestId", "actorId", decision, "observedHash")
        VALUES ('00000000-0000-4000-8000-000000000033', '${approvalId}', '${userId}', 'APPROVE', 'hash-selezione');
      UPDATE "ApprovalRequest" SET status = 'APPROVED' WHERE id = '${approvalId}';
      UPDATE "ChartSelection" SET status = 'PENDING_APPROVAL' WHERE id = '${selectionId}';
      UPDATE "ChartSelection" SET status = 'APPROVED' WHERE id = '${selectionId}';
      UPDATE "ChartSelection" SET status = 'FINALIZED', "finalizedAt" = now() WHERE id = '${selectionId}';
    `);
    await expect(database.exec(`UPDATE "ChartSelection" SET version = 2 WHERE id = '${selectionId}';`))
      .rejects.toThrow(/immutabile/i);
  });
});
