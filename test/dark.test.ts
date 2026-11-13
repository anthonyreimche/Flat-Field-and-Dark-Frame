// The master dark from synthetic dark frames: black taken off once, the glow,
// banding and hot pixels each found, and a photo's dark signal cancelled.

import { describe, expect, it } from "vitest";
import { bayerPattern } from "../src/cfa";
import { FrameMean, HOT_FLOOR, buildDark, darkPattern, darkSignal } from "../src/dark";
import { RGGB, gauss, mosaic, rng } from "./synthetic";

const W = 192;
const H = 128;
const BLACK = 512;
const WHITE = 16383;
const RANGE = WHITE - BLACK;
const pattern = bayerPattern(RGGB)!;
const HOT = [
  [10, 20],
  [101, 64],
  [150, 3],
  [33, 120],
];
/** Amp glow in the right edge, a warmer red, and a banded column. */
const glow = (x: number, _y: number, c: number) => 4 + 30 * Math.max(0, (x - 140) / 52) ** 2 + (c === 0 ? 2 : 0);
const band = (x: number) => (x === 77 ? 6 : 0);

function darkFrame(seed: number): Uint16Array {
  const noise = gauss(rng(seed));
  return mosaic(W, H, pattern, (x, y, c) => {
    const hot = HOT.some(([hx, hy]) => hx === x && hy === y) ? 900 : 0;
    return BLACK + glow(x, y, c) + band(x) + hot + 3 * noise();
  });
}

function master(frames = 8) {
  const sum = new FrameMean();
  for (let i = 0; i < frames; i++) sum.add({ width: W, height: H, data: darkFrame(i + 1) });
  return buildDark(sum.mean(), W, H, pattern, [BLACK, BLACK, BLACK], WHITE);
}

describe("master dark", () => {
  const d = master();

  it("lists the planted hot pixels and nothing else", () => {
    const found = [...d.hot].map((i) => [i % W, Math.floor(i / W)]).sort((a, b) => a[0] - b[0]);
    expect(found).toEqual([...HOT].sort((a, b) => a[0] - b[0]));
  });

  it("takes the black level off once: the pattern is the signal above black, in range units", () => {
    for (const [x, y] of [[5, 5], [60, 90], [180, 40], [77, 10]]) {
      const want = (glow(x, y, (x % 2) + (y % 2) === 0 ? 0 : 1) + band(x)) / RANGE;
      if ((x % 2) + (y % 2) === 1) expect(darkPattern(d, x, y, 1)).toBeCloseTo(want, 4);
    }
    expect(d.level).toBeGreaterThan(3 / RANGE);
    expect(d.level).toBeLessThan(6 / RANGE);
    expect(d.blackEstimated).toBe(false);
  });

  it("keeps the glow per colour", () => {
    expect(darkPattern(d, 20, 20, 0) - darkPattern(d, 20, 20, 1)).toBeCloseTo(2 / RANGE, 4);
  });

  it("finds the banded column", () => {
    expect(d.cols[77] - (d.cols[76] + d.cols[78]) / 2).toBeCloseTo(6 / RANGE, 4);
  });

  it("cancels a photo's dark signal sensel by sensel, away from hot pixels", () => {
    const scene = (x: number, y: number) => 2000 + 10 * ((x * 7 + y * 3) % 50);
    const noise = gauss(rng(99));
    let worst = 0;
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        if (HOT.some(([hx, hy]) => Math.abs(hx - x) < 2 && Math.abs(hy - y) < 2)) continue;
        const c = (x % 2) + (y % 2) === 0 ? 0 : (x % 2) + (y % 2) === 2 ? 2 : 1;
        // What the decode hands the stage, in sensor units: the photo less its black.
        const decoded = (scene(x, y) + glow(x, y, c) + band(x) + 0.5 * noise()) / RANGE;
        worst = Math.max(worst, Math.abs(decoded - darkPattern(d, x, y, c) - scene(x, y) / RANGE));
      }
    }
    expect(worst * RANGE).toBeLessThan(3.5);
  });
});

describe("black level", () => {
  it("stands the frame's own level in for a reported black of 0", () => {
    const mean = Float32Array.from(darkFrame(3));
    const { signal, estimated } = darkSignal(mean, W, pattern, [0, 0, 0], WHITE);
    expect(estimated).toBe(true);
    expect(Math.abs(signal[W * 60 + 60])).toBeLessThan(20 / WHITE);
  });

  it("stands it in for a reported black above the frame", () => {
    const mean = Float32Array.from(darkFrame(4));
    expect(darkSignal(mean, W, pattern, [1024, 1024, 1024], WHITE).estimated).toBe(true);
  });

  it("keeps a reported black the frame sits just above", () => {
    const mean = Float32Array.from(darkFrame(5));
    expect(darkSignal(mean, W, pattern, [BLACK, BLACK, BLACK], WHITE).estimated).toBe(false);
  });

  it("calls nothing hot in a clean dark", () => {
    const sum = new FrameMean();
    const noise = gauss(rng(7));
    sum.add({ width: W, height: H, data: mosaic(W, H, pattern, () => BLACK + 2 * noise()) });
    const clean = buildDark(sum.mean(), W, H, pattern, [BLACK, BLACK, BLACK], WHITE);
    expect(clean.hot.length).toBe(0);
    expect(HOT_FLOOR * RANGE).toBeGreaterThan(10);
  });
});
