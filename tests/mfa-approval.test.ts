import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { assertApprovalMfa, type SessionContext } from "@/lib/auth";

const context: SessionContext = {
  userId: "user-1",
  companyId: "company-1",
  role: Role.SUPERVISOR,
  email: "responsabile@example.test",
  displayName: "Responsabile fittizio",
  totpEnabled: true,
  mfaVerifiedAt: new Date(),
  approverTotpRequired: true
};

describe("gate MFA delle decisioni", () => {
  it("blocca un approvatore che non ha configurato TOTP", () => {
    expect(() => assertApprovalMfa({ ...context, totpEnabled: false, mfaVerifiedAt: null })).toThrowError(/Configura e verifica/);
  });

  it("blocca una sessione che non ha verificato il secondo fattore", () => {
    expect(() => assertApprovalMfa({ ...context, mfaVerifiedAt: null })).toThrowError(/Configura e verifica/);
  });

  it("consente una sessione verificata", () => {
    expect(() => assertApprovalMfa(context)).not.toThrow();
  });

  it("rispetta la configurazione aziendale che non richiede MFA", () => {
    expect(() => assertApprovalMfa({ ...context, totpEnabled: false, mfaVerifiedAt: null, approverTotpRequired: false })).not.toThrow();
  });
});
