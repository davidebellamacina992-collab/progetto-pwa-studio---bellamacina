import { MembershipStatus } from "@prisma/client";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError, errorResponse } from "@/lib/errors";
import { assertSameOrigin, requestIp } from "@/lib/security";

const schema = z.object({ companyId: z.string().uuid() }).strict();

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const current = await requireSession();
    const { companyId } = schema.parse(await request.json());
    const membership = await db.membership.findUnique({
      where: { userId_companyId: { userId: current.userId, companyId } },
      include: { company: { select: { name: true } } }
    });
    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new AppError("NO_COMPANY_ACCESS", "Non hai accesso all'azienda richiesta.", 403);
    }
    await db.$transaction(async (tx) => {
      await appendAudit(tx, {
        companyId,
        actorId: current.userId,
        eventType: "COMPANY_SELECTED",
        entityType: "Company",
        entityId: companyId,
        beforeValue: { companyId: current.companyId },
        afterValue: { companyId },
        ipAddress: requestIp(request.headers),
        correlationId: randomUUID()
      });
    });
    const cookieStore = await cookies();
    cookieStore.set("contabilita_company", companyId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/"
    });
    return Response.json({ companyId, name: membership.company.name, message: "Azienda selezionata." });
  } catch (error) {
    return errorResponse(error);
  }
}
