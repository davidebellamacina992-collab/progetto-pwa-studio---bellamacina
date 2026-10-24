import { Role } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { OnboardingWizard, type OnboardingDraftView } from "@/components/onboarding-wizard";
import { db } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";

export default async function OnboardingPage() {
  const context = await requirePageSession();
  const profile = await db.companyOnboarding.findUnique({ where: { companyId: context.companyId } });
  const initialProfile: OnboardingDraftView = profile ? {
    countryCode: profile.countryCode,
    legalForm: profile.legalForm,
    accountingRegime: profile.accountingRegime,
    vatPeriodicity: profile.vatPeriodicity,
    managementSoftware: profile.managementSoftware,
    hasChartOfAccounts: profile.hasChartOfAccounts,
    hasOpeningBalances: profile.hasOpeningBalances,
    currentStep: profile.currentStep,
    status: profile.status,
    version: profile.version
  } : null;
  return (
    <AppShell currentPath="/onboarding">
      <OnboardingWizard
        initialProfile={initialProfile}
        canEdit={context.role === Role.OPERATOR || context.role === Role.ADMIN}
      />
    </AppShell>
  );
}
