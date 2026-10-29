import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role, WorkStatus } from "@prisma/client";
import type { SessionContext } from "@/lib/auth";

const mocks = vi.hoisted(() => {
  const tx = {
    chartImport: { findFirst: vi.fn() },
    chartSelection: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    approvalRequest: { create: vi.fn() }
  };
  return {
    tx,
    appendAudit: vi.fn(),
    db: { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) }
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/audit", () => ({ appendAudit: mocks.appendAudit }));

import { createChartSelectionDraft } from "@/lib/chart-selection";
import { requestChartSelectionApproval } from "@/lib/approval-service";

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

const chart = {
  id: "chart-a",
  companyId: "company-a",
  sourceFileName: "piano-fittizio.csv",
  fileHash: "hash-fittizio",
  rowCount: 12,
  status: WorkStatus.FINALIZED
};

describe("selezione del piano dei conti operativo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crea esclusivamente una bozza da un piano finalizzato dello stesso tenant", async () => {
    mocks.tx.chartImport.findFirst.mockResolvedValue(chart);
    mocks.tx.chartSelection.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocks.tx.chartSelection.create.mockResolvedValue({
      id: "selection-a",
      chartImportId: chart.id,
      status: WorkStatus.DRAFT,
      chartImport: chart
    });

    const result = await createChartSelectionDraft(operator, chart.id);

    expect(result.status).toBe(WorkStatus.DRAFT);
    expect(mocks.tx.chartImport.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: chart.id, companyId: "company-a", status: WorkStatus.FINALIZED }
    }));
    expect(mocks.tx.chartSelection.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ companyId: "company-a", chartImportId: chart.id, status: WorkStatus.DRAFT })
    }));
    expect(mocks.appendAudit).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({
      eventType: "CHART_SELECTION_DRAFT_CREATED"
    }));
  });

  it("invia la selezione al motore condiviso senza attivarla", async () => {
    mocks.tx.chartSelection.findFirst.mockResolvedValue({
      id: "selection-a",
      companyId: "company-a",
      chartImportId: chart.id,
      status: WorkStatus.DRAFT,
      version: 1,
      chartImport: chart,
      company: { strongApprovalRequired: true, fourEyesRequired: true }
    });
    mocks.tx.chartSelection.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.approvalRequest.create.mockResolvedValue({ id: "approval-a" });

    await requestChartSelectionApproval(operator, "selection-a");

    expect(mocks.tx.approvalRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        chartSelectionId: "selection-a",
        objectType: "CHART_SELECTION",
        requiresSecondApproval: true
      })
    }));
    expect(mocks.tx.chartSelection.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: WorkStatus.PENDING_APPROVAL }
    }));
  });
});
