import { z } from "zod";
import { assertApprovalMfa, requireSession } from "@/lib/auth";
import { rejectRequest } from "@/lib/approval-service";
import { errorResponse } from "@/lib/errors";
import { assertSameOrigin, requestIp } from "@/lib/security";
import { enforceRateLimit } from "@/lib/rate-limit";

const schema = z.object({ reason: z.string().trim().min(5).max(1000) });

export async function POST(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin();
    const context = await requireSession();
    assertApprovalMfa(context);
    enforceRateLimit(`approval:${context.userId}`, 30, 60_000);
    const { id } = await routeContext.params;
    const { reason } = schema.parse(await request.json());
    const result = await rejectRequest(context, id, reason, requestIp(request.headers));
    return Response.json({ ...result, message: "Richiesta respinta con motivazione registrata." });
  } catch (error) {
    return errorResponse(error);
  }
}
