import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/env", () => ({ env: {} }));
const { openTokens, sealTokens } = await import("./providerTokenStore");

const SECRET = "a-test-auth-secret-that-is-long-enough-123";
const tokens = { accessToken: "50000000aaaaaaaaaaaa", refreshToken: "50001000bbbbbbbbbbbb" };

describe("sealed provider tokens", () => {
  it("round-trips, and never stores the tokens readably", () => {
    const sealed = sealTokens(tokens, SECRET);
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain(tokens.accessToken);
    expect(sealed).not.toContain(Buffer.from(tokens.accessToken).toString("base64url"));
    expect(openTokens(sealed, SECRET)).toEqual(tokens);
    expect(sealTokens(tokens, SECRET)).not.toBe(sealed); // a fresh IV every time
  });

  it("reads nothing back under another key, or after any change", () => {
    const sealed = sealTokens(tokens, SECRET);
    expect(openTokens(sealed, `${SECRET}-rotated`)).toBeNull();
    const flipped = sealed.slice(0, -2) + (sealed.at(-2) === "A" ? "B" : "A") + sealed.at(-1);
    expect(openTokens(flipped, SECRET)).toBeNull();
    expect(openTokens("v2.abc", SECRET)).toBeNull();
    expect(openTokens("garbage", SECRET)).toBeNull();
  });

  it("keeps a missing refresh token as null", () => {
    expect(openTokens(sealTokens({ accessToken: "a", refreshToken: null }, SECRET), SECRET)).toEqual({ accessToken: "a", refreshToken: null });
  });
});
