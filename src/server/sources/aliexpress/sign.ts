import { createHmac } from "node:crypto";

/**
 * The platform's request signature: HMAC-SHA256(secret, path + k1v1k2v2… sorted by key), upper-case
 * hex. Business calls (POST /sync with a `method`) sign without a path; system calls such as
 * /auth/token/refresh (POST /rest/<path>) put their path first, as the platform's SDK does.
 */
export function signParams(params: Record<string, string>, secret: string, path = ""): string {
  const base =
    path +
    Object.keys(params)
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join("");
  return createHmac("sha256", secret).update(base, "utf8").digest("hex").toUpperCase();
}
