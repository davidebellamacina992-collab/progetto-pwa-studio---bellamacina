import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { onboardingInputSchema, onboardingProgress, saveOnboardingDraft } from "@/lib/onboarding";
import { assertSameOrigin, requestIp } from "@/lib/security";

export async function GET() {
  try {
    const context = await requireSession();
    const profile = await db.companyOnboarding.findUnique({ where: { companyId: context.companyId } });
    return Response.json({ profile, progress: profile ? onboardingProgress(profile) : 0 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await assertSameOrigin();
    const context = await requireSession();
    const input = onboardingInputSchema.parse(await request.json());
    const saved = await saveOnboardingDraft(context, input, requestIp(request.headers));
    return Response.json({ profile: saved, progress: onboardingProgress(saved) });
  } catch (error) {
    return errorResponse(error);
  }
}
