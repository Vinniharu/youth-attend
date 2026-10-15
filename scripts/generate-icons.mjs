/**
 * Generates every app icon from the RCCG logo master. Outputs are committed;
 * rerun after changing the master:
 *
 *   npm run icons
 *
 * - src/app/favicon.ico             16/32/48, transparent (legacy browsers)
 * - src/app/icon.png                192, transparent (<link rel="icon">)
 * - src/app/apple-icon.png          180, opaque white (iOS fills transparency with black)
 * - public/icons/icon-{192,512}.png transparent (manifest, purpose "any")
 * - public/icons/icon-maskable-512.png
 *                                   white, badge inside the 80% safe zone (Android
 *                                   crops maskable icons to a circle or squircle)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import sharp from "sharp";

const SOURCE = "src/assets/brand/rccg-logo.png";
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/** The badge alone at `size` px. sharp premultiplies alpha when resizing, so the
 * master's invisible pixels (alpha 0, leftover pink RGB) can't bleed into edges. */
const badge = (size) =>
  sharp(SOURCE)
    .resize(size, size, { fit: "contain", background: TRANSPARENT, kernel: "lanczos3" })
    .png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
    .toBuffer();

/** The badge at `scale` of a `size` px opaque white square. */
async function badgeOnWhite(size, scale) {
  const logo = await badge(Math.round(size * scale));
  return sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: logo, gravity: "center" }])
    .flatten({ background: WHITE })
    .png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
    .toBuffer();
}

/** A PNG-compressed .ico (supported by every browser that still asks for one). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette colours
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

async function write(path, buffer) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
  console.log(`[icons] ${path} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

const favicons = await Promise.all(
  [16, 32, 48].map(async (size) => ({ size, png: await badge(size) })),
);
await write("src/app/favicon.ico", ico(favicons));
await write("src/app/icon.png", await badge(192));
await write("src/app/apple-icon.png", await badgeOnWhite(180, 0.88));
await write("public/icons/icon-192.png", await badge(192));
await write("public/icons/icon-512.png", await badge(512));
await write("public/icons/icon-maskable-512.png", await badgeOnWhite(512, 0.8));
