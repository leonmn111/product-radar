import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to max hits per window per key, then blocks, then resets", () => {
    const rl = createRateLimiter({ windowMs: 1000, max: 2 });
    expect(rl.limited("a", 0)).toBe(false);
    expect(rl.limited("a", 10)).toBe(false);
    expect(rl.limited("a", 20)).toBe(true);
    expect(rl.limited("b", 20)).toBe(false); // keys are independent
    expect(rl.limited("a", 1_100)).toBe(false); // earliest hits have aged out
  });
});
