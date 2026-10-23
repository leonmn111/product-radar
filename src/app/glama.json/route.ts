import glama from "../../../glama.json";

// GET /glama.json: the repository's glama.json (the Glama MCP directory's server metadata: who maintains
// it), served from the site too. One file, so the two can't differ.
export function GET() {
  return Response.json(glama);
}
