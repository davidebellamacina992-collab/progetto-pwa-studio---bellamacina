import { requireSession } from "@/lib/auth";
import { requestBusinessPartnerApproval } from "@/lib/approval-service";
import { errorResponse } from "@/lib/errors";
import { assertSameOrigin, requestIp } from "@/lib/security";

export async function POST(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin();
    const context = await requireSession();
    const { id } = await routeContext.params;
    const approval = await requestBusinessPartnerApproval(context, id, requestIp(request.headers));
    return Response.json({ id: approval.id, status: approval.status }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
