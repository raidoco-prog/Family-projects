/**
 * Draws the app icon and writes every size the platforms ask for.
 *
 *   node scripts/make-icons.mjs
 *
 * Kept as a script rather than three checked-in blobs so the shape can be
 * adjusted in one place and the sizes stay in step. Colours are the app's
 * own tokens from globals.css, so the icon and the app agree.
 *
 * Two constraints drive the drawing:
 *
 *  - Android maskable icons may be cropped to a circle, and anything
 *    outside the middle 80% can be cut. The house sits well inside that.
 *  - iOS applies its own rounded-square mask and adds no padding of its
 *    own, so the margin has to be part of the artwork.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const GROUND = "#D3E4F3"; // --accent-pastel
const INK = "#2B3242"; // --ink
const ACCENT = "#3A6693"; // --accent
const WHITE = "#FFFFFF";

/** One square drawing, at any size, in the app's colours. */
function svg(size) {
  const s = (n) => (n * size) / 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${GROUND}"/>

  <!-- Scaled to clear Android's circular maskable crop. At full size the
       eaves and the bottom corners are shaved by it. -->
  <g transform="translate(256 256) scale(0.87) translate(-256 -256)">

  <!-- Roof and body as one silhouette, so the shape reads at 60px where
       separate strokes would smear into each other. -->
  <path d="M256 104 L436 252 L400 252 L400 404 Q400 420 384 420 L128 420
           Q112 420 112 404 L112 252 L76 252 Z"
        fill="${INK}"/>

  <!-- Chimney. Drawn before nothing and after the roof so it reads as
       rising from the slope rather than floating beside it. -->
  <path d="M330 84 L372 84 Q380 84 380 92 L380 194 L330 152 Z" fill="${INK}"/>

  <!-- One lit window, and nothing else. A door plus a window plus glazing
       bars all turn to mush at 60px; a single bright square survives. -->
  <rect x="214" y="292" width="84" height="84" rx="14" fill="${WHITE}"/>
  <rect x="228" y="306" width="56" height="56" rx="8" fill="${ACCENT}"/>

  </g>
</svg>`.replace("width=\"512\" height=\"512\" viewBox", `width="${s(512)}" height="${s(512)}" viewBox`);
}

const targets = [
  ["public/icon-512.png", 512],
  ["public/icon-192.png", 192],
  ["public/apple-touch-icon.png", 180],
];

await mkdir("public", { recursive: true });

for (const [file, size] of targets) {
  const info = await sharp(Buffer.from(svg(size))).png().toFile(file);
  console.log(`${file.padEnd(30)} ${info.width}x${info.height}  ${info.size} bytes`);
}
