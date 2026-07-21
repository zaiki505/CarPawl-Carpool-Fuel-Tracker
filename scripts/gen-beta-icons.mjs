/* Generate the beta channel's icon set from the uploaded source art.

   Every output mirrors the geometry of its official counterpart, measured from
   the existing files rather than guessed:
     ic_launcher / ic_launcher_round  full-bleed, 48..192 (round == square here,
                                      the official pair are byte-identical)
     ic_launcher_foreground           108..432 canvas, artwork inset to ~68%
     icon-maskable-512                artwork inset to 72% (safe zone)
     everything else                  full-bleed
*/
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
// Source master lives in art/, NOT public/ - anything in public/ is copied into
// the build and precached by the service worker, and a 1.1MB master that no
// page ever requests has no business on a user's device.
const SRC = path.join(ROOT, "art/Carpawl-Beta-icon.png"); // 1254px master

const DENSITIES = [
  ["mdpi", 48, 108],
  ["hdpi", 72, 162],
  ["xhdpi", 96, 216],
  ["xxhdpi", 144, 324],
  ["xxxhdpi", 192, 432],
];
const FOREGROUND_SCALE = 0.68; // measured: 294/432, 73/108, 220/324 ...
const MASKABLE_SCALE = 0.72; // measured: 369/512

/** Artwork scaled to `inner` and centred on a transparent `canvas` square. */
async function inset(canvas, scale) {
  const inner = Math.round(canvas * scale);
  const art = await sharp(SRC).resize(inner, inner, { fit: "contain" }).png().toBuffer();
  return sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: art, gravity: "centre" }])
    .png()
    .toBuffer();
}

const fullBleed = (size) => sharp(SRC).resize(size, size, { fit: "contain" }).png().toBuffer();

const out = [];
async function write(file, buf) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buf);
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  if (file.endsWith(".png")) {
    const m = await sharp(buf).metadata();
    out.push(`${rel}  ${m.width}x${m.height}`);
  } else {
    out.push(rel);
  }
}

// ---- Android beta flavor source set -------------------------------------
for (const [density, legacy, fgCanvas] of DENSITIES) {
  const dir = path.join(ROOT, "android/app/src/beta/res/mipmap-" + density);
  const legacyPng = await fullBleed(legacy);
  await write(path.join(dir, "ic_launcher.png"), legacyPng);
  await write(path.join(dir, "ic_launcher_round.png"), legacyPng);
  await write(path.join(dir, "ic_launcher_foreground.png"), await inset(fgCanvas, FOREGROUND_SCALE));
}

// The adaptive icon's background colour sits behind the foreground and shows at
// the mask edge. Sampled from the beta artwork so the two never disagree.
await write(
  path.join(ROOT, "android/app/src/beta/res/values/ic_launcher_background.xml"),
  Buffer.from(
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Beta flavor override of the official #7A37E6. Sampled from
         public/Carpawl-Beta-icon.png so the adaptive mask edge matches. -->
    <color name="ic_launcher_background">#1E0142</color>
</resources>
`,
    "utf8"
  )
);

// ---- Web / PWA ----------------------------------------------------------
await write(path.join(ROOT, "public/favicon-beta.png"), await fullBleed(64));
await write(path.join(ROOT, "public/icons/beta-icon-192.png"), await fullBleed(192));
await write(path.join(ROOT, "public/icons/beta-icon-512.png"), await fullBleed(512));
await write(path.join(ROOT, "public/icons/beta-apple-touch-icon.png"), await fullBleed(180));
await write(
  path.join(ROOT, "public/icons/beta-icon-maskable-512.png"),
  await inset(512, MASKABLE_SCALE)
);

console.log(out.join("\n"));
console.log("\n" + out.length + " files written");
