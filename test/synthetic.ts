// Synthetic sensors for the tests: seeded noise, Bayer and X-Trans mosaics.

import { colourAt, type CfaPattern } from "../src/cfa";

export const RGGB = 0x94949494;
export const BGGR = 0x16161616;

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(next: () => number): () => number {
  return () => Math.sqrt(-2 * Math.log(Math.max(1e-12, next()))) * Math.cos(2 * Math.PI * next());
}

/** A mosaic whose sensel (x, y) of colour c reads round(value(x, y, c)), clamped to 16 bits. */
export function mosaic(width: number, height: number, pattern: CfaPattern, value: (x: number, y: number, c: number) => number): Uint16Array {
  const out = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[y * width + x] = Math.max(0, Math.min(65535, Math.round(value(x, y, colourAt(pattern, x, y)))));
    }
  }
  return out;
}

/** Lens falloff with colour shading: cos⁴ of the field angle, red falling off faster. */
export function vignette(width: number, height: number, x: number, y: number, c: number): number {
  const dx = (x + 0.5) / width - 0.5;
  const dy = (y + 0.5) / height - 0.5;
  const r2 = (dx * dx + dy * dy) * 4;
  const cos2 = 1 / (1 + 0.6 * r2);
  return cos2 * cos2 * (c === 0 ? 1 - 0.15 * r2 : c === 2 ? 1 - 0.05 * r2 : 1);
}
