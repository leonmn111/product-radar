// Builds the site's logo, favicon and home-screen icon from the two official files in public/:
//   public/productradarwordlogo.png  the logo with the name: the mark stacked over "ProductRadar", navy and
//                                    teal on a solid white background (the file has no real transparency)
//   public/mainlogo.png              the icon (white and teal mark on a navy rounded square)
// Re-run after either file changes: node scripts/brand-assets.mjs
//
// Outputs (committed):
//   public/brand/logo-wordmark.png        the logo, background removed and trimmed, in its own colours: for
//                                         light backgrounds
//   public/brand/logo-wordmark-light.png  the same with the navy turned white (teal kept): for the dark bars,
//                                         where navy text would vanish; the icon itself uses white on navy
//   src/app/favicon.ico                   16, 32 and 48 px, transparent corners (browser tabs)
//   src/app/icon.png                      256 px, transparent corners
//   src/app/apple-icon.png                180 px, full-bleed navy (iOS rounds the corners itself)

import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const WORDMARK = "public/productradarwordlogo.png";
const ICON = "public/mainlogo.png";
const WORDMARK_HEIGHT = 256; // 4× the 48 px it's shown at in the bars, and enough for the share card
await mkdir("public/brand", { recursive: true });

const raw = async (input) => {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, info };
};
const fromRaw = (data, info) => sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });

// ── The wordmark ─────────────────────────────────────────────────────────────
// The file is opaque: navy and teal ink on white. Each pixel is un-mixed into one of the two inks (by hue) and
// how much of it covers the white, so the white (letter holes included) becomes transparent, edges stay
// smooth, and the ink keeps its exact brand colour. The reversed copy then turns the navy white.
{
  const { data, info } = await raw(WORDMARK);
  const isTeal = (i) => data[i + 1] - data[i] > 40;
  const average = (pick) => {
    const sum = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (!pick(i)) continue;
      for (let c = 0; c < 3; c++) sum[c] += data[i + c];
      n++;
    }
    return sum.map((v) => v / n);
  };
  const lum = (i) => (data[i] + data[i + 1] + data[i + 2]) / 3;
  const navy = average((i) => lum(i) < 60 && !isTeal(i)); // solid navy ink
  const teal = average((i) => isTeal(i) && data[i + 1] > 150 && lum(i) < 170); // solid teal ink
  const white = [255, 255, 255];
  const own = Buffer.alloc(data.length);
  const reversed = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const ink = isTeal(i) ? teal : navy;
    // p = a·ink + (1 − a)·white  ⇒  a = (white − p)·(white − ink) / |white − ink|²
    let dot = 0;
    let norm = 0;
    for (let c = 0; c < 3; c++) {
      dot += (white[c] - data[i + c]) * (white[c] - ink[c]);
      norm += (white[c] - ink[c]) ** 2;
    }
    const a = Math.max(0, Math.min(1, dot / norm));
    const alpha = a < 0.04 ? 0 : Math.round(a * 255); // paper grain off the white
    for (let c = 0; c < 3; c++) {
      own[i + c] = Math.round(ink[c]);
      reversed[i + c] = ink === navy ? 255 : Math.round(ink[c]);
    }
    own[i + 3] = reversed[i + 3] = alpha;
  }
  for (const [buffer, file] of [
    [own, "public/brand/logo-wordmark.png"],
    [reversed, "public/brand/logo-wordmark-light.png"],
  ]) {
    const trimmed = await fromRaw(buffer, info).trim().png().toBuffer();
    await sharp(trimmed).resize({ height: WORDMARK_HEIGHT }).png({ compressionLevel: 9, palette: true }).toFile(file);
  }
  console.log(`wordmark inks: navy rgb(${navy.map(Math.round).join(", ")}), teal rgb(${teal.map(Math.round).join(", ")})`);
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
