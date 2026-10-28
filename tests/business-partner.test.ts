import { beforeEach, describe, expect, it, vi } from "vitest";
import { PartnerKind, Role, WorkStatus } from "@prisma/client";
import type { SessionContext } from "@/lib/auth";
import { objectHash } from "@/lib/security";

const mocks = vi.hoisted(() => {
  const tx = {
    businessPartner: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    accountingDraft: { updateMany: vi.fn() },
    chartImport: { updateMany: vi.fn() },
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

import { createBusinessPartner } from "@/lib/business-partner";
import { approveRequest, finalizeRequest, requestBusinessPartnerApproval } from "@/lib/approval-service";

const operator: SessionContext = {
  userId: "user-a", companyId: "company-a", role: Role.OPERATOR,
  email: "operatore@example.test", displayName: "Operatore fittizio",
  totpEnabled: false, mfaVerifiedAt: null, approverTotpRequired: false
};

const partner = {
  id: "partner-a", companyId: "company-a", kind: PartnerKind.CUSTOMER,
  displayName: "Cliente fittizio", taxCode: "RSSMRA80A01H501U", vatNumber: null,
  email: "cliente@example.test", phone: null, address: null, countryCode: "IT",
  status: WorkStatus.DRAFT, version: 1,
  company: { strongApprovalRequired: true, fourEyesRequired: false }
};

const snapshot = {
  id: partner.id, kind: partner.kind, displayName: partner.displayName, taxCode: partner.taxCode,
  vatNumber: partner.vatNumber, email: partner.email, phone: partner.phone, address: partner.address,
  countryCode: partner.countryCode, version: partner.version
};

describe("anagrafiche controllate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crea esclusivamente una bozza nel tenant della sessione e normalizza gli identificativi", async () => {
    mocks.tx.businessPartner.findFirst.mockResolvedValue(null);
    mocks.tx.businessPartner.create.mockResolvedValue({ ...partner, version: 1 });
    const result = await createBusinessPartner(operator, {
      kind: "CUSTOMER", displayName: "Cliente fittizio", taxCode: "rssmra80a01h501u", countryCode: "it"
    });
    expect(result.status).toBe(WorkStatus.DRAFT);
    expect(mocks.tx.businessPartner.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      companyId: "company-a", createdById: "user-a", taxCode: "RSSMRA80A01H501U", countryCode: "IT"
    }) });
    expect(mocks.appendAudit).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({
      companyId: "company-a", eventType: "BUSINESS_PARTNER_DRAFT_CREATED"
    }));
  });

  it("rifiuta una anagrafica senza codice fiscale e partita IVA", async () => {
    await expect(createBusinessPartner(operator, { kind: "CUSTOMER", displayName: "Cliente fittizio" }))
      .rejects.toThrow(/codice fiscale|partita IVA/i);
    expect(mocks.tx.businessPartner.create).not.toHaveBeenCalled();
  });

  it("crea la richiesta di revisione con filtro azienda", async () => {
    mocks.tx.businessPartner.findFirst.mockResolvedValue(partner);
    mocks.tx.businessPartner.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.approvalRequest.create.mockResolvedValue({ id: "approval-a", status: WorkStatus.PENDING_APPROVAL });
    await requestBusinessPartnerApproval(operator, partner.id);
    expect(mocks.tx.businessPartner.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "partner-a", companyId: "company-a" }
    }));
    expect(mocks.tx.approvalRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      businessPartnerId: "partner-a", objectType: "BUSINESS_PARTNER", companyId: "company-a"
    }) }));
  });

  it("approva e finalizza l'anagrafica senza toccare altri oggetti", async () => {
    mocks.tx.approvalRequest.findFirst.mockResolvedValue({
      id: "approval-a", companyId: "company-a", draftId: null, chartImportId: null,
      businessPartnerId: "partner-a", objectType: "BUSINESS_PARTNER", objectVersion: 1,
      objectHash: objectHash(snapshot), status: WorkStatus.PENDING_APPROVAL, requestedById: "user-a",
      requiresStrongConfirm: true, requiresSecondApproval: false, decisions: [],
      businessPartner: { ...partner, status: WorkStatus.PENDING_APPROVAL }, draft: null, chartImport: null
    });
    mocks.tx.approvalRequest.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.businessPartner.updateMany.mockResolvedValue({ count: 1 });
    const supervisor = { ...operator, userId: "supervisor-a", role: Role.SUPERVISOR };
    expect((await approveRequest(supervisor, "approval-a", "APPROVO")).status).toBe(WorkStatus.APPROVED);
    expect(mocks.tx.accountingDraft.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.chartImport.updateMany).not.toHaveBeenCalled();

    mocks.tx.approvalRequest.findFirst.mockResolvedValue({
      id: "approval-a", companyId: "company-a", draftId: null, chartImportId: null,
      businessPartnerId: "partner-a", objectType: "BUSINESS_PARTNER", objectVersion: 1,
      objectHash: objectHash(snapshot), status: WorkStatus.APPROVED,
      businessPartner: { ...partner, status: WorkStatus.APPROVED }, draft: null, chartImport: null
    });
    expect((await finalizeRequest(supervisor, "approval-a", "FINALIZZO")).status).toBe(WorkStatus.FINALIZED);
    expect(mocks.appendAudit).toHaveBeenLastCalledWith(mocks.tx, expect.objectContaining({
      eventType: "BUSINESS_PARTNER_FINALIZED", entityType: "BusinessPartner", entityId: "partner-a"
    }));
  });
});
