import { MembershipStatus } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const context = await requireSession();
    const memberships = await db.membership.findMany({
      where: { userId: context.userId, status: MembershipStatus.ACTIVE },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { company: { name: "asc" } }
    });
    return Response.json({ currentCompanyId: context.companyId, items: memberships.map((membership) => ({ ...membership.company, role: membership.role })) });
  } catch (error) {
    return errorResponse(error);
  }
}
