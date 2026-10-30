import { describe, expect, it } from "vitest";
import { signUnlock, UNLOCK_TTL_MS, verifyUnlock } from "./quickToken";

const SECRET = "a-test-secret-that-is-at-least-32-chars";
const NOW = new Date("2026-10-30T12:00:00.000Z");
const claims = { asin: "B0MUG00001", link: "aliexpress" as const, name: "Desktop Phone Stand", brand: null, supplier: { amount: 3.08, source: "aliexpress_link" as const, evidence: null } };

describe("unlock token", () => {
  it("round-trips the check it was signed for", () => {
    expect(verifyUnlock(signUnlock(claims, SECRET, NOW), SECRET, NOW)).toEqual({ ...claims, exp: NOW.getTime() + UNLOCK_TTL_MS });
  });

  it("refuses an edited, re-keyed, malformed or expired token", () => {
    const token = signUnlock(claims, SECRET, NOW);
    const [body, mac] = token.split(".");
    const cheaper = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), supplier: { amount: 0.01 } })).toString("base64url");
    expect(verifyUnlock(`${cheaper}.${mac}`, SECRET, NOW)).toBeNull();
    expect(verifyUnlock(token, "another-secret-that-is-at-least-32-chars", NOW)).toBeNull();
    expect(verifyUnlock("not-a-token", SECRET, NOW)).toBeNull();
    expect(verifyUnlock(`${token}.x`, SECRET, NOW)).toBeNull();
    expect(verifyUnlock(token, SECRET, new Date(NOW.getTime() + UNLOCK_TTL_MS + 1))).toBeNull();
  });
});
