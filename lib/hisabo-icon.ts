/**
 * The hisabo icon as SVG: a mint money bag with a ₹ and two little amber sparkles.
 * One drawing feeds everything: the in-app logo (inline, animated), the SVG favicon and the PNG icons.
 *
 * Art is drawn on a reference grid (bag + sparkles span roughly x 112→588, y 30→588) and scaled into a
 * 1024 × 1024 canvas. The bag and each sparkle are separate groups so the page can animate them.
 */

export type IconVariant =
  /** transparent background: in-app logo, favicon, "any" PWA icons */
  | "plain"
  /** solid dark square: iOS/Android round the corners themselves */
  | "full"
  /** solid dark square with extra margin: Android adaptive (circle) masks */
  | "maskable";

export function hisaboIconSvg({ prefix = "hi", variant = "plain" }: { prefix?: string; variant?: IconVariant } = {}) {
  const p = (name: string) => `${prefix}-${name}`;
  const ref = (name: string) => `url(#${p(name)})`;

  // Fit the art (≈476 × 558 reference units, centred on 350, 309) into the canvas.
  const fill = variant === "plain" ? 0.9 : variant === "full" ? 0.66 : 0.52;
  const s = (1024 * fill) / 558;
  const tx = 512 - 350 * s;
  const ty = 518 - 309 * s;

  const background =
    variant === "plain"
      ? ""
      : `<rect width="1024" height="1024" fill="${ref("bg")}"/>
         <circle cx="512" cy="430" r="420" fill="${ref("glow")}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="hisabo">
  <defs>
    <linearGradient id="${p("bg")}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#18231f"/><stop offset="1" stop-color="#0b1110"/>
    </linearGradient>
    <radialGradient id="${p("glow")}">
      <stop offset="0" stop-color="#48d6a0" stop-opacity=".14"/><stop offset="1" stop-color="#48d6a0" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${p("bag")}" x1=".15" y1="0" x2=".7" y2="1">
      <stop offset="0" stop-color="#8fdcb3"/><stop offset=".5" stop-color="#75cfa1"/><stop offset="1" stop-color="#5fc292"/>
    </linearGradient>
    <linearGradient id="${p("knot")}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4dbb87"/><stop offset="1" stop-color="#349669"/>
    </linearGradient>
    <radialGradient id="${p("sheen")}" cx=".28" cy=".38" r=".55">
      <stop offset="0" stop-color="#fff" stop-opacity=".13"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  ${background}
  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(5)})">
    <g class="ic-bag">
      <!-- tie / ruffled top -->
      <path d="M272 150 L232 74 Q226 58 246 50 Q262 34 292 46 Q312 26 332 30 Q352 26 368 46 Q398 34 414 50 Q434 58 428 74 L388 150 Q330 160 272 150 Z" fill="${ref("knot")}"/>
      <!-- bag body -->
      <path d="M264 170 C178 208 110 300 110 424 C110 540 192 588 330 588 C468 588 550 540 550 424 C550 300 482 208 396 170 Q330 158 264 170 Z" fill="${ref("bag")}"/>
      <path d="M264 170 C178 208 110 300 110 424 C110 540 192 588 330 588 C468 588 550 540 550 424 C550 300 482 208 396 170 Q330 158 264 170 Z" fill="${ref("sheen")}"/>
      <!-- ₹ -->
      <g fill="none" stroke="#12261d" stroke-width="22" stroke-linecap="round" stroke-linejoin="round">
        <path d="M276 304 H386"/>
        <path d="M276 344 H386"/>
        <path d="M301 304 C350 304 368 326 362 351 C356 375 333 386 286 386 L360 462"/>
      </g>
    </g>
    <!-- sparkles -->
    <g fill="none" stroke="#f4b56c" stroke-width="20" stroke-linecap="round" stroke-linejoin="round">
      <path class="ic-spark-1" d="M490 132 L532 70 L552 80"/>
      <path class="ic-spark-2" d="M524 188 H584"/>
    </g>
  </g>
</svg>`;
}
