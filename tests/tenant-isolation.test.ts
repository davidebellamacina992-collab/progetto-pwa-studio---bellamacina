import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";
import type { SessionContext } from "@/lib/auth";

const mocks = vi.hoisted(() => {
  const tx = {
    accountingDraft: { findFirst: vi.fn() },
    approvalRequest: { findFirst: vi.fn() }
  };
  return {
    tx,
    db: { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) }
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { approveRequest, requestDraftApproval } from "@/lib/approval-service";

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

describe("isolamento applicativo tra aziende", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cerca una bozza sempre entro l'azienda della sessione", async () => {
    mocks.tx.accountingDraft.findFirst.mockResolvedValue(null);
    await expect(requestDraftApproval(operator, "draft-of-company-b")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(mocks.tx.accountingDraft.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "draft-of-company-b", companyId: "company-a" }
    }));
  });

  it("non cerca una richiesta di approvazione senza il filtro azienda", async () => {
    mocks.tx.approvalRequest.findFirst.mockResolvedValue(null);
    await expect(approveRequest({ ...operator, role: Role.SUPERVISOR }, "approval-of-company-b", "APPROVO")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(mocks.tx.approvalRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "approval-of-company-b", companyId: "company-a" }
    }));
  });
});
