import { describe, expect, it } from "vitest";
import { formatDateTime } from "./format";

describe("formatDateTime", () => {
  it("always shows UTC, so the server and every visitor's browser render the same text", () => {
    // Newer ICU puts a narrow no-break space before AM/PM.
    expect(formatDateTime("2026-10-11T14:30:00.000Z").replace(/ /g, " ")).toBe("Oct 11, 2026, 2:30 PM UTC");
    expect(formatDateTime("2026-10-11T23:30:00.000Z").replace(/ /g, " ")).toBe("Oct 11, 2026, 11:30 PM UTC");
  });
});
