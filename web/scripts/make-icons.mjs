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
 *    declares the 512 maskable. Everything sits inside a scaled group that
 *    clears that crop.
 *  - iOS applies its own rounded-square mask and adds no padding, so the
 *    margin has to be part of the artwork. The background is drawn to the
 *    full square and the mask does the rounding.
 *
 * An icon is mostly seen at about 60px, so the parts are ranked: the roof
 * and the door carry the reading, the window panes and the smoke are
 * detail that is allowed to dissolve.
 */
import sharp from "sharp";

const PAPER = "#F7F6F1"; // warm off-white ground
const LINE = "#2B4A80"; // navy, used for every outline
const WALL = "#AED4EE";
const ROOF = "#C9593C";
const DOOR = "#F5CE3C";
const GLASS = "#EDF4FB";
const SMOKE = "#C9DCEE";

const OUT = 11; // outline weight, in the 512 grid

function svg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${PAPER}"/>

  <g transform="translate(256 256) scale(0.96) translate(-256 -256)"
     stroke="${LINE}" stroke-width="${OUT}"
     stroke-linejoin="round" stroke-linecap="round">

    <!-- Chimney first, so the roof covers where the two meet and that
         join never has to be drawn. -->
    <path d="M336 148 L380 148 Q392 148 392 160 L392 300 L336 300 Z"
          fill="${ROOF}"/>

    <!-- Walls: a pentagon with rounded feet. The top point is hidden by
         the roof, so only the shoulders and the base are ever seen. -->
    <path d="M256 168 L364 272 L364 386 Q364 412 338 412 L174 412
             Q148 412 148 386 L148 272 Z"
          fill="${WALL}"/>

    <!-- Roof as one thick round-capped chevron. Drawn twice — a wide navy
         pass, then the colour on top — which is what gives the overhang
         its outlined, rounded ends. -->
    <path d="M128 292 L256 164 L384 292" fill="none"
          stroke="${LINE}" stroke-width="${40 + OUT * 2}"/>
    <path d="M128 292 L256 164 L384 292" fill="none"
          stroke="${ROOF}" stroke-width="40"/>

    <!-- One window, four panes. The bars are thinner than the outlines:
         at small sizes they blur into a pale square, which is the right
         thing for them to become. -->
    <rect x="186" y="300" width="76" height="72" rx="12" fill="${GLASS}"/>
    <path d="M224 300 L224 372 M186 336 L262 336" stroke-width="7"/>

    <!-- Door, meeting the base so the house sits on the ground. -->
    <path d="M288 412 L288 322 Q288 308 302 308 L332 308 Q346 308 346 322
             L346 412 Z"
          fill="${DOOR}"/>
    <circle cx="302" cy="366" r="7" fill="${LINE}" stroke="none"/>

    <!-- A single curl of smoke. Pure decoration. -->
    <path d="M362 116 Q340 100 354 86 Q368 72 350 60" fill="none"
          stroke="${SMOKE}" stroke-width="13"/>
  </g>
</svg>`;
}

for (const [file, px] of [
  ["public/icon-512.png", 512],
  ["public/icon-192.png", 192],
  ["public/apple-touch-icon.png", 180],
]) {
  const info = await sharp(Buffer.from(svg())).resize(px, px).png().toFile(file);
  console.log(`${file.padEnd(30)} ${info.width}x${info.height}  ${info.size} bytes`);
}
