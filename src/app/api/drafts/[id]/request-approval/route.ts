import { requireSession } from "@/lib/auth";
import { requestDraftApproval } from "@/lib/approval-service";
import { errorResponse } from "@/lib/errors";
import { assertSameOrigin, requestIp } from "@/lib/security";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin();
    const session = await requireSession();
    const { id } = await context.params;
    const approval = await requestDraftApproval(session, id, requestIp(request.headers));
    return Response.json({ id: approval.id, status: "DA_APPROVARE", message: "Bozza inviata alla revisione umana." }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
