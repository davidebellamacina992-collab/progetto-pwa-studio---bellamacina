import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { errorResponse, AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, requestIp } from "@/lib/security";
import { decryptTotpSecret, verifyTotp } from "@/lib/totp";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(200),
  totpCode: z.string().regex(/^\d{6}$/).optional()
});

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const ip = requestIp(request.headers) ?? "direct";
    enforceRateLimit(`login:${ip}`, 8, 15 * 60 * 1000);
    const body = bodySchema.parse(await request.json());
    const user = await db.user.findUnique({ where: { email: body.email } });
    const valid = user?.active ? await verifyPassword(user.passwordHash, body.password) : false;
    if (!user || !valid) throw new AppError("INVALID_CREDENTIALS", "Email o password non corretti.", 401);
    let mfaVerified = false;
    if (user.totpEnabled) {
      if (!body.totpCode) throw new AppError("MFA_REQUIRED", "Inserisci il codice a 6 cifre dell'app di autenticazione.", 401);
      if (!user.totpSecretEncrypted || !verifyTotp(decryptTotpSecret(user.totpSecretEncrypted), body.totpCode)) {
        throw new AppError("MFA_INVALID", "Il codice di autenticazione non e valido o e scaduto.", 401);
      }
      mfaVerified = true;
    }
    await createSession(user.id, mfaVerified);
    return Response.json({ message: "Accesso eseguito." });
  } catch (error) {
    return errorResponse(error);
  }
}
