import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/db", () => ({ db: { marker: "db" } }));
vi.mock("@/server/auth/entitlements", () => ({ getViewer: vi.fn() }));
vi.mock("@/services/library", () => ({ userLibrary: vi.fn(async (_db: unknown, userId: string) => [{ dossierId: `of-${userId}` }]) }));

const { getViewer } = await import("@/server/auth/entitlements");
const { userLibrary } = await import("@/services/library");
const { GET } = await import("./route");

describe("GET /api/user/history", () => {
  it("returns the signed-in user's library, looked up by their session's id only", async () => {
    vi.mocked(getViewer).mockResolvedValue({ id: "alice", email: "a@example.com", tier: "FREE" });
    const res = await GET();
    expect([res.status, res.headers.get("cache-control")]).toEqual([200, "private, no-store"]);
    expect(await res.json()).toEqual({ items: [{ dossierId: "of-alice" }] });
    expect(vi.mocked(userLibrary).mock.calls.at(-1)?.[1]).toBe("alice");
  });

  it("needs a session", async () => {
    vi.mocked(getViewer).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
});
