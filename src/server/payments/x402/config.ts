// Which facilitator, network and price the agent API runs with — read from the
// environment (see .env.example). Payment code only (CLAUDE.md Rule 2).

import { env } from "@/lib/env";
import { httpFacilitator, mockFacilitator, type Facilitator } from "./facilitator";
import { USDC, usdcToAtomic, type PaymentRequirements } from "./protocol";

export const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator"; // free; testnet only
const TESTNET = "eip155:84532"; // Base Sepolia — the default, and the only network mock mode advertises
const MAX_TIMEOUT_SECONDS = 120;
const PLACEHOLDER_PAY_TO = "0x0000000000000000000000000000000000000000"; // docs example only

function requirementsFor(network: string, payTo: string): PaymentRequirements {
  const usdc = USDC[network];
  return {
    scheme: "exact",
    network,
    asset: usdc.address,
    amount: usdcToAtomic(env.X402_PRICE_USDC),
    payTo,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    extra: { name: usdc.name, version: usdc.version },
  };
}

export type PaymentConfig =
  | { ok: true; facilitator: Facilitator; requirements: PaymentRequirements }
  | { ok: false; reason: string };

export function loadPaymentConfig(): PaymentConfig {
  let facilitator: Facilitator;
  let network: string;
  if (env.X402_MODE === "mock") {
    if (env.NODE_ENV === "production") return { ok: false, reason: "Mock payments are disabled in production." };
    facilitator = mockFacilitator;
    network = TESTNET;
  } else if (env.X402_MODE === "facilitator") {
    network = env.X402_NETWORK ?? TESTNET;
    if (!USDC[network].testnet && !env.X402_FACILITATOR_URL) {
      return { ok: false, reason: "Base mainnet needs X402_FACILITATOR_URL: the default facilitator is testnet-only." };
    }
    facilitator = httpFacilitator(env.X402_FACILITATOR_URL ?? DEFAULT_FACILITATOR_URL);
  } else {
    return { ok: false, reason: "Agent payments are not enabled on this server." };
  }
  if (!env.X402_PAY_TO) return { ok: false, reason: "X402_PAY_TO is not configured." };
  return { ok: true, facilitator, requirements: requirementsFor(network, env.X402_PAY_TO) };
}

/**
 * What the public docs may show about payments — the same terms every 402
 * response publishes, never secrets or config errors. When payments are off,
 * `requirements` is an illustrative example.
 */
export function agentPaymentStatus() {
  const config = loadPaymentConfig();
  const requirements = config.ok
    ? config.requirements
    : requirementsFor(env.X402_NETWORK ?? TESTNET, env.X402_PAY_TO ?? PLACEHOLDER_PAY_TO);
  const usdc = USDC[requirements.network];
  return {
    enabled: config.ok,
    mock: config.ok && config.facilitator.kind === "mock",
    priceUsdc: env.X402_PRICE_USDC,
    networkLabel: usdc.label,
    testnet: usdc.testnet,
    requirements,
  };
}

export type AgentPaymentStatus = ReturnType<typeof agentPaymentStatus>;
