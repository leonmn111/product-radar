import { describe, expect, it } from "vitest";
import { formatDateTime, roundRatings } from "./format";

describe("formatDateTime", () => {
  it("always shows UTC, so the server and every visitor's browser render the same text", () => {
    // Newer ICU puts a narrow no-break space before AM/PM.
    expect(formatDateTime("2026-10-11T14:30:00.000Z").replace(/ /g, " ")).toBe("Oct 11, 2026, 2:30 PM UTC");
    expect(formatDateTime("2026-10-11T23:30:00.000Z").replace(/ /g, " ")).toBe("Oct 11, 2026, 11:30 PM UTC");
  });
});

describe("roundRatings", () => {
  it("shows a rating in an evidence claim to one decimal", () => {
    expect(roundRatings("Average rating 4.755351681957187 / 5 on cultbeauty.co.uk")).toBe("Average rating 4.8 / 5 on cultbeauty.co.uk");
    expect(roundRatings("Average rating 4.83 / 5 on lifx.com")).toBe("Average rating 4.8 / 5 on lifx.com");
    expect(roundRatings("rated 4.75/5, 96.25% positive")).toBe("rated 4.8/5, 96.25% positive");
    expect(roundRatings("9.25 out of 10")).toBe("9.3 out of 10");
  });

  it("leaves prices, short ratings and other numbers alone", () => {
    expect(roundRatings("£19.99 at shop.test, rated 4.5 / 5, 1,234 reviews")).toBe("£19.99 at shop.test, rated 4.5 / 5, 1,234 reviews");
    expect(roundRatings("12.50 GBP on AliExpress")).toBe("12.50 GBP on AliExpress");
  });
});
