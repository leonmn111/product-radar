import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  decodeSignature,
  hashApiKey,
  newApiKey,
  signInMessage,
  solanaPublicKey,
  verifySessionToken,
  verifySolanaSignature,
} from "./solanaAuth";
import { testWallet } from "./testWallet";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const SECRET = "test-secret-at-least-thirty-two-characters-long";
const ISSUER = "https://theproductradar.io";

describe("Solana addresses", () => {
  it("accepts a base58 32-byte public key and nothing else", () => {
    expect(solanaPublicKey("11111111111111111111111111111111")).toHaveLength(32); // the System Program: 32 zero bytes
    expect(solanaPublicKey(testWallet().address)).toHaveLength(32);
    for (const bad of ["0xefee98996f9da31536765b43b19a7d0fea70d3d7", "1111", "O0Il" + "1".repeat(40), ""]) expect(solanaPublicKey(bad)).toBeNull();
  });
});

describe("the sign-in message", () => {
  it("is the Sign-In With Solana layout, expiring 5 minutes after issue", () => {
    expect(signInMessage({ domain: "theproductradar.io", uri: "https://theproductradar.io", address: "ADDR", nonce: "abc123", issuedAt: NOW })).toBe(
      [
        "theproductradar.io wants you to sign in with your Solana account:",
        "ADDR",
        "",
        "Sign in to the ProductRadar agent API. Signing costs nothing and moves no funds.",
        "",
        "URI: https://theproductradar.io",
        "Version: 1",
        "Chain ID: mainnet",
        "Nonce: abc123",
        "Issued At: 2026-11-03T12:00:00.000Z",
        "Expiration Time: 2026-11-03T12:05:00.000Z",
      ].join("\n"),
    );
  });
});

describe("signatures", () => {
  const w = testWallet();
  const message = "hello";

  it("verifies the wallet's own signature, in base58 or base64", () => {
    const sig = w.sign(message);
    expect(verifySolanaSignature(w.address, message, sig)).toBe(true);
    expect(decodeSignature(bs58.encode(sig))).toEqual(sig);
    expect(decodeSignature(Buffer.from(sig).toString("base64"))).toEqual(sig);
  });

  it("refuses another message, another wallet's signature and junk", () => {
    const sig = w.sign(message);
    expect(verifySolanaSignature(w.address, "hello!", sig)).toBe(false);
    expect(verifySolanaSignature(testWallet().address, message, sig)).toBe(false);
    expect(verifySolanaSignature(w.address, message, new Uint8Array(64))).toBe(false);
    expect(decodeSignature("not a signature")).toBeNull();
    expect(decodeSignature(bs58.encode(new Uint8Array(32)))).toBeNull();
  });
});

describe("session tokens", () => {
  const { address } = testWallet();

  it("name the wallet for an hour", async () => {
    const token = await createSessionToken(address, SECRET, ISSUER, NOW);
    expect(await verifySessionToken(token, SECRET, ISSUER, new Date(NOW.getTime() + 59 * 60_000))).toBe(address);
    expect(await verifySessionToken(token, SECRET, ISSUER, new Date(NOW.getTime() + 61 * 60_000))).toBeNull();
  });

  it("are refused when signed with another secret, for another site, or altered", async () => {
    const token = await createSessionToken(address, SECRET, ISSUER, NOW);
    expect(await verifySessionToken(token, `${SECRET}x`, ISSUER, NOW)).toBeNull();
    expect(await verifySessionToken(token, SECRET, "https://example.com", NOW)).toBeNull();
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: testWallet().address, iss: ISSUER, aud: "productradar-agent-api", exp: 9e9 })).toString("base64url");
    expect(await verifySessionToken(`${h}.${forged}.${s}`, SECRET, ISSUER, NOW)).toBeNull();
  });
});

describe("API keys", () => {
  it("are random, prefixed, and stored only as their SHA-256", () => {
    const a = newApiKey();
    const b = newApiKey();
    expect(a.key).toMatch(/^pr_agent_[1-9A-HJ-NP-Za-km-z]{40,44}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.key.startsWith(a.prefix)).toBe(true);
    expect(a.prefix).toHaveLength("pr_agent_".length + 6);
  });
});
