import { describe, expect, it, vi } from "vitest";
import { getAccountProfile } from "./account";

describe("getAccountProfile", () => {
  it("says whether a password is set, never what it is", async () => {
    const row = { email: "me@example.com", createdAt: new Date("2026-10-01"), emailVerified: new Date("2026-10-02"), passwordHash: "$2b$10$secret" };
    const db = { user: { findUnique: vi.fn(async () => row) } } as never;
    const profile = await getAccountProfile(db, "u1");
    expect(profile).toEqual({ email: "me@example.com", memberSince: row.createdAt, emailVerified: true, hasPassword: true });
    expect(JSON.stringify(profile)).not.toContain("secret");
  });

  it("returns null for an account that no longer exists", async () => {
    expect(await getAccountProfile({ user: { findUnique: vi.fn(async () => null) } } as never, "gone")).toBeNull();
  });
});
