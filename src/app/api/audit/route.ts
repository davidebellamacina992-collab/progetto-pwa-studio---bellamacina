import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const context = await requireSession();
    const events = await db.auditLog.findMany({
      where: { companyId: context.companyId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
      select: { id: true, eventType: true, entityType: true, entityId: true, reason: true, correlationId: true, entryHash: true, previousHash: true, createdAt: true }
    });
    return Response.json({ items: events });
  } catch (error) {
    return errorResponse(error);
  }
}
