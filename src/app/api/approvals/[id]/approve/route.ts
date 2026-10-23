import { z } from "zod";
import { assertApprovalMfa, requireSession } from "@/lib/auth";
import { approveRequest } from "@/lib/approval-service";
import { errorResponse } from "@/lib/errors";
import { assertSameOrigin, requestIp } from "@/lib/security";
import { enforceRateLimit } from "@/lib/rate-limit";

const schema = z.object({ confirmation: z.string().max(30).default("") });

export async function POST(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin();
    const context = await requireSession();
    assertApprovalMfa(context);
    enforceRateLimit(`approval:${context.userId}`, 30, 60_000);
    const { id } = await routeContext.params;
    const { confirmation } = schema.parse(await request.json());
    const result = await approveRequest(context, id, confirmation, requestIp(request.headers));
    return Response.json({ ...result, message: result.status === "PARTIALLY_APPROVED" ? "Prima approvazione registrata. Serve un secondo responsabile." : "Approvazione completata." });
  } catch (error) {
    return errorResponse(error);
  }
}
