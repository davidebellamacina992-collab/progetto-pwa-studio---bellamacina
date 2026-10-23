import { Prisma } from "@prisma/client";
import { objectHash } from "./security";

type Tx = Prisma.TransactionClient;

type AuditInput = {
  companyId: string;
  actorId?: string;
  eventType: string;
  entityType: string;
  entityId: string;
  beforeValue?: Prisma.InputJsonValue;
  afterValue?: Prisma.InputJsonValue;
  reason?: string;
  ipAddress?: string | null;
  correlationId: string;
};

export async function appendAudit(tx: Tx, input: AuditInput) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.companyId}, 0))`);
  const previous = await tx.auditLog.findFirst({
    where: { companyId: input.companyId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { entryHash: true }
  });
  const entryHash = objectHash({ ...input, previousHash: previous?.entryHash ?? null });
  return tx.auditLog.create({
    data: {
      companyId: input.companyId,
      actorId: input.actorId,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeValue: input.beforeValue,
      afterValue: input.afterValue,
      reason: input.reason,
      ipAddress: input.ipAddress,
      correlationId: input.correlationId,
      previousHash: previous?.entryHash,
      entryHash
    }
  });
}
