import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ NODE_ENV: "development", EMAIL_FROM: "ProductRadar <hello@theproductradar.io>" } as Record<string, string | undefined>));
const send = vi.hoisted(() => vi.fn(async () => ({ data: { id: "email_1" }, error: null })));
vi.mock("@/lib/env", () => ({ env }));
vi.mock("resend", () => ({ Resend: vi.fn(function (this: unknown) { return { emails: { send } }; }) }));
const { sendEmail } = await import("./email");
const { Resend } = await import("resend");

const email = { to: "buyer@example.com", subject: "Receipt", text: "Hello", html: "<p>Hello</p>" };

describe("sendEmail", () => {
  beforeEach(() => {
    for (const k of ["RESEND_API_KEY", "AUTH_RESEND_KEY"]) delete env[k];
    env.NODE_ENV = "development";
    send.mockClear();
  });

  it("sends through the Resend SDK with RESEND_API_KEY, from EMAIL_FROM", async () => {
    env.RESEND_API_KEY = "re_live_abc";
    await sendEmail(email);
    expect(vi.mocked(Resend)).toHaveBeenLastCalledWith("re_live_abc");
    expect(send).toHaveBeenCalledWith({ from: "ProductRadar <hello@theproductradar.io>", to: "buyer@example.com", subject: "Receipt", text: "Hello", html: "<p>Hello</p>" });
  });

  it("falls back to AUTH_RESEND_KEY, which production already has", async () => {
    env.AUTH_RESEND_KEY = "re_auth_key";
    env.NODE_ENV = "production";
    await sendEmail(email);
    expect(vi.mocked(Resend)).toHaveBeenLastCalledWith("re_auth_key");
  });

  it("prints instead of sending with a mock key or no key in development", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    env.RESEND_API_KEY = "re_mock123";
    await sendEmail(email);
    delete env.RESEND_API_KEY;
    await sendEmail(email);
    expect(send).not.toHaveBeenCalled();
    expect(log.mock.calls[0][0]).toContain("(mock key: not sent)");
    log.mockRestore();
  });

  it("refuses in production without a real key, so a missing email is never silent", async () => {
    env.NODE_ENV = "production";
    await expect(sendEmail(email)).rejects.toThrow("Email isn't configured");
    env.RESEND_API_KEY = "re_mock123";
    await expect(sendEmail(email)).rejects.toThrow("Email isn't configured");
    expect(send).not.toHaveBeenCalled();
  });

  it("throws when Resend refuses the email", async () => {
    env.RESEND_API_KEY = "re_live_abc";
    send.mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "Invalid `to` field" } } as never);
    await expect(sendEmail(email)).rejects.toThrow("Resend refused the email: validation_error: Invalid `to` field");
  });
});
