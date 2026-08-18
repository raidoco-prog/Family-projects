/**
 * Draws the app icon and writes every size the platforms ask for.
 *
 *   node scripts/make-icons.mjs
 *
 * Kept as a script rather than three checked-in blobs so the drawing is
 * edited in one place and the sizes never drift apart.
 *
 * Two constraints shape it:
 *
 *  - Android maskable icons may be cropped to a circle, and the manifest
 *    declares the 512 maskable. Everything therefore sits inside a scaled
 *    group that clears that crop with room to spare.
 *  - iOS applies its own rounded-square mask and adds no padding, so the
 *    margin has to be part of the artwork.
 *
 * A cartoon has more parts than a silhouette, and an icon is mostly seen
 * at about 60px. The parts are sized accordingly: the roof, the door and
 * the two lit windows carry the whole reading, and the smoke is decoration
 * that is allowed to disappear.
 */
import sharp from "sharp";

const SKY = "#D3E4F3"; // --accent-pastel, the app's own blue
const GRASS = "#C4E0BE";
const ROOF = "#D97757";
const ROOF_DARK = "#B85C40";
const WALL = "#FFF8EE";
const DOOR = "#3A6693";
const GLOW = "#F6D97A";
const LINE = "#2B3242"; // --ink
const SMOKE = "#FFFFFF";

function svg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${SKY}"/>

  <g transform="translate(256 256) scale(0.86) translate(-256 -256)"
     stroke="${LINE}" stroke-width="9" stroke-linejoin="round" stroke-linecap="round">

    <!-- Ground. Runs off every edge on purpose: the sides and bottom fall
         outside the canvas, so only the top curve is ever drawn and it
         reads as ground rather than as a slab sitting on the square. -->
    <path d="M-120 402 Q256 362 632 402 L632 640 L-120 640 Z" fill="${GRASS}"/>

    <!-- Smoke, largest first. Pure decoration: at icon size it reads as a
         soft edge, and nothing is lost when it does. -->
    <circle cx="356" cy="128" r="15" fill="${SMOKE}"/>
    <circle cx="330" cy="92"  r="20" fill="${SMOKE}"/>
    <circle cx="292" cy="62"  r="26" fill="${SMOKE}"/>

    <!-- Chimney, behind the roof so the join needs no drawing. -->
    <path d="M330 152 L370 152 L370 240 L330 240 Z" fill="${ROOF_DARK}"/>

    <!-- Walls -->
    <path d="M136 258 L376 258 L376 404 L136 404 Z" fill="${WALL}"/>

    <!-- Roof, with an overhang on both sides. The single most recognisable
         part of a house at small size, so it gets the strongest colour. -->
    <path d="M256 146 L412 262 L100 262 Z" fill="${ROOF}"/>

    <!-- Two lit windows and a door: the pattern the eye reads as a home. -->
    <rect x="150" y="292" width="60" height="60" rx="10" fill="${GLOW}"/>
    <rect x="302" y="292" width="60" height="60" rx="10" fill="${GLOW}"/>

    <path d="M226 404 L226 330 Q226 304 256 304 Q286 304 286 330 L286 404 Z"
          fill="${DOOR}"/>
    <circle cx="272" cy="364" r="7" fill="${GLOW}" stroke="none"/>
  </g>
</svg>`;
}

for (const [file, px] of [
  ["public/icon-512.png", 512],
  ["public/icon-192.png", 192],
  ["public/apple-touch-icon.png", 180],
]) {
  const info = await sharp(Buffer.from(svg(px))).resize(px, px).png().toFile(file);
  console.log(`${file.padEnd(30)} ${info.width}x${info.height}  ${info.size} bytes`);
}
