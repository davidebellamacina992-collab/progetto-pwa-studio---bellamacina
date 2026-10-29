import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { createChartSelectionDraft } from "@/lib/chart-selection";
import { errorResponse } from "@/lib/errors";
import { assertSameOrigin, requestIp } from "@/lib/security";

const inputSchema = z.object({ chartImportId: z.string().uuid() }).strict();

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const context = await requireSession();
    const input = inputSchema.parse(await request.json());
    const selection = await createChartSelectionDraft(context, input.chartImportId, requestIp(request.headers));
    return Response.json({ selection }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
