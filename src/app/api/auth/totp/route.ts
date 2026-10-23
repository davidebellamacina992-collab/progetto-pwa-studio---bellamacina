import { z } from "zod";
import { Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { markCurrentSessionMfaVerified, requireSession } from "@/lib/auth";
import { AppError, errorResponse } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";
import { decryptTotpSecret, encryptTotpSecret, generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";

const verifySchema = z.object({ action: z.literal("verify"), code: z.string().regex(/^\d{6}$/) }).strict();
const disableSchema = z.object({ action: z.literal("disable"), code: z.string().regex(/^\d{6}$/) }).strict();
const actionSchema = z.discriminatedUnion("action", [verifySchema, disableSchema]);

export async function GET() {
  try {
    const context = await requireSession();
    return Response.json({
      enabled: context.totpEnabled,
      verifiedInCurrentSession: Boolean(context.mfaVerifiedAt),
      requiredForApprovals: context.role === Role.SUPERVISOR && context.approverTotpRequired
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const context = await requireSession();
    const raw = await request.json();
    if (raw?.action === "setup") {
      if (context.totpEnabled) throw new AppError("MFA_ALREADY_ENABLED", "L'autenticazione a due fattori e gia attiva.", 409);
      const secret = generateTotpSecret();
      await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: context.userId }, data: { totpSecretEncrypted: encryptTotpSecret(secret), totpEnabled: false } });
        await appendAudit(tx, { companyId: context.companyId, actorId: context.userId, eventType: "MFA_SETUP_STARTED", entityType: "User", entityId: context.userId, afterValue: { totpEnabled: false }, correlationId: randomUUID() });
      });
      return Response.json({ secret, uri: totpUri(secret, context.email), message: "Segreto creato. Verifica un codice prima di chiudere questa pagina." });
    }
    const body = actionSchema.parse(raw);
    const user = await db.user.findUnique({ where: { id: context.userId }, include: { memberships: { include: { company: true } } } });
    if (!user?.totpSecretEncrypted) throw new AppError("MFA_SETUP_REQUIRED", "Avvia prima la configurazione MFA.", 409);
    if (!verifyTotp(decryptTotpSecret(user.totpSecretEncrypted), body.code)) {
      throw new AppError("MFA_INVALID", "Il codice non e valido o e scaduto.", 422);
    }
    if (body.action === "disable") {
      const mandatory = user.memberships.some((membership) =>
        membership.status === "ACTIVE" && membership.role === Role.SUPERVISOR && membership.company.approverTotpRequired
      );
      if (mandatory) throw new AppError("MFA_MANDATORY", "La MFA e obbligatoria per almeno un ruolo di approvazione attivo.", 409);
      await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecretEncrypted: null } });
        await appendAudit(tx, { companyId: context.companyId, actorId: context.userId, eventType: "MFA_DISABLED", entityType: "User", entityId: context.userId, beforeValue: { totpEnabled: true }, afterValue: { totpEnabled: false }, correlationId: randomUUID() });
      });
      return Response.json({ enabled: false, message: "Autenticazione a due fattori disattivata." });
    }
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
      await appendAudit(tx, { companyId: context.companyId, actorId: context.userId, eventType: "MFA_ENABLED", entityType: "User", entityId: context.userId, beforeValue: { totpEnabled: false }, afterValue: { totpEnabled: true }, correlationId: randomUUID() });
    });
    await markCurrentSessionMfaVerified();
    return Response.json({ enabled: true, message: "Autenticazione a due fattori attivata e verificata." });
  } catch (error) {
    return errorResponse(error);
  }
}
