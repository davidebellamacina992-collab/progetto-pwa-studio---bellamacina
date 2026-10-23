import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encryptionKey() {
  const encoded = process.env.MFA_ENCRYPTION_KEY;
  if (!encoded) throw new AppError("MFA_NOT_CONFIGURED", "La chiave MFA del server non e configurata.", 503);
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new AppError("MFA_NOT_CONFIGURED", "La chiave MFA del server non e valida.", 503);
  return key;
}

export function encodeBase32(input: Buffer) {
  let bits = "";
  for (const byte of input) bits += byte.toString(2).padStart(8, "0");
  let result = "";
  for (let index = 0; index < bits.length; index += 5) {
    result += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return result;
}

function decodeBase32(input: string) {
  let bits = "";
  for (const character of input.replace(/=+$/g, "").toUpperCase()) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new AppError("MFA_SECRET_INVALID", "Segreto MFA non valido.", 500);
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return encodeBase32(randomBytes(20));
}

export function encryptTotpSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptTotpSecret(payload: string) {
  const [version, ivValue, tagValue, encryptedValue] = payload.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) throw new AppError("MFA_SECRET_INVALID", "Segreto MFA non valido.", 500);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

export function totpAt(secret: string, unixSeconds: number) {
  const counter = BigInt(Math.floor(unixSeconds / 30));
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, "0");
}

export function verifyTotp(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false;
  const supplied = Buffer.from(code);
  const seconds = Math.floor(now / 1000);
  return [-30, 0, 30].some((drift) => timingSafeEqual(Buffer.from(totpAt(secret, seconds + drift)), supplied));
}

export function totpUri(secret: string, email: string) {
  const issuer = "Contabilita Assistita";
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
