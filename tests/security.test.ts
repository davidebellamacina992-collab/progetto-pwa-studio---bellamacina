import { describe, expect, it } from "vitest";
import { objectHash, stableJson } from "@/lib/security";

describe("integrita snapshot e audit", () => {
  it("produce lo stesso hash indipendentemente dall'ordine delle chiavi", () => {
    expect(objectHash({ b: 2, a: 1 })).toBe(objectHash({ a: 1, b: 2 }));
  });

  it("rileva ogni modifica allo snapshot approvato", () => {
    expect(objectHash({ version: 1, amount: "100" })).not.toBe(objectHash({ version: 1, amount: "101" }));
  });

  it("serializza BigInt senza conversioni float", () => {
    expect(stableJson({ cents: 9007199254740993n })).toContain("9007199254740993");
  });
});
