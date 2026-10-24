import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role, WorkStatus } from "@prisma/client";
import type { SessionContext } from "@/lib/auth";

const mocks = vi.hoisted(() => {
  const tx = {
    chartImport: { findUnique: vi.fn(), create: vi.fn() }
  };
  return {
    tx,
    appendAudit: vi.fn(),
    db: { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) }
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/audit", () => ({ appendAudit: mocks.appendAudit }));

import { createChartImportDraft, parseChartCsv } from "@/lib/chart-import";

const context: SessionContext = {
  userId: "user-a",
  companyId: "company-a",
  role: Role.OPERATOR,
  email: "operatore@example.test",
  displayName: "Operatore fittizio",
  totpEnabled: false,
  mfaVerifiedAt: null,
  approverTotpRequired: false
};

function csvFile(content: string, name = "piano-fittizio.csv") {
  const bytes = new TextEncoder().encode(content);
  return {
    name,
    type: "text/csv",
    size: bytes.byteLength,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    }
  };
}

describe("importazione piano dei conti", () => {
  beforeEach(() => vi.clearAllMocks());

  it("interpreta CSV con punto e virgola, virgolette e gerarchia valida", async () => {
    const parsed = await parseChartCsv(csvFile(
      "codice;nome;tipo;codice_padre\r\n" +
      "1;Attivita;Classe;\r\n" +
      "100;\"Cassa, fittizia\";Conto;1\r\n"
    ));
    expect(parsed.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.lines).toEqual([
      { code: "1", name: "Attivita", accountType: "Classe", parentCode: null, position: 1 },
      { code: "100", name: "Cassa, fittizia", accountType: "Conto", parentCode: "1", position: 2 }
    ]);
  });

  it("rifiuta codici duplicati, padri assenti e gerarchie cicliche", async () => {
    await expect(parseChartCsv(csvFile("codice,nome\n100,Cassa\n100,Banca\n")))
      .rejects.toMatchObject({ code: "DUPLICATE_ACCOUNT_CODE", status: 422 });
    await expect(parseChartCsv(csvFile("codice,nome,codice_padre\n100,Cassa,999\n")))
      .rejects.toMatchObject({ code: "UNKNOWN_PARENT", status: 422 });
    await expect(parseChartCsv(csvFile("codice,nome,codice_padre\n100,Cassa,200\n200,Banca,100\n")))
      .rejects.toMatchObject({ code: "CYCLIC_HIERARCHY", status: 422 });
  });

  it("crea esclusivamente una bozza nel tenant della sessione e registra l'audit", async () => {
    mocks.tx.chartImport.findUnique.mockResolvedValue(null);
    mocks.tx.chartImport.create.mockResolvedValue({
      id: "import-a",
      companyId: "company-a",
      sourceFileName: "piano-fittizio.csv",
      fileHash: "hash",
      rowCount: 1,
      status: WorkStatus.DRAFT,
      version: 1,
      lines: []
    });
    await createChartImportDraft(context, csvFile("codice,nome\n100,Cassa fittizia\n"));
    expect(mocks.tx.chartImport.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId_fileHash: expect.objectContaining({ companyId: "company-a" }) }
    }));
    expect(mocks.tx.chartImport.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        companyId: "company-a",
        createdById: "user-a",
        status: WorkStatus.DRAFT
      })
    }));
    expect(mocks.appendAudit).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({
      companyId: "company-a",
      actorId: "user-a",
      eventType: "CHART_IMPORT_DRAFT_CREATED"
    }));
  });

  it("impedisce il caricamento ai ruoli di sola revisione", async () => {
    await expect(createChartImportDraft(
      { ...context, role: Role.ACCOUNTANT },
      csvFile("codice,nome\n100,Cassa fittizia\n")
    )).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("rifiuta lo stesso file gia presente nell'azienda", async () => {
    mocks.tx.chartImport.findUnique.mockResolvedValue({ id: "existing" });
    await expect(createChartImportDraft(context, csvFile("codice,nome\n100,Cassa fittizia\n")))
      .rejects.toMatchObject({ code: "DUPLICATE_FILE", status: 409 });
    expect(mocks.tx.chartImport.create).not.toHaveBeenCalled();
  });
});
