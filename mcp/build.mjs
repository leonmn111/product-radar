// Bundles the MCP server into one dependency-free file, then packs it as
// public/mcp/productradar-mcp-<version>.tgz so `npx -y <site>/mcp/…tgz` installs
// it in seconds. Usage (from the repo root): npm run mcp:build
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const dir = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
const dist = path.join(dir, "dist");
const publicDir = path.join(dir, "..", "public", "mcp");

rmSync(dist, { recursive: true, force: true });
const { metafile } = await build({
  absWorkingDir: dir,
  entryPoints: ["src/index.ts"],
  outfile: "dist/productradar-mcp.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  minify: true,
  metafile: true,
  legalComments: "none", // collected into THIRD_PARTY_LICENSES.txt below
  // CommonJS dependencies call require() for Node built-ins.
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

// Every bundled package's licence text, as MIT/Apache/ISC require.
const packages = new Set();
for (const input of Object.keys(metafile.inputs)) {
  const m = input.match(/^(.*node_modules\/(@[^/]+\/[^/]+|[^/]+))\//);
  if (m) packages.add(m[1]);
}
const notices = [...packages].sort().map((p) => {
  const meta = JSON.parse(readFileSync(path.join(dir, p, "package.json"), "utf8"));
  const file = readdirSync(path.join(dir, p)).find((f) => /^(licen[sc]e|copying)/i.test(f));
  const body = file ? readFileSync(path.join(dir, p, file), "utf8").trim() : `License: ${meta.license ?? "see package"}`;
  return `${meta.name}@${meta.version}\n${"-".repeat(60)}\n${body}\n`;
});
writeFileSync(path.join(dist, "THIRD_PARTY_LICENSES.txt"), `productradar-mcp bundles the following packages.\n\n${notices.join("\n\n")}`);

// Older versions stay published: existing installs point at their exact URL.
if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
execFileSync("npm", ["pack", "--pack-destination", publicDir], { cwd: dir, stdio: ["ignore", "ignore", "inherit"] });

const bytes = readFileSync(path.join(dist, "productradar-mcp.mjs")).length;
console.log(`Built productradar-mcp ${pkg.version}: ${(bytes / 1024).toFixed(0)} KB, ${packages.size} bundled packages → public/mcp/productradar-mcp-${pkg.version}.tgz`);
