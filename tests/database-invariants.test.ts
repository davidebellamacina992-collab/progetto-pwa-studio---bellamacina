import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("prisma/migrations/202610220001_phase1/migration.sql"), "utf8");

describe("difese database della Fase 1", () => {
  it("vieta update e delete del registro audit", () => {
    expect(migration).toContain("audit_log_no_update");
    expect(migration).toContain("audit_log_no_delete");
  });

  it("verifica la quadratura prima della finalizzazione", () => {
    expect(migration).toContain("accounting_draft_balance_gate");
    expect(migration).toContain('debit_total <> credit_total OR debit_total = 0');
  });

  it("rende immutabili testata e righe finalizzate", () => {
    expect(migration).toContain("accounting_draft_finalized_immutable");
    expect(migration).toContain("accounting_line_finalized_immutable");
  });

  it("rende append-only le decisioni umane", () => {
    expect(migration).toContain("approval_decision_no_update");
    expect(migration).toContain("approval_decision_no_delete");
  });
});
