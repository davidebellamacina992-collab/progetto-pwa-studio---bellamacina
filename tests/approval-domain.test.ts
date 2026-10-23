import { describe, expect, it } from "vitest";
import { Role, WorkStatus } from "@prisma/client";
import { assertCanFinalize, assertCanReject, nextApprovalStatus } from "@/lib/approval-domain";

const base = {
  status: WorkStatus.PENDING_APPROVAL,
  actorRole: Role.SUPERVISOR,
  actorId: "supervisor-1",
  requesterId: "operator-1",
  requiresStrongConfirm: true,
  requiresSecondApproval: false,
  priorApproverIds: [] as string[],
  confirmation: "APPROVO"
};

describe("gate di approvazione", () => {
  it("impedisce all'operatore di approvare anche via chiamata diretta", () => {
    expect(() => nextApprovalStatus({ ...base, actorRole: Role.OPERATOR })).toThrowError(/Solo un responsabile/);
  });

  it("impedisce all'amministratore di approvare in virtu del solo ruolo amministrativo", () => {
    expect(() => nextApprovalStatus({ ...base, actorRole: Role.ADMIN })).toThrowError(/Solo un responsabile/);
  });

  it("richiede la parola di conferma esatta", () => {
    expect(() => nextApprovalStatus({ ...base, confirmation: "approvo" })).toThrowError(/esattamente APPROVO/);
  });

  it("approva con un solo supervisore quando i quattro occhi sono disattivati", () => {
    expect(nextApprovalStatus(base)).toBe(WorkStatus.APPROVED);
  });

  it("registra solo la prima approvazione quando sono richiesti quattro occhi", () => {
    expect(nextApprovalStatus({ ...base, requiresSecondApproval: true })).toBe(WorkStatus.PARTIALLY_APPROVED);
  });

  it("vieta l'auto-approvazione in modalita quattro occhi", () => {
    expect(() => nextApprovalStatus({ ...base, requiresSecondApproval: true, actorId: base.requesterId })).toThrowError(/non puo approvarla/);
  });

  it("vieta di usare due volte lo stesso approvatore", () => {
    expect(() => nextApprovalStatus({
      ...base,
      status: WorkStatus.PARTIALLY_APPROVED,
      requiresSecondApproval: true,
      priorApproverIds: [base.actorId]
    })).toThrowError(/un'altra persona/);
  });

  it("completa i quattro occhi con un secondo supervisore distinto", () => {
    expect(nextApprovalStatus({
      ...base,
      status: WorkStatus.PARTIALLY_APPROVED,
      actorId: "supervisor-2",
      requiresSecondApproval: true,
      priorApproverIds: ["supervisor-1"]
    })).toBe(WorkStatus.APPROVED);
  });

  it.each([WorkStatus.DRAFT, WorkStatus.REJECTED, WorkStatus.APPROVED, WorkStatus.FINALIZED])(
    "rifiuta approvazioni dallo stato %s",
    (status) => expect(() => nextApprovalStatus({ ...base, status })).toThrowError(/non e in attesa/)
  );
});

describe("rifiuto e finalizzazione", () => {
  it("rende obbligatoria una motivazione significativa per il rifiuto", () => {
    expect(() => assertCanReject({ ...base, reason: "no" })).toThrowError(/almeno 5 caratteri/);
  });

  it.each([Role.OPERATOR, Role.ACCOUNTANT, Role.ADMIN])("impedisce al ruolo %s di finalizzare", (role) => {
    expect(() => assertCanFinalize(WorkStatus.APPROVED, role, "FINALIZZO")).toThrowError(/Solo un responsabile/);
  });

  it.each([WorkStatus.DRAFT, WorkStatus.PENDING_APPROVAL, WorkStatus.PARTIALLY_APPROVED, WorkStatus.REJECTED])(
    "impedisce la finalizzazione senza approvazione nello stato %s",
    (status) => expect(() => assertCanFinalize(status, Role.SUPERVISOR, "FINALIZZO")).toThrowError(/approvazione valida/)
  );

  it("richiede una conferma distinta per la finalizzazione", () => {
    expect(() => assertCanFinalize(WorkStatus.APPROVED, Role.SUPERVISOR, "APPROVO")).toThrowError(/FINALIZZO/);
  });

  it("consente la finalizzazione solo dopo approvazione", () => {
    expect(() => assertCanFinalize(WorkStatus.APPROVED, Role.SUPERVISOR, "FINALIZZO")).not.toThrow();
  });
});
