import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingStatus, Role, VatPeriodicity } from "@prisma/client";
import type { SessionContext } from "@/lib/auth";

const mocks = vi.hoisted(() => {
  const tx = {
    companyOnboarding: { findUnique: vi.fn(), upsert: vi.fn() }
  };
  return {
    tx,
    appendAudit: vi.fn(),
    db: { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) }
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/audit", () => ({ appendAudit: mocks.appendAudit }));

import { onboardingInputSchema, onboardingProgress, onboardingStatus, saveOnboardingDraft } from "@/lib/onboarding";

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

const complete = {
  countryCode: "IT",
  legalForm: "Forma fittizia",
  accountingRegime: "Regime dichiarato fittizio",
  vatPeriodicity: VatPeriodicity.MONTHLY,
  managementSoftware: "Gestionale di esempio",
  hasChartOfAccounts: true,
  hasOpeningBalances: false
};

describe("onboarding aziendale", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calcola avanzamento e stato senza trasformare la bozza in configurazione definitiva", () => {
    expect(onboardingProgress(complete)).toBe(100);
    expect(onboardingStatus(complete)).toBe(OnboardingStatus.READY_FOR_REVIEW);
    expect(onboardingProgress({ ...complete, legalForm: null })).toBe(86);
    expect(onboardingStatus({ ...complete, legalForm: null })).toBe(OnboardingStatus.IN_PROGRESS);
  });

  it("rifiuta campi client non previsti come tenantId", () => {
    expect(() => onboardingInputSchema.parse({ ...complete, currentStep: 5, tenantId: "company-b" })).toThrow();
  });

  it("salva e cerca esclusivamente nel tenant della sessione", async () => {
    mocks.tx.companyOnboarding.findUnique.mockResolvedValue(null);
    mocks.tx.companyOnboarding.upsert.mockResolvedValue({
      ...complete, currentStep: 5, companyId: "company-a", status: OnboardingStatus.READY_FOR_REVIEW, version: 1
    });
    await saveOnboardingDraft(context, { ...complete, currentStep: 5 });
    expect(mocks.tx.companyOnboarding.findUnique).toHaveBeenCalledWith({ where: { companyId: "company-a" } });
    expect(mocks.tx.companyOnboarding.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: "company-a" },
      create: expect.objectContaining({ companyId: "company-a", updatedById: "user-a" })
    }));
    expect(mocks.appendAudit).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({
      companyId: "company-a", actorId: "user-a", entityType: "CompanyOnboarding"
    }));
  });

  it("impedisce la modifica ai ruoli di sola revisione", async () => {
    await expect(saveOnboardingDraft({ ...context, role: Role.ACCOUNTANT }, { ...complete, currentStep: 5 }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
});
