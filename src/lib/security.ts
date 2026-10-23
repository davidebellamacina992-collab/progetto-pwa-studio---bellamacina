import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { AppError } from "./errors";

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function objectHash(value: unknown) {
  return sha256(stableJson(value));
}

export async function assertSameOrigin() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("host");
  if (!origin || !host) throw new AppError("CSRF_INVALID", "Richiesta non valida.", 403);
  const parsed = new URL(origin);
  if (parsed.host !== host) throw new AppError("CSRF_INVALID", "Origine della richiesta non consentita.", 403);
}

export function requestIp(requestHeaders: Headers) {
  if (process.env.TRUSTED_PROXY === "true") {
    return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ?? null;
  }
  return null;
}
