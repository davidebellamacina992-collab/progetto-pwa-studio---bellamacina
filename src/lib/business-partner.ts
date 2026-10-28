import { PartnerKind, Prisma, Role, WorkStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionContext } from "./auth";
import { assertRole } from "./auth";
import { appendAudit } from "./audit";
import { db } from "./db";
import { AppError } from "./errors";

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional()
  .transform((value) => value || null);

export const businessPartnerSchema = z.object({
  kind: z.enum(PartnerKind),
  displayName: z.string().trim().min(2).max(200),
  taxCode: optionalText(16).transform((value) => value?.toUpperCase() ?? null)
    .refine((value) => !value || /^[A-Z0-9]{11,16}$/.test(value), "Codice fiscale non valido."),
  vatNumber: optionalText(20).transform((value) => value?.toUpperCase() ?? null)
    .refine((value) => !value || /^[A-Z0-9]{5,20}$/.test(value), "Partita IVA non valida."),
  email: z.union([z.literal(""), z.email().max(254)]).optional().transform((value) => value || null),
  phone: optionalText(40),
  address: optionalText(300),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default("IT")
}).refine((value) => value.taxCode || value.vatNumber, {
  message: "Indica almeno il codice fiscale o la partita IVA.",
  path: ["taxCode"]
});

export async function createBusinessPartner(
  context: SessionContext,
  input: unknown,
  ipAddress?: string | null
) {
  assertRole(context, [Role.OPERATOR, Role.ADMIN]);
  const data = businessPartnerSchema.parse(input);
  try {
    return await db.$transaction(async (tx) => {
    const duplicate = await tx.businessPartner.findFirst({
      where: {
        companyId: context.companyId,
        OR: [
          ...(data.taxCode ? [{ taxCode: data.taxCode }] : []),
          ...(data.vatNumber ? [{ vatNumber: data.vatNumber }] : [])
        ]
      },
      select: { id: true }
    });
    if (duplicate) throw new AppError("DUPLICATE_PARTNER", "Esiste gia un'anagrafica con lo stesso identificativo.", 409);
    const partner = await tx.businessPartner.create({
      data: {
        companyId: context.companyId,
        createdById: context.userId,
        kind: data.kind,
        displayName: data.displayName,
        taxCode: data.taxCode,
        vatNumber: data.vatNumber,
        email: data.email,
        phone: data.phone,
        address: data.address,
        countryCode: data.countryCode
      }
    });
    await appendAudit(tx, {
      companyId: context.companyId,
      actorId: context.userId,
      eventType: "BUSINESS_PARTNER_DRAFT_CREATED",
      entityType: "BusinessPartner",
      entityId: partner.id,
      afterValue: { status: WorkStatus.DRAFT, version: partner.version, kind: partner.kind },
      ipAddress,
      correlationId: randomUUID()
    });
    return partner;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("DUPLICATE_PARTNER", "Esiste gia un'anagrafica con lo stesso identificativo.", 409);
    }
    throw error;
  }
}
