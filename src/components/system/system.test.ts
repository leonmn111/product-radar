import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NotFound from "@/app/not-found";
import { ErrorScreen } from "./ErrorScreen";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/&gt;/g, ">").replace(/\s+/g, " ");
const links = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map(([, href, inner]) => [href, text(inner).trim()]);

describe("404 page", () => {
  const html = renderToStaticMarkup(createElement(NotFound));

  it("shows the diagnostic, in words a screen reader can say", () => {
    expect(html).toMatch(/<h1 id="system-title" aria-label="Error 404: page not found"[^>]*>ERROR 404: ROUTE_NOT_FOUND/);
    expect(text(html)).toContain("Status 404 Not Found");
    expect(text(html)).toContain("We couldn't find that page.");
  });

  it("leads home first, then to the dashboard", () => {
    expect(links(html)).toEqual([
      ["/", "> Back to home"],
      ["/dashboard", "> Open dashboard"],
    ]);
  });
});

describe("error screen", () => {
  const screen = (error: Error & { digest?: string }) => renderToStaticMarkup(createElement(ErrorScreen, { error, retry: () => {} }));

  it("offers Retry and a way home", () => {
    const html = screen(new Error("boom"));
    expect(html).toMatch(/<button type="button"[^>]*>.*Retry execution<\/button>/);
    expect(links(html)).toEqual([["/", "> Back to home"]]);
    expect(html).toMatch(/aria-label="Error: something went wrong"[^>]*>ERROR: RUNTIME_EXCEPTION/);
  });

  it("shows the trace ID when there is one, and never the error's own message", () => {
    const html = screen(Object.assign(new Error("db password is hunter2"), { digest: "3141592653" }));
    expect(text(html)).toContain("Trace ID 3141592653");
    expect(html).not.toContain("hunter2");
    expect(text(screen(new Error("x")))).not.toContain("Trace ID");
  });
});
