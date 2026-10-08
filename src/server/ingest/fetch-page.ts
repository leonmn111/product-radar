// Fetches a public web page for ingestion, defensively:
//  - http(s) on standard ports only
//  - refuses hosts that resolve to private/loopback/link-local addresses (SSRF),
//    re-checked on every redirect hop
//  - honours robots.txt for our user agent
//  - 10s timeout, 3 MB cap, HTML only, max 5 redirects

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const USER_AGENT = "ProductRadarBot/0.1 (product evidence ingestion)";
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export class FetchPageError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_url"
      | "blocked_host"
      | "robots_disallowed"
      | "http_error"
      | "not_html"
      | "too_large"
      | "timeout"
      | "network_error",
    readonly status?: number,
  ) {
    super(message);
  }
}

export type FetchedPage = { finalUrl: string; html: string; status: number; fetchedAt: Date };

// ── Address checks ───────────────────────────────────────────────────────────

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}
const v4Ranges: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const n = ipv4ToInt(ip);
    return v4Ranges.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase();
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return (
      v6 === "::" ||
      v6 === "::1" ||
      v6.startsWith("fc") ||
      v6.startsWith("fd") ||
      /^fe[89ab]/.test(v6) || // link-local fe80::/10
      v6.startsWith("ff") // multicast
    );
  }
  return true; // not an IP at all — treat as unsafe
}

export function parsePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new FetchPageError("That isn't a valid URL.", "invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchPageError("Only http and https links are supported.", "invalid_url");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new FetchPageError("Only standard web ports are allowed.", "blocked_host");
  }
  if (url.username || url.password) {
    throw new FetchPageError("Links with embedded credentials are not allowed.", "invalid_url");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new FetchPageError("Private or local addresses are not allowed.", "blocked_host");
  }
  url.hash = "";
  return url;
}

async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => {
        throw new FetchPageError(`Couldn't find the website "${host}".`, "network_error");
      });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new FetchPageError("Private or local addresses are not allowed.", "blocked_host");
  }
}

// ── robots.txt ───────────────────────────────────────────────────────────────

/** Minimal robots.txt check: groups for our bot (or *), longest-match Allow/Disallow. */
export function robotsAllows(robotsTxt: string, path: string, agent = "productradarbot"): boolean {
  type Group = { agents: string[]; rules: { allow: boolean; path: string }[] };
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, field, value] = [m[0], m[1].toLowerCase(), m[2].trim()];
    if (field === "user-agent") {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === "allow" || field === "disallow") && current) {
      if (value) current.rules.push({ allow: field === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }

  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  const rules = applicable.flatMap((g) => g.rules);

  const matches = (pattern: string) => {
    const anchored = pattern.endsWith("$");
    const body = (anchored ? pattern.slice(0, -1) : pattern)
      .split("*")
      .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
  };

  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    if (matches(r.path) && (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))) {
      best = { allow: r.allow, len: r.path.length };
    }
  }
  return best ? best.allow : true;
}

async function assertRobotsAllow(url: URL) {
  const robotsUrl = new URL("/robots.txt", url.origin);
  try {
    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return; // no robots.txt (or unreadable) ⇒ allowed, per convention
    const text = (await res.text()).slice(0, 500_000);
    if (!robotsAllows(text, url.pathname + url.search)) {
      throw new FetchPageError("This website's robots.txt asks bots not to read this page.", "robots_disallowed");
    }
  } catch (e) {
    if (e instanceof FetchPageError) throw e;
    // robots.txt unreachable ⇒ proceed; the page fetch itself will surface real network errors.
  }
}

// ── Page fetch ───────────────────────────────────────────────────────────────

async function readCapped(res: Response): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new FetchPageError("The page is too large to analyze.", "too_large");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new FetchPageError("The page is too large to analyze.", "too_large");
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

export async function fetchPage(rawUrl: string): Promise<FetchedPage> {
  let url = parsePublicUrl(rawUrl);
  await assertRobotsAllow(url);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "Accept-Language": "en-US,en;q=0.8",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
        throw new FetchPageError("The website took too long to respond.", "timeout");
      }
      throw new FetchPageError("Couldn't connect to the website.", "network_error");
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = parsePublicUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok) {
      const hint = res.status === 403 || res.status === 429 || res.status === 503 ? " The site may be blocking automated requests." : "";
      throw new FetchPageError(`The website returned an error (HTTP ${res.status}).${hint}`, "http_error", res.status);
    }
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(type)) {
      throw new FetchPageError("That link isn't a web page (HTML).", "not_html");
    }
    return { finalUrl: url.toString(), html: await readCapped(res), status: res.status, fetchedAt: new Date() };
  }
  throw new FetchPageError("Too many redirects.", "network_error");
}
