import argon2 from "argon2";
import { cookies, headers } from "next/headers";
import { MembershipStatus, Role } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./errors";
import { newSessionToken, requestIp, sha256 } from "./security";

const cookieName = process.env.NODE_ENV === "production" ? "__Host-contabilita_session" : "contabilita_session";

export type SessionContext = {
  userId: string;
  companyId: string;
  role: Role;
  email: string;
  displayName: string;
  totpEnabled: boolean;
  mfaVerifiedAt: Date | null;
  approverTotpRequired: boolean;
};

export async function createSession(userId: string, mfaVerified = false) {
  const token = newSessionToken();
  const requestHeaders = await headers();
  const ttlHours = Number(process.env.SESSION_TTL_HOURS ?? 12);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      expiresAt,
      mfaVerifiedAt: mfaVerified ? new Date() : null,
      ipAddress: requestIp(requestHeaders),
      userAgent: requestHeaders.get("user-agent")?.slice(0, 300)
    }
  });
  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt
  });
}

export async function revokeSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (token) await db.session.updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } });
  cookieStore.delete(cookieName);
}

export async function requireSession(companyIdOverride?: string): Promise<SessionContext> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) throw new AppError("UNAUTHENTICATED", "Accedi per continuare.", 401);
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { memberships: { include: { company: true } } } } }
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.active) {
    throw new AppError("UNAUTHENTICATED", "La sessione e scaduta. Accedi di nuovo.", 401);
  }
  const selectedCompanyId = companyIdOverride ?? cookieStore.get("contabilita_company")?.value;
  const membership = session.user.memberships.find(
    (item) => item.companyId === selectedCompanyId && item.status === MembershipStatus.ACTIVE
  ) ?? session.user.memberships.find((item) => item.status === MembershipStatus.ACTIVE);
  if (!membership) throw new AppError("NO_COMPANY_ACCESS", "Non hai accesso ad alcuna azienda attiva.", 403);
  return {
    userId: session.user.id,
    companyId: membership.companyId,
    role: membership.role,
    email: session.user.email,
    displayName: session.user.displayName,
    totpEnabled: session.user.totpEnabled,
    mfaVerifiedAt: session.mfaVerifiedAt,
    approverTotpRequired: membership.company.approverTotpRequired
  };
}

export function assertApprovalMfa(context: SessionContext) {
  if (!context.approverTotpRequired) return;
  if (!context.totpEnabled || !context.mfaVerifiedAt) {
    throw new AppError("MFA_REQUIRED", "Configura e verifica l'autenticazione a due fattori prima di approvare.", 403);
  }
}

export async function markCurrentSessionMfaVerified() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) throw new AppError("UNAUTHENTICATED", "Accedi per continuare.", 401);
  await db.session.updateMany({
    where: { tokenHash: sha256(token), revokedAt: null, expiresAt: { gt: new Date() } },
    data: { mfaVerifiedAt: new Date() }
  });
}

export function assertRole(context: SessionContext, allowed: Role[]) {
  if (!allowed.includes(context.role)) {
    throw new AppError("FORBIDDEN", "Il tuo ruolo non consente questa azione.", 403);
  }
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}
