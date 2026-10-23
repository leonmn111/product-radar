import { describe, expect, it, vi } from "vitest";
import { SourceError } from "../types";
import { signParams } from "./sign";
import { type AliexpressTokens, createTokenKeeper, parseTokenResponse, RENEW_BEFORE_MS, type TokenStore } from "./tokens";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-10-23T12:00:00.000Z").getTime();
const pair = (name: string, accessDays: number, refreshDays = accessDays + 30): AliexpressTokens => ({
  accessToken: `access-${name}`,
  refreshToken: `refresh-${name}`,
  accessExpiresAt: new Date(T0 + accessDays * DAY),
  refreshExpiresAt: new Date(T0 + refreshDays * DAY),
});
const renewedReply = (name: string, accessDays = 30, refreshDays = 60) => ({
  access_token: `access-${name}`,
  refresh_token: `refresh-${name}`,
  expire_time: T0 + accessDays * DAY,
  refresh_token_valid_time: T0 + refreshDays * DAY,
  expires_in: accessDays * 86400,
  code: "0",
});
const memoryStore = (initial: AliexpressTokens | null = null) => {
  let saved = initial;
  return { load: vi.fn(async () => saved), save: vi.fn(async (t: AliexpressTokens) => void (saved = t)) } satisfies TokenStore;
};
const keeper = (opts: { seed: AliexpressTokens; store?: TokenStore; fetchImpl?: unknown; now?: number }) => {
  let time = opts.now ?? T0;
  const k = createTokenKeeper({
    appKey: "555220",
    appSecret: "s",
    seed: opts.seed,
    store: opts.store,
    fetchImpl: (opts.fetchImpl ?? vi.fn()) as typeof fetch,
    now: () => new Date(time),
  });
  return Object.assign(k, { advance: (ms: number) => void (time += ms) });
};

describe("parseTokenResponse", () => {
  it("reads the tokens and their expiry times, and nothing from an error", () => {
    expect(parseTokenResponse(renewedReply("x"))).toEqual({
      accessToken: "access-x",
      refreshToken: "refresh-x",
      accessExpiresAt: new Date(T0 + 30 * DAY),
      refreshExpiresAt: new Date(T0 + 60 * DAY),
    });
    expect(parseTokenResponse({ code: "InvalidCode", message: "Invalid authorization code" })).toBeNull();
  });
});

describe("createTokenKeeper", () => {
  it("uses the environment's token while it has more than three days left, without calling AliExpress", async () => {
    const fetchImpl = vi.fn();
    const k = keeper({ seed: pair("env", 10), fetchImpl });
    expect(await k.accessToken()).toBe("access-env");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("renews a token that's about to expire, signing /auth/token/refresh, and keeps the new pair", async () => {
    const fetchImpl = vi.fn(async () => Response.json(renewedReply("new")));
    const store = memoryStore();
    const k = keeper({ seed: pair("env", 2), store, fetchImpl });
    expect(await k.accessToken()).toBe("access-new");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-sg.aliexpress.com/rest/auth/token/refresh");
    const { sign, ...params } = Object.fromEntries(new URLSearchParams(String(init.body)));
    expect(params).toMatchObject({ app_key: "555220", refresh_token: "refresh-env", sign_method: "sha256" });
    expect(sign).toBe(signParams(params, "s", "/auth/token/refresh"));
    expect(store.save).toHaveBeenCalledWith(parseTokenResponse(renewedReply("new")));
    // Renewed once: the new token has 30 days left.
    expect(await k.accessToken()).toBe("access-new");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("starts from the stored pair when it's newer than the environment's, and from the environment's otherwise", async () => {
    expect(await keeper({ seed: pair("env", 10), store: memoryStore(pair("stored", 25)) }).accessToken()).toBe("access-stored");
    expect(await keeper({ seed: pair("env", 30), store: memoryStore(pair("stored", 25)) }).accessToken()).toBe("access-env");
    const broken = { load: vi.fn(async () => Promise.reject(new Error("db down"))), save: vi.fn() };
    expect(await keeper({ seed: pair("env", 10), store: broken }).accessToken()).toBe("access-env");
  });

  it("renews a refused token before the next call", async () => {
    const fetchImpl = vi.fn(async () => Response.json(renewedReply("new")));
    const k = keeper({ seed: pair("env", 20), fetchImpl });
    expect(await k.accessToken()).toBe("access-env");
    k.invalidate();
    expect(await k.accessToken()).toBe("access-new");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("keeps using a token that's due soon when renewal fails, and tries again ten minutes later", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ code: "InvalidRefreshToken", message: "refresh token is invalid" }));
    const k = keeper({ seed: pair("env", 2), fetchImpl });
    expect(await k.accessToken()).toBe("access-env");
    expect(await k.accessToken()).toBe("access-env");
    expect(fetchImpl).toHaveBeenCalledOnce();
    k.advance(10 * 60 * 1000);
    await k.accessToken();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("refuses an expired token that can't be renewed, without putting any token in the message", async () => {
    const failing = vi.fn(async () => Response.json({ code: "InvalidRefreshToken", message: "refresh token is invalid" }));
    const expired = keeper({ seed: pair("env", -1), fetchImpl: failing });
    const error = await expired.accessToken().catch((e) => e);
    expect(error).toEqual(new SourceError("aliexpress", "couldn't renew the access token (refresh token is invalid)"));

    const noRefresh = keeper({ seed: { ...pair("env", -1, -1) } });
    const e2 = await noRefresh.accessToken().catch((e) => e);
    expect(e2).toBeInstanceOf(SourceError);
    expect(e2.message).toMatch(/authorize the app again/);
    for (const e of [error, e2]) expect(e.message).not.toMatch(/access-env|refresh-env/);
  });

  it("shares one renewal between calls made at the same time", async () => {
    let release!: () => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((r) => (release = () => r(Response.json(renewedReply("new"))))));
    const k = keeper({ seed: pair("env", 1), fetchImpl });
    const both = Promise.all([k.accessToken(), k.accessToken()]);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    release();
    expect(await both).toEqual(["access-new", "access-new"]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("never renews early when the expiry time isn't known", async () => {
    const fetchImpl = vi.fn();
    const k = keeper({ seed: { accessToken: "a", refreshToken: "r", accessExpiresAt: null, refreshExpiresAt: null }, fetchImpl });
    expect(await k.accessToken()).toBe("a");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(RENEW_BEFORE_MS).toBe(3 * DAY);
  });
});
