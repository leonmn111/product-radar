import { describe, expect, it } from "vitest";
import { analyticsConfig } from "./analytics";

describe("analyticsConfig", () => {
  it("is off until a provider is configured", () => {
    expect(analyticsConfig({})).toBeNull();
    expect(analyticsConfig({ NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "  " })).toBeNull();
  });

  it("uses Plausible's hosted script, or a self-hosted one", () => {
    expect(analyticsConfig({ NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "theproductradar.io" })).toEqual({
      provider: "plausible",
      domain: "theproductradar.io",
      src: "https://plausible.io/js/script.js",
    });
    expect(analyticsConfig({ NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "x.io", NEXT_PUBLIC_PLAUSIBLE_SRC: "https://stats.x.io/js/script.js" })?.src).toBe(
      "https://stats.x.io/js/script.js",
    );
  });

  it("uses PostHog's EU cloud unless another host is given, and prefers Plausible when both are set", () => {
    expect(analyticsConfig({ NEXT_PUBLIC_POSTHOG_KEY: "phc_abc" })).toEqual({ provider: "posthog", key: "phc_abc", host: "https://eu.i.posthog.com" });
    expect(analyticsConfig({ NEXT_PUBLIC_POSTHOG_KEY: "phc_abc", NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com/" })?.host).toBe(
      "https://us.i.posthog.com",
    );
    expect(analyticsConfig({ NEXT_PUBLIC_POSTHOG_KEY: "phc_abc", NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "x.io" })?.provider).toBe("plausible");
  });
});
