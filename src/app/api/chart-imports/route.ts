import { createChartImportDraft, MAX_CHART_FILE_BYTES } from "@/lib/chart-import";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, errorResponse } from "@/lib/errors";
import { assertSameOrigin, requestIp } from "@/lib/security";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = await requireSession();
    const imports = await db.chartImport.findMany({
      where: { companyId: context.companyId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { lines: { orderBy: { position: "asc" }, take: 100 } }
    });
    return Response.json({ imports });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_CHART_FILE_BYTES + 64 * 1024) {
      throw new AppError("INVALID_FILE_SIZE", "La richiesta supera il limite consentito.", 413);
    }
    const context = await requireSession();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AppError("FILE_REQUIRED", "Seleziona un file CSV.", 422);
    const chartImport = await createChartImportDraft(context, file, requestIp(request.headers));
    return Response.json({ chartImport }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
