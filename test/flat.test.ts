// The master flat from synthetic flat frames: a vignetted, colour-shaded flat
// applied to a photo with the same vignetting leaves the photo flat.

import { describe, expect, it } from "vitest";
import { bayerPattern, colourAt, xtransShift, type CfaPattern } from "../src/cfa";
import { blurBlocks, buildFlat, flatCorrection, type BlurType } from "../src/flat";
import { sampleGrid } from "../src/grid";
import { RGGB, gauss, mosaic, rng, vignette } from "./synthetic";

const W = 480;
const H = 320;
const BLACK = 600;
const bayer = bayerPattern(RGGB)!;

function flatMean(pattern: CfaPattern, level = 9000, extra: (x: number, y: number) => number = () => 1): Float32Array {
  const noise = gauss(rng(11));
  return Float32Array.from(mosaic(W, H, pattern, (x, y, c) => BLACK + level * vignette(W, H, x, y, c) * extra(x, y) + 20 * noise()));
}

/** The worst relative departure from flat of a vignetted grey scene, corrected. */
function residual(pattern: CfaPattern, type: BlurType, radius: number, extra?: (x: number, y: number) => number, margin = 8): number {
  const flat = buildFlat(flatMean(pattern, 9000, extra), W, H, pattern, [BLACK, BLACK, BLACK]);
  const k = flatCorrection(flat, type, radius);
  let worst = 0;
  for (let y = margin; y < H - margin; y += 5) {
    for (let x = margin; x < W - margin; x += 5) {
      const c = colourAt(pattern, x, y);
      const photo = 3000 * vignette(W, H, x, y, c) * (extra ? extra(x, y) : 1);
      const centre = 3000 * vignette(W, H, W / 2, H / 2, c) * (extra ? extra(W / 2, H / 2) : 1);
      const corrected = photo * sampleGrid(k, x + 0.5, y + 0.5, c);
      worst = Math.max(worst, Math.abs(corrected / centre - 1));
    }
  }
  return worst;
}

// Radii stay small against these 480-sensel frames: a box blur that runs into
// the frame's edge averages a steep falloff one-sidedly (RawTherapee's blur
// does too), which on a real sensor's thousands of sensels is a far smaller part.
describe("master flat", () => {
  it("leaves a vignetted, colour-shaded Bayer photo flat (area blur)", () => {
    expect(residual(bayer, "area", 8)).toBeLessThan(0.015);
  });

  it("does so for X-Trans too", () => {
    expect(residual(xtransShift(2, 1), "area", 8)).toBeLessThan(0.015);
  });

  it("keeps the centre at its level", () => {
    const flat = buildFlat(flatMean(bayer), W, H, bayer, [BLACK, BLACK, BLACK]);
    const k = flatCorrection(flat, "area", 32);
    for (let c = 0; c < 3; c++) expect(sampleGrid(k, W / 2, H / 2, c)).toBeCloseTo(1, 6);
  });

  it("takes the black level off the flat before it divides", () => {
    // Against the wrong black (none), the corner's correction comes out too small.
    const mean = flatMean(bayer);
    const right = flatCorrection(buildFlat(mean, W, H, bayer, [BLACK, BLACK, BLACK]), "area", 0);
    const wrong = flatCorrection(buildFlat(mean, W, H, bayer, [0, 0, 0]), "area", 0);
    const corner = 1 / vignette(W, H, 10, 10, 1);
    expect(sampleGrid(right, 10.5, 10.5, 1)).toBeCloseTo(corner, 1);
    expect(sampleGrid(wrong, 10.5, 10.5, 1)).toBeLessThan(corner - 0.05);
  });

  const dust = (x: number, y: number) => 1 - 0.3 * Math.exp(-((x - 300) ** 2 + (y - 120) ** 2) / (2 * 12 * 12));

  it("takes a dust shadow out with little blur, and leaves it with a wide one", () => {
    expect(residual(bayer, "area", 0, dust)).toBeLessThan(0.04);
    expect(residual(bayer, "area", 120, dust)).toBeGreaterThan(0.1);
  });

  it("rounds the radius up to even sensels and counts it in blocks", () => {
    expect(blurBlocks(31, 8)).toEqual({ area: 4, line: 8 });
    expect(blurBlocks(0, 8)).toEqual({ area: 0, line: 0 });
    expect(blurBlocks(500, 8).area).toBe(25);
  });

  it("keeps column banding with a vertical blur, and not with an area or horizontal one", () => {
    // Columns a block apart or more: finer banding than the master's blocks
    // can't be kept.
    const columns = (x: number) => 1 + 0.05 * Math.sin(x / 12);
    const mean = Float32Array.from(mosaic(W, H, bayer, (x) => BLACK + 9000 * columns(x)));
    const flat = buildFlat(mean, W, H, bayer, [BLACK, BLACK, BLACK]);
    // How far from even the corrected flat is: vertical + horizontal, like
    // RawTherapee's, may also shift the whole frame by the centre's banding.
    const worst = (type: BlurType) => {
      const k = flatCorrection(flat, type, 24);
      const v: number[] = [];
      for (let y = 40; y < H - 40; y += 7) for (let x = 40; x < W - 40; x += 3) v.push(columns(x) * sampleGrid(k, x + 0.5, y + 0.5, 1));
      return (Math.max(...v) - Math.min(...v)) / (v.reduce((a, b) => a + b, 0) / v.length);
    };
    expect(worst("vertical")).toBeLessThan(0.01);
    expect(worst("area")).toBeGreaterThan(0.04);
    expect(worst("horizontal")).toBeGreaterThan(0.04);
  });

  it("matches the area blur on a smooth flat with vertical + horizontal", () => {
    expect(residual(bayer, "vertical-horizontal", 4)).toBeLessThan(0.02);
  });

  it("corrects nothing where the flat holds no signal", () => {
    const empty = Float32Array.from({ length: W * H }, () => BLACK);
    const k = flatCorrection(buildFlat(empty, W, H, bayer, [BLACK, BLACK, BLACK]), "area", 32);
    expect([...k.data].every((v) => v === 1)).toBe(true);
  });

  it("corrects red and blue alike when they couldn't be told apart", () => {
    const flat = buildFlat(flatMean(xtransShift(0, 0)), W, H, xtransShift(0, 0), [BLACK, BLACK, BLACK], false);
    const k = flatCorrection(flat, "area", 32);
    expect(sampleGrid(k, 5, 5, 0)).toBeCloseTo(sampleGrid(k, 5, 5, 2), 6);
  });
});
