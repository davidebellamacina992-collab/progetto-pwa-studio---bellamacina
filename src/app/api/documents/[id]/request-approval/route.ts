import { requestAccountingDocumentApproval } from "@/lib/approval-service";
import { requireSession } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { assertSameOrigin, requestIp } from "@/lib/security";

export async function POST(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin();
    const context = await requireSession();
    const { id } = await routeContext.params;
    const approval = await requestAccountingDocumentApproval(context, id, requestIp(request.headers));
    return Response.json({ approval }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
