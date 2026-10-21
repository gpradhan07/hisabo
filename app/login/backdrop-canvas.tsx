"use client";

import { useEffect, useRef } from "react";

type RGB = [number, number, number];

/** Same colours as `.login-backdrop-fill` in globals.css (which shows until this has drawn). */
const STOPS: [number, RGB][] = [
  [0, [0x12, 0x30, 0x1f]],
  [0.55, [0x0c, 0x1a, 0x15]],
  [1, [0x0b, 0x11, 0x10]],
];
const PAGE: RGB = [0x0b, 0x11, 0x10];
const ANGLE = (160 * Math.PI) / 180;
/** The green holds to half the width, then fades into the page colour. */
const FADE_FROM = 0.5;

function colourAt(t: number): RGB {
  const i = t <= STOPS[1][0] ? 0 : 1;
  const [t0, c0] = STOPS[i];
  const [t1, c1] = STOPS[i + 1];
  const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
}

/**
 * The sign-in backdrop, drawn pixel by pixel with dithering. A dark gradient this wide has only a
 * few dozen shades to step through, and as a CSS fade every pixel in a column rounds the same way,
 * which shows as vertical lines. Here each pixel rounds with a little randomness instead, so the
 * steps dissolve into imperceptible noise and the fade looks smooth.
 */
export function BackdropCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;

    const draw = () => {
      // One sample per CSS pixel is plenty for a soft gradient; sharper screens scale it up smoothly,
      // and it keeps the draw short (no visible pause while the page opens).
      const w = Math.round(canvas.clientWidth);
      const h = Math.round(canvas.clientHeight);
      const ctx = canvas.getContext("2d");
      if (!w || !h || !ctx) return;
      canvas.width = w;
      canvas.height = h;
      const img = ctx.createImageData(w, h);
      const px = img.data; // a clamped array: assigning rounds to the nearest shade

      // the fade towards the middle, per column
      const fade = new Float32Array(w);
      for (let x = 0; x < w; x++) {
        const u = x / w;
        fade[x] = u < FADE_FROM ? 1 : 1 - (u - FADE_FROM) / (1 - FADE_FROM);
      }
      // the gradient's colours, looked up instead of worked out per pixel
      const steps = 1024;
      const lut = new Float32Array(steps * 3);
      for (let k = 0; k < steps; k++) lut.set(colourAt(k / (steps - 1)), k * 3);

      // a CSS angle gradient: 0deg points up, angles turn clockwise
      const dx = Math.sin(ANGLE);
      const dy = -Math.cos(ANGLE);
      const span = Math.abs(w * dx) + Math.abs(h * dy);

      // xorshift: a fast source of the ±half-shade noise that does the dithering
      let seed = 0x9e3779b9;
      const noise = () => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return (seed >>> 0) / 4294967296 - 0.5;
      };

      for (let y = 0; y < h; y++) {
        let t = (-(w / 2) * dx + (y - h / 2) * dy) / span + 0.5;
        for (let x = 0; x < w; x++, t += dx / span) {
          const k = Math.min(steps - 1, Math.max(0, Math.round(t * (steps - 1)))) * 3;
          const f = fade[x];
          const i = (y * w + x) * 4;
          px[i] = PAGE[0] + (lut[k] - PAGE[0]) * f + noise();
          px[i + 1] = PAGE[1] + (lut[k + 1] - PAGE[1]) * f + noise();
          px[i + 2] = PAGE[2] + (lut[k + 2] - PAGE[2]) * f + noise();
          px[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    };

    // draws once on first observe, then again whenever the backdrop changes size
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    });
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 size-full" aria-hidden />;
}
