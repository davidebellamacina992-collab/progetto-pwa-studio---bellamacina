import { requireSession } from "@/lib/auth";
import { createBusinessPartner } from "@/lib/business-partner";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { assertSameOrigin, requestIp } from "@/lib/security";

export async function GET() {
  try {
    const context = await requireSession();
    const items = await db.businessPartner.findMany({
      where: { companyId: context.companyId },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { approvals: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } } }
    });
    return Response.json({
      items: items.map((item) => ({ ...item, approvalId: item.approvals[0]?.id ?? null, approvals: undefined }))
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const context = await requireSession();
    const input = await request.json();
    const item = await createBusinessPartner(context, input, requestIp(request.headers));
    return Response.json({ id: item.id, status: item.status }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
