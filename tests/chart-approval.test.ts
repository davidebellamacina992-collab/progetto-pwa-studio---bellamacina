import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role, WorkStatus } from "@prisma/client";
import type { SessionContext } from "@/lib/auth";
import { objectHash } from "@/lib/security";

const mocks = vi.hoisted(() => {
  const tx = {
    chartImport: { findFirst: vi.fn(), updateMany: vi.fn() },
    accountingDraft: { updateMany: vi.fn() },
    approvalRequest: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    approvalDecision: { create: vi.fn() }
  };
  return {
    tx,
    appendAudit: vi.fn(),
    db: { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) }
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/audit", () => ({ appendAudit: mocks.appendAudit }));

import { approveRequest, finalizeRequest, requestChartImportApproval } from "@/lib/approval-service";

const operator: SessionContext = {
  userId: "user-a",
  companyId: "company-a",
  role: Role.OPERATOR,
  email: "operatore@example.test",
  displayName: "Operatore fittizio",
  totpEnabled: false,
  mfaVerifiedAt: null,
  approverTotpRequired: false
};

const lines = [{
  code: "100",
  name: "Cassa fittizia",
  accountType: "Conto",
  parentCode: null,
  position: 1
}];

const chartImport = {
  id: "import-a",
  companyId: "company-a",
  sourceFileName: "piano-fittizio.csv",
  fileHash: "hash-fittizio",
  rowCount: 1,
  version: 1,
  status: WorkStatus.DRAFT,
  lines,
  company: { strongApprovalRequired: true, fourEyesRequired: false }
};

const snapshot = {
  id: chartImport.id,
  sourceFileName: chartImport.sourceFileName,
  fileHash: chartImport.fileHash,
  rowCount: chartImport.rowCount,
  version: chartImport.version,
  lines
};

describe("approvazione del piano dei conti", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crea la richiesta nel tenant della sessione e sposta la bozza in revisione", async () => {
    mocks.tx.chartImport.findFirst.mockResolvedValue(chartImport);
    mocks.tx.chartImport.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.approvalRequest.create.mockResolvedValue({ id: "approval-a" });

    await requestChartImportApproval(operator, "import-a");

    expect(mocks.tx.chartImport.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "import-a", companyId: "company-a" }
    }));
    expect(mocks.tx.approvalRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        companyId: "company-a",
        chartImportId: "import-a",
        objectType: "CHART_IMPORT",
        requestedById: "user-a"
      })
    }));
    expect(mocks.tx.chartImport.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: "company-a", status: WorkStatus.DRAFT }),
      data: { status: WorkStatus.PENDING_APPROVAL }
    }));
    expect(mocks.appendAudit).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({
      eventType: "CHART_IMPORT_APPROVAL_REQUESTED",
      companyId: "company-a"
    }));
  });

  it("applica l'approvazione al piano dei conti senza toccare le scritture", async () => {
    mocks.tx.approvalRequest.findFirst.mockResolvedValue({
      id: "approval-a",
      companyId: "company-a",
      chartImportId: "import-a",
      draftId: null,
      objectType: "CHART_IMPORT",
      objectVersion: 1,
      objectHash: objectHash(snapshot),
      status: WorkStatus.PENDING_APPROVAL,
      requestedById: "user-a",
      requiresStrongConfirm: true,
      requiresSecondApproval: false,
      decisions: [],
      chartImport: { ...chartImport, status: WorkStatus.PENDING_APPROVAL },
      draft: null
    });
    mocks.tx.approvalRequest.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.chartImport.updateMany.mockResolvedValue({ count: 1 });

    const result = await approveRequest({ ...operator, userId: "supervisor-a", role: Role.SUPERVISOR }, "approval-a", "APPROVO");

    expect(result.status).toBe(WorkStatus.APPROVED);
    expect(mocks.tx.chartImport.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "import-a", companyId: "company-a" }),
      data: { status: WorkStatus.APPROVED }
    }));
    expect(mocks.tx.accountingDraft.updateMany).not.toHaveBeenCalled();
  });

  it("finalizza il piano approvato con timestamp e audit dedicato", async () => {
    mocks.tx.approvalRequest.findFirst.mockResolvedValue({
      id: "approval-a",
      companyId: "company-a",
      chartImportId: "import-a",
      draftId: null,
      objectType: "CHART_IMPORT",
      objectVersion: 1,
      objectHash: objectHash(snapshot),
      status: WorkStatus.APPROVED,
      chartImport: { ...chartImport, status: WorkStatus.APPROVED },
      draft: null
    });
    mocks.tx.chartImport.updateMany.mockResolvedValue({ count: 1 });

    const result = await finalizeRequest({ ...operator, userId: "supervisor-a", role: Role.SUPERVISOR }, "approval-a", "FINALIZZO");

    expect(result.status).toBe(WorkStatus.FINALIZED);
    expect(mocks.tx.chartImport.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: WorkStatus.APPROVED }),
      data: expect.objectContaining({ status: WorkStatus.FINALIZED, finalizedAt: expect.any(Date) })
    }));
    expect(mocks.appendAudit).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({
      eventType: "CHART_IMPORT_FINALIZED",
      entityType: "ChartImport",
      entityId: "import-a"
    }));
  });
});
