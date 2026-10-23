import { llmsTxt } from "@/lib/llmsTxt";

// GET /llms.txt (llmstxt.org): plain text, prerendered at build time.
export function GET() {
  return new Response(llmsTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
