import { requireSession } from "@/lib/auth";
import { AppError, errorResponse } from "@/lib/errors";
import { createOpeningBalanceDraft, MAX_OPENING_BALANCE_BYTES } from "@/lib/opening-balances";
import { assertSameOrigin, requestIp } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    if (Number(request.headers.get("content-length") ?? 0) > MAX_OPENING_BALANCE_BYTES + 64 * 1024) {
      throw new AppError("INVALID_FILE_SIZE", "La richiesta supera il limite consentito.", 413);
    }
    const context = await requireSession();
    const formData = await request.formData();
    const file = formData.get("file");
    const chartImportId = formData.get("chartImportId");
    if (!(file instanceof File)) throw new AppError("FILE_REQUIRED", "Seleziona un file CSV.", 422);
    if (typeof chartImportId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(chartImportId)) {
      throw new AppError("CHART_REQUIRED", "Seleziona il piano dei conti.", 422);
    }
    const draft = await createOpeningBalanceDraft(context, chartImportId, file, requestIp(request.headers));
    return Response.json({ id: draft.id, status: draft.status }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
