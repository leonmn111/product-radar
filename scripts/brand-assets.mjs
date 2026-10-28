// Builds the site's logo, favicon and home-screen icon from the two official files in public/:
//   public/Logowithwriting.png  the logo with the name (navy and teal, transparent background)
//   public/mainlogo.png         the icon (white and teal mark on a navy rounded square)
// Re-run after either file changes: node scripts/brand-assets.mjs
//
// Outputs (committed):
//   public/brand/logo-wordmark.png        the logo, trimmed, in its own colours: for light backgrounds
//   public/brand/logo-wordmark-light.png  the same with the navy turned white (teal kept): for the dark bars,
//                                         where navy text would vanish; the icon itself uses white on navy
//   src/app/favicon.ico                   16, 32 and 48 px, transparent corners (browser tabs)
//   src/app/icon.png                      256 px, transparent corners
//   src/app/apple-icon.png                180 px, full-bleed navy (iOS rounds the corners itself)

import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const WORDMARK = "public/Logowithwriting.png";
const ICON = "public/mainlogo.png";
const WORDMARK_HEIGHT = 128; // 4× the 32 px it's shown at
await mkdir("public/brand", { recursive: true });

const raw = async (input) => {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, info };
};
const fromRaw = (data, info) => sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });

// ── The wordmark ─────────────────────────────────────────────────────────────
const trimmed = await sharp(WORDMARK).trim().png().toBuffer();
await sharp(trimmed).resize({ height: WORDMARK_HEIGHT }).png({ compressionLevel: 9, palette: true }).toFile("public/brand/logo-wordmark.png");

// Reversed for dark backgrounds: dark, unsaturated pixels (the navy and its anti-aliased edges) become
// white at the same opacity; the teal is left as it is.
{
  const { data, info } = await raw(trimmed);
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a === 0) continue;
    const teal = g - r > 60 && b - r > 30;
    if (!teal) data[i] = data[i + 1] = data[i + 2] = 255;
  }
  await fromRaw(data, info).resize({ height: WORDMARK_HEIGHT }).png({ compressionLevel: 9, palette: true }).toFile("public/brand/logo-wordmark-light.png");
}

// ── The icon ─────────────────────────────────────────────────────────────────
// The file is opaque, with white outside the rounded square. Flood-fill the light pixels reachable from the
// corners and turn them transparent, un-mixing the anti-aliased edge (a grey edge pixel becomes navy at
// partial opacity), so there's no white halo on a dark tab. The white mark inside is walled in by navy.
const { data: icon, info: iconInfo } = await raw(ICON);
const { width: W, height: H } = iconInfo;
const at = (x, y) => (y * W + x) * 4;
const navyAt = at(Math.round(W / 2), Math.round(H * 0.08)); // inside the square, above the mark
const navy = [icon[navyAt], icon[navyAt + 1], icon[navyAt + 2]];
const navyLight = (navy[0] + navy[1] + navy[2]) / 3;
const light = (i) => (icon[i] + icon[i + 1] + icon[i + 2]) / 3;
const seen = new Uint8Array(W * H);
const stack = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]];
while (stack.length) {
  const [x, y] = stack.pop();
  if (x < 0 || y < 0 || x >= W || y >= H || seen[y * W + x]) continue;
  const i = at(x, y);
  if (light(i) < navyLight + 40) continue; // reached the navy square
  seen[y * W + x] = 1;
  const alpha = Math.max(0, Math.min(1, (255 - light(i)) / (255 - navyLight)));
  icon[i] = navy[0];
  icon[i + 1] = navy[1];
  icon[i + 2] = navy[2];
  icon[i + 3] = Math.round(alpha * 255);
  stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}
const rounded = await fromRaw(icon, iconInfo).trim().png().toBuffer();
const square = async (size) => sharp(rounded).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9, palette: true }).toBuffer();

await writeFile("src/app/icon.png", await square(256));
await sharp(await square(180))
  .flatten({ background: { r: navy[0], g: navy[1], b: navy[2] } })
  .png({ compressionLevel: 9, palette: true })
  .toFile("src/app/apple-icon.png");

// favicon.ico: an ICO directory around PNG images (16, 32, 48 px), which every current browser reads.
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map(square));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, n) => {
  const e = 6 + 16 * n;
  header.writeUInt8(size, e); // width
  header.writeUInt8(size, e + 1); // height
  header.writeUInt8(0, e + 2); // palette colours
  header.writeUInt8(0, e + 3); // reserved
  header.writeUInt16LE(1, e + 4); // colour planes
  header.writeUInt16LE(32, e + 6); // bits per pixel
  header.writeUInt32LE(pngs[n].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += pngs[n].length;
});
await writeFile("src/app/favicon.ico", Buffer.concat([header, ...pngs]));

for (const f of ["public/brand/logo-wordmark.png", "public/brand/logo-wordmark-light.png", "src/app/icon.png", "src/app/apple-icon.png"]) {
  const m = await sharp(f).metadata();
  console.log(`${f}: ${m.width}×${m.height}`);
}
console.log(`src/app/favicon.ico: ${sizes.join(", ")} px; navy sampled as rgb(${navy.join(", ")})`);
