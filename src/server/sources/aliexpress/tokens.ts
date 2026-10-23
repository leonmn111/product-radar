// The Drop Shipping API acts for the owner's AliExpress account, so every call carries an OAuth
// access token. AliExpress issues it once the owner authorizes the app (/auth/token/create) and it
// lasts 30 days; the refresh token that comes with it renews the pair (/auth/token/refresh) for up to
// 60 days. The keeper starts from the pair in the environment, renews it shortly before it expires,
// and keeps the newest pair in a store so a restart or deploy doesn't fall back to an older one.
// Token values are never logged or put in an error message.

import { SourceError } from "../types";
import { signParams } from "./sign";

const AUTH_URL = "https://api-sg.aliexpress.com/rest";
const REFRESH_PATH = "/auth/token/refresh";
/** Renew this long before the access token expires. */
export const RENEW_BEFORE_MS = 3 * 24 * 60 * 60 * 1000;
/** After a failed renewal, wait this long before trying again (the current token is used meanwhile). */
const RETRY_AFTER_MS = 10 * 60 * 1000;
const MAX_CALL_MS = 15_000;

export type AliexpressTokens = {
  accessToken: string;
  refreshToken: string | null;
  accessExpiresAt: Date | null; // null = not known, so never renewed early
  refreshExpiresAt: Date | null;
};

/** Where renewed tokens are kept between restarts. */
export interface TokenStore {
  load(): Promise<AliexpressTokens | null>;
  save(tokens: AliexpressTokens): Promise<void>;
}

export interface TokenKeeper {
  /** A usable access token, renewed first when it's about to expire. */
  accessToken(): Promise<string>;
  /** AliExpress refused the token: renew it before the next call. */
  invalidate(): void;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expire_time?: number | string; // Unix ms
  refresh_token_valid_time?: number | string; // Unix ms
  code?: string;
  message?: string;
  msg?: string;
};

const at = (ms: unknown) => (ms !== undefined && ms !== null && Number.isFinite(Number(ms)) && Number(ms) > 0 ? new Date(Number(ms)) : null);

/** The tokens in an /auth/token/create or /auth/token/refresh reply, or null when it holds none. */
export function parseTokenResponse(json: TokenResponse): AliexpressTokens | null {
  if (typeof json.access_token !== "string" || !json.access_token) return null;
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === "string" && json.refresh_token ? json.refresh_token : null,
    accessExpiresAt: at(json.expire_time),
    refreshExpiresAt: at(json.refresh_token_valid_time),
  };
}

const expiry = (t: AliexpressTokens) => t.accessExpiresAt?.getTime() ?? 0;

export function createTokenKeeper({
  appKey,
  appSecret,
  seed,
  store,
  fetchImpl = fetch,
  now = () => new Date(),
}: {
  appKey: string;
  appSecret: string;
  seed: AliexpressTokens; // the pair in the environment
  store?: TokenStore;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): TokenKeeper {
  let current: AliexpressTokens | null = null;
  let loading: Promise<AliexpressTokens> | null = null;
  let renewing: Promise<AliexpressTokens> | null = null;
  let rejected = false;
  let retryAt = 0;

  // The newer of the stored pair and the environment's. The environment wins a tie, so a fresh
  // authorization set there by the owner replaces whatever was stored.
  async function load(): Promise<AliexpressTokens> {
    const stored = await store?.load().catch(() => null);
    return stored && expiry(stored) > expiry(seed) ? stored : seed;
  }

  async function renew(from: AliexpressTokens): Promise<AliexpressTokens> {
    const params: Record<string, string> = {
      app_key: appKey,
      timestamp: String(now().getTime()),
      sign_method: "sha256",
      refresh_token: from.refreshToken!,
    };
    let json: TokenResponse | null = null;
    try {
      const res = await fetchImpl(`${AUTH_URL}${REFRESH_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
        body: new URLSearchParams({ ...params, sign: signParams(params, appSecret, REFRESH_PATH) }),
        signal: AbortSignal.timeout(MAX_CALL_MS),
      });
      json = (await res.json().catch(() => null)) as TokenResponse | null;
    } catch (e) {
      throw new SourceError("aliexpress", `couldn't renew the access token (${e instanceof Error && e.name === "TimeoutError" ? "timed out" : "network error"})`);
    }
    const next = json && parseTokenResponse(json);
    if (!next) throw new SourceError("aliexpress", `couldn't renew the access token (${json?.message ?? json?.msg ?? json?.code ?? "unexpected response"})`);
    const renewed = { ...next, refreshToken: next.refreshToken ?? from.refreshToken };
    await store?.save(renewed).catch(() => {}); // still usable in this process if saving fails
    return renewed;
  }

  async function accessToken(): Promise<string> {
    current ??= await (loading ??= load());
    const t = current;
    const time = now().getTime();
    const expired = t.accessExpiresAt !== null && t.accessExpiresAt.getTime() <= time;
    const dueSoon = t.accessExpiresAt !== null && t.accessExpiresAt.getTime() - time < RENEW_BEFORE_MS;
    if (!rejected && !dueSoon) return t.accessToken;

    const canRenew = t.refreshToken !== null && (t.refreshExpiresAt === null || t.refreshExpiresAt.getTime() > time) && time >= retryAt;
    if (canRenew) {
      try {
        current = await (renewing ??= renew(t).finally(() => (renewing = null)));
        rejected = false;
        return current.accessToken;
      } catch (e) {
        retryAt = time + RETRY_AFTER_MS;
        if (rejected || expired) throw e;
        return t.accessToken; // due soon but still valid: use it, and try renewing again later
      }
    }
    if (!rejected && !expired) return t.accessToken;
    throw new SourceError(
      "aliexpress",
      "the access token has expired or was refused and can't be renewed: the owner needs to authorize the app again (ALIEXPRESS_ACCESS_TOKEN)",
    );
  }

  return {
    accessToken,
    invalidate: () => {
      rejected = true;
    },
  };
}
