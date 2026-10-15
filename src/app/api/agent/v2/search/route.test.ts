import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/server/live/config", () => ({ liveSources: vi.fn() }));
// The payment wrapper is replaced: these tests are about what happens before and around payment.
const x402 = vi.hoisted(() => ({ meta: undefined as unknown, paid: undefined as unknown as ReturnType<typeof vi.fn> }));
vi.mock("@/server/payments/x402/middleware", () => ({
  withX402Payment: (meta: unknown) => {
    x402.meta = meta;
    x402.paid = vi.fn(async () => Response.json({ paid: true }));
    return x402.paid;
  },
}));

const { liveSources } = await import("@/server/live/config");
const { GET } = await import("./route");
const paid = () => x402.paid;

const call = (query: string) => GET(new NextRequest(`http://localhost:3457/api/agent/v2/search${query}`));

describe("GET /api/agent/v2/search", () => {
  beforeEach(() => paid().mockClear());

  it("charges $0.50 USDC per search", () => {
    expect(x402.meta).toMatchObject({ priceUsdc: "0.50" });
  });

  it("says live search isn't on yet, before asking for any payment", async () => {
    vi.mocked(liveSources).mockReturnValue({ ready: false, missing: ["supplier source: no AliExpress provider is connected yet"] });
    const res = await call("?q=power+bank");
    expect(res.status).toBe(503);
    expect((await res.json()).missing).toEqual(["supplier source: no AliExpress provider is connected yet"]);
    expect(paid()).not.toHaveBeenCalled();
  });

  it("rejects a bad query before payment", async () => {
    for (const q of ["", "?q=x", "?q=power+bank&markets=FR"]) {
      expect((await call(q)).status).toBe(400);
    }
    expect(paid()).not.toHaveBeenCalled();
  });

  it("hands a valid query to the paid search once live search is ready", async () => {
    vi.mocked(liveSources).mockReturnValue({ ready: true, sample: false, sources: {} as never });
    const res = await call("?q=power+bank&markets=gb");
    expect(await res.json()).toEqual({ paid: true });
    expect(paid()).toHaveBeenCalledTimes(1);
  });
});
