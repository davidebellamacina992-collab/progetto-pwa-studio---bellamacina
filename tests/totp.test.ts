import { beforeEach, describe, expect, it } from "vitest";
import { decryptTotpSecret, encryptTotpSecret, totpAt, verifyTotp } from "@/lib/totp";

describe("TOTP", () => {
  beforeEach(() => { process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); });

  it.each([
    [59, "287082"],
    [1_111_111_109, "081804"],
    [1_111_111_111, "050471"],
    [1_234_567_890, "005924"]
  ])("calcola il vettore RFC al secondo %s", (seconds, expected) => {
    expect(totpAt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", seconds)).toBe(expected);
  });

  it("accetta una deriva massima di un intervallo", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(verifyTotp(secret, totpAt(secret, 1_000), 1_030_000)).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, 1_000), 1_090_000)).toBe(false);
  });

  it("cifra il segreto con AES-GCM e rileva alterazioni", () => {
    const encrypted = encryptTotpSecret("JBSWY3DPEHPK3PXP");
    expect(encrypted).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptTotpSecret(encrypted)).toBe("JBSWY3DPEHPK3PXP");
    const parts = encrypted.split(".");
    parts[3] = `${parts[3].startsWith("A") ? "B" : "A"}${parts[3].slice(1)}`;
    expect(() => decryptTotpSecret(parts.join("."))).toThrow();
  });
});
