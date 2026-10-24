import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

const migration = readFileSync(resolve("prisma/migrations/202610220001_phase1/migration.sql"), "utf8");
const onboardingMigration = readFileSync(resolve("prisma/migrations/202610240001_phase2_onboarding/migration.sql"), "utf8");
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
  });

  it("blocca la finalizzazione di una scrittura non quadrata", async () => {
    await seedDraft();
    await database.exec(`INSERT INTO "AccountingLine" (id, "draftId", "accountCode", description, "debitCents", "creditCents") VALUES ('00000000-0000-4000-8000-000000000004', '${draftId}', '1000', 'Dare', 10000, 0);`);
    await expect(database.exec(`UPDATE "AccountingDraft" SET status = 'FINALIZED' WHERE id = '${draftId}';`)).rejects.toThrow(/non quadrata/i);
  });

  it("consente una finalizzazione quadrata e rende testata e righe immutabili", async () => {
    await seedDraft();
    await database.exec(`
      INSERT INTO "AccountingLine" (id, "draftId", "accountCode", description, "debitCents", "creditCents") VALUES
        ('00000000-0000-4000-8000-000000000004', '${draftId}', '1000', 'Dare', 10000, 0),
        ('00000000-0000-4000-8000-000000000005', '${draftId}', '2000', 'Avere', 0, 10000);
      UPDATE "AccountingDraft" SET status = 'FINALIZED' WHERE id = '${draftId}';
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
});
