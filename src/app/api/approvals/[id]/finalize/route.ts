import { z } from "zod";
import { assertApprovalMfa, requireSession } from "@/lib/auth";
import { finalizeRequest } from "@/lib/approval-service";
import { errorResponse } from "@/lib/errors";
import { assertSameOrigin, requestIp } from "@/lib/security";
import { enforceRateLimit } from "@/lib/rate-limit";

const schema = z.object({ confirmation: z.string().max(30) });

export async function POST(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin();
    const context = await requireSession();
    assertApprovalMfa(context);
    enforceRateLimit(`approval:${context.userId}`, 30, 60_000);
    const { id } = await routeContext.params;
    const { confirmation } = schema.parse(await request.json());
    const result = await finalizeRequest(context, id, confirmation, requestIp(request.headers));
    return Response.json({ ...result, message: "Registrazione finalizzata e resa immutabile." });
  } catch (error) {
    return errorResponse(error);
  }
}
