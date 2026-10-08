// Mock AI agent that buys data from ProductRadar over x402 (v2, "exact" EVM scheme).
// Behaves like an external client: it imports nothing from the server and
// learns price, asset and recipient from the 402 challenge.
//
// Uses a freshly generated throwaway wallet each run — it signs real EIP-3009
// USDC authorizations, but the server's mock facilitator never moves funds.
//
// Usage:  npm run agent:test                      (http://localhost:3000)
//         npm run agent:test -- http://localhost:3457
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { toHex } from "viem";

const BASE = (process.argv[2] ?? process.env.AGENT_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const ENDPOINT = `${BASE}/api/agent/v1/opportunity`;

type Requirements = {
  scheme: string;
  network: string;
  asset: `0x${string}`;
  amount: string;
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
};
type PaymentRequired = { x402Version: number; error?: string; resource: { url: string }; accepts: Requirements[] };

const wallet = privateKeyToAccount(generatePrivateKey());
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64");
const unb64 = <T>(s: string) => JSON.parse(Buffer.from(s, "base64").toString("utf8")) as T;

let failures = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`  ${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
};

async function signPayment(
  req: Requirements,
  over: { value?: string; validBefore?: number; resourceUrl?: string } = {},
): Promise<string> {
  const chainId = Number(req.network.split(":")[1]);
  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: wallet.address,
    to: req.payTo,
    value: over.value ?? req.amount,
    validAfter: "0",
    validBefore: String(over.validBefore ?? now + req.maxTimeoutSeconds),
    nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
  };
  const signature = await wallet.signTypedData({
    domain: { name: req.extra.name, version: req.extra.version, chainId, verifyingContract: req.asset },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      ...authorization,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
    },
  });
  return b64({ x402Version: 2, resource: { url: over.resourceUrl ?? ENDPOINT }, accepted: req, payload: { signature, authorization } });
}

async function call(url: string, paymentHeader?: string) {
  const res = await fetch(url, { headers: paymentHeader ? { "PAYMENT-SIGNATURE": paymentHeader } : {} });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function main() {
  console.log(`Agent wallet ${wallet.address} → ${ENDPOINT}\n`);

  // 1. Ask without paying → 402 challenge
  console.log("1. Request without payment");
  const first = await call(`${ENDPOINT}?limit=5`);
  check(first.res.status === 402, `server answered ${first.res.status} Payment Required`);
  const header = first.res.headers.get("PAYMENT-REQUIRED");
  check(Boolean(header), "PAYMENT-REQUIRED header present");
  const challenge = unb64<PaymentRequired>(header ?? b64({}));
  check(challenge.x402Version === 2 && challenge.accepts?.length > 0, `x402 v${challenge.x402Version}, ${challenge.accepts?.length ?? 0} payment option(s)`);
  const req = challenge.accepts[0];
  const price = Number(req.amount) / 1e6;
  console.log(`     price ${price} USDC (${req.amount} atomic) on ${req.network}, pay to ${req.payTo}`);
  check(req.scheme === "exact" && /^eip155:\d+$/.test(req.network), "scheme 'exact' on an EVM network");

  // 2. Pay and retrieve
  console.log("\n2. Sign USDC authorization and retry");
  const payment = await signPayment(req);
  const paid = await call(`${ENDPOINT}?limit=5`, payment);
  check(paid.res.status === 200, `server answered ${paid.res.status}`);
  const receiptHeader = paid.res.headers.get("PAYMENT-RESPONSE");
  check(Boolean(receiptHeader), "PAYMENT-RESPONSE receipt header present");
  const receipt = receiptHeader ? unb64<{ success: boolean; payer: string; transaction: string; network: string }>(receiptHeader) : null;
  check(receipt?.success === true && receipt.payer.toLowerCase() === wallet.address.toLowerCase(), `receipt: success, payer matches, tx ${receipt?.transaction.slice(0, 22)}…`);
  const data = paid.body as {
    count: number;
    methodologyVersion: string;
    opportunities: { rank: number; product: { name: string }; opportunityScore: { value: number; confidence: number } | null; evidence: { count: number; top: { sourceUrl: string; observedAt: string; qualityScore: number }[] } }[];
  };
  check(Array.isArray(data?.opportunities) && data.count === data.opportunities.length && data.count > 0, `payload has ${data?.count} opportunities (methodology v${data?.methodologyVersion})`);
  const everyEvidenced = data.opportunities.every((o) => o.evidence.count > 0 && o.evidence.top.every((e) => e.sourceUrl && e.observedAt && typeof e.qualityScore === "number"));
  check(everyEvidenced, "every opportunity cites evidence with source, timestamp and quality score");
  for (const o of data.opportunities.slice(0, 5)) {
    console.log(`     #${o.rank} ${o.product.name} — score ${o.opportunityScore?.value ?? "n/a"} (conf ${o.opportunityScore?.confidence ?? "n/a"}), ${o.evidence.count} evidence`);
  }

  // 3. Abuse cases — all must be refused
  console.log("\n3. Attempts that must be refused");
  const replay = await call(`${ENDPOINT}?limit=5`, payment);
  check(replay.res.status === 402 && replay.body?.error === "nonce_already_used", `replaying the same payment → ${replay.res.status} ${replay.body?.error}`);

  const under = await call(ENDPOINT, await signPayment(req, { value: "1" }));
  check(under.res.status === 402 && under.body?.error === "amount_mismatch", `underpaying → ${under.res.status} ${under.body?.error}`);

  const expired = await call(ENDPOINT, await signPayment(req, { validBefore: Math.floor(Date.now() / 1000) - 10 }));
  check(expired.res.status === 402 && expired.body?.error === "authorization_expired", `expired authorization → ${expired.res.status} ${expired.body?.error}`);

  const forged = await signPayment(req);
  const tampered = unb64<{ payload: { authorization: { to: string } } }>(forged);
  tampered.payload.authorization.to = wallet.address; // redirect funds after signing
  const tamperedRes = await call(ENDPOINT, b64(tampered));
  check(tamperedRes.res.status === 402 && tamperedRes.body?.error === "recipient_mismatch", `altering the recipient after signing → ${tamperedRes.res.status} ${tamperedRes.body?.error}`);

  const garbage = await call(ENDPOINT, "bm90LWEtcGF5bWVudA==");
  check(garbage.res.status === 402 && garbage.body?.error === "invalid_payment_header", `garbage header → ${garbage.res.status} ${garbage.body?.error}`);

  // 4. A failed request must not consume the payment
  console.log("\n4. Bad request is not charged");
  const reusable = await signPayment(req);
  const bad = await call(`${ENDPOINT}?limit=999`, reusable);
  check(bad.res.status === 400 && !bad.res.headers.get("PAYMENT-RESPONSE"), `invalid query → ${bad.res.status}, no receipt`);
  const retry = await call(`${ENDPOINT}?limit=1`, reusable);
  check(retry.res.status === 200, `same payment then works on a valid query → ${retry.res.status}`);

  console.log(failures === 0 ? "\nAll agent checks passed." : `\n${failures} agent check(s) FAILED.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error("Agent client crashed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
