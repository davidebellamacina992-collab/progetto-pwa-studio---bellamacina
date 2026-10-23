import { Role } from "@prisma/client";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireSession, assertRole } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { assertSameOrigin, requestIp } from "@/lib/security";

const bodySchema = z.object({
  description: z.string().trim().min(3).max(300),
  lines: z.array(z.object({
    accountCode: z.string().trim().min(1).max(30),
    description: z.string().trim().min(1).max(300),
    debitCents: z.string().regex(/^\d+$/).default("0"),
    creditCents: z.string().regex(/^\d+$/).default("0")
  })).min(2).max(500)
});

export async function GET() {
  try {
    const context = await requireSession();
    const drafts = await db.accountingDraft.findMany({
      where: { companyId: context.companyId },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, description: true, status: true, version: true, updatedAt: true }
    });
    return Response.json({ items: drafts });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const context = await requireSession();
    assertRole(context, [Role.OPERATOR, Role.SUPERVISOR]);
    const body = bodySchema.parse(await request.json());
    const draft = await db.$transaction(async (tx) => {
      const created = await tx.accountingDraft.create({
        data: {
          companyId: context.companyId,
          createdById: context.userId,
          description: body.description,
          lines: {
            create: body.lines.map((line) => ({
              accountCode: line.accountCode,
              description: line.description,
              debitCents: BigInt(line.debitCents),
              creditCents: BigInt(line.creditCents)
            }))
          }
        }
      });
      await appendAudit(tx, {
        companyId: context.companyId, actorId: context.userId, eventType: "DRAFT_CREATED",
        entityType: "AccountingDraft", entityId: created.id,
        afterValue: { status: "DRAFT", version: 1 }, ipAddress: requestIp(request.headers), correlationId: randomUUID()
      });
      return created;
    });
    return Response.json({ id: draft.id, status: draft.status }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
