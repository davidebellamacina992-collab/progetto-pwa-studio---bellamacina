import { OnboardingStatus, Prisma, Role, VatPeriodicity } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionContext } from "./auth";
import { assertRole } from "./auth";
import { appendAudit } from "./audit";
import { db } from "./db";

const optionalText = (max: number) => z.string().trim().max(max).nullable();

export const onboardingInputSchema = z.object({
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable(),
  legalForm: optionalText(120),
  accountingRegime: optionalText(160),
  vatPeriodicity: z.nativeEnum(VatPeriodicity).nullable(),
  managementSoftware: optionalText(160),
  hasChartOfAccounts: z.boolean().nullable(),
  hasOpeningBalances: z.boolean().nullable(),
  currentStep: z.number().int().min(1).max(5)
}).strict();

export type OnboardingInput = z.infer<typeof onboardingInputSchema>;
type ProfileFields = Omit<OnboardingInput, "currentStep">;

export function onboardingProgress(input: ProfileFields) {
  const values = [
    input.countryCode,
    input.legalForm,
    input.accountingRegime,
    input.vatPeriodicity,
    input.managementSoftware,
    input.hasChartOfAccounts,
    input.hasOpeningBalances
  ];
  const completed = values.filter((value) => value !== null && value !== "").length;
  return Math.round((completed / values.length) * 100);
}

export function onboardingStatus(input: ProfileFields) {
  return onboardingProgress(input) === 100
    ? OnboardingStatus.READY_FOR_REVIEW
    : OnboardingStatus.IN_PROGRESS;
}

function auditSnapshot(value: OnboardingInput & { status: OnboardingStatus; version: number }): Prisma.InputJsonValue {
  return { ...value };
}

export async function saveOnboardingDraft(
  context: SessionContext,
  input: OnboardingInput,
  ipAddress?: string | null
) {
  assertRole(context, [Role.OPERATOR, Role.ADMIN]);
  const status = onboardingStatus(input);
  return db.$transaction(async (tx) => {
    const previous = await tx.companyOnboarding.findUnique({ where: { companyId: context.companyId } });
    const saved = await tx.companyOnboarding.upsert({
      where: { companyId: context.companyId },
      create: { ...input, companyId: context.companyId, updatedById: context.userId, status },
      update: { ...input, updatedById: context.userId, status, version: { increment: 1 } }
    });
    await appendAudit(tx, {
      companyId: context.companyId,
      actorId: context.userId,
      eventType: previous ? "ONBOARDING_DRAFT_UPDATED" : "ONBOARDING_DRAFT_CREATED",
      entityType: "CompanyOnboarding",
      entityId: context.companyId,
      beforeValue: previous
        ? auditSnapshot({
            countryCode: previous.countryCode,
            legalForm: previous.legalForm,
            accountingRegime: previous.accountingRegime,
            vatPeriodicity: previous.vatPeriodicity,
            managementSoftware: previous.managementSoftware,
            hasChartOfAccounts: previous.hasChartOfAccounts,
            hasOpeningBalances: previous.hasOpeningBalances,
            currentStep: previous.currentStep,
            status: previous.status,
            version: previous.version
          })
        : undefined,
      afterValue: auditSnapshot({ ...input, status: saved.status, version: saved.version }),
      ipAddress,
      correlationId: randomUUID()
    });
    return saved;
  });
}
