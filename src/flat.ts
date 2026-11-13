// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// The master flat and the correction it makes. The behaviour follows
// RawTherapee's flat field tool (rtengine/rawflatfield.cc, © the RawTherapee
// developers, GPL-3.0-or-later): the flat, less its black level, is blurred per
// colour, and each sensel is multiplied by the blurred flat's value at the
// frame's centre over its value there, so the centre keeps its level and the
// falloff, colour shading and dust shadows around it are lifted to match.
//
//  • Area blur (a box of the radius) evens out the flat's grain and keeps only
//    the falloff; a small radius keeps dust shadows in it so they come out too.
//  • Vertical and horizontal blur (a box twice the radius along one axis) keep
//    line structure across the other axis, for banded flats.
//  • Vertical + horizontal multiplies the area correction by area² / (vertical
//    × horizontal), RawTherapee's line correction.
//
// The master keeps the flat as block means per colour on a grid of at most
// FLAT_CELLS blocks across, so the blur radius counts in blocks of sensels.

import { colourAt, type CfaPattern } from "./cfa";
import { gridSize, sampleGrid, type Grid } from "./grid";

export const FLAT_CELLS = 768;

export interface FlatMaster {
  width: number;
  height: number;
  /** Mean flat signal above black per colour and block, in sensor units. */
  grid: Grid;
  /** False for an X-Trans flat whose red and blue couldn't be told apart: the
   *  correction then treats them alike. */
  redBlueKnown: boolean;
}

export type BlurType = "area" | "vertical" | "horizontal" | "vertical-horizontal";
export const BLUR_TYPES: readonly BlurType[] = ["area", "vertical", "horizontal", "vertical-horizontal"];
export const MAX_BLUR_RADIUS = 200;
export const DEFAULT_BLUR_RADIUS = 32;

/** A flat signal at or below this many sensor units is no measurement: its
 *  sensels keep their value (RawTherapee's minValue). */
const MIN_SIGNAL = 1;

export function buildFlat(
  mean: Float32Array,
  width: number,
  height: number,
  pattern: CfaPattern,
  black: readonly [number, number, number],
  redBlueKnown = true,
): FlatMaster {
  const block = Math.max(6, Math.ceil(Math.max(width, height) / FLAT_CELLS));
  const size = gridSize(width, height, block);
  const data = new Float32Array(size.width * size.height * 3);
  const sum = [0, 0, 0];
  const count = [0, 0, 0];
  for (let gy = 0; gy < size.height; gy++) {
    for (let gx = 0; gx < size.width; gx++) {
      sum.fill(0);
      count.fill(0);
      for (let y = gy * block; y < Math.min(height, (gy + 1) * block); y++) {
        for (let x = gx * block; x < Math.min(width, (gx + 1) * block); x++) {
          const c = colourAt(pattern, x, y);
          sum[c] += mean[y * width + x] - black[c];
          count[c]++;
        }
      }
      const fallback = (sum[0] + sum[1] + sum[2]) / Math.max(1, count[0] + count[1] + count[2]);
      for (let c = 0; c < 3; c++) data[(gy * size.width + gx) * 3 + c] = count[c] ? sum[c] / count[c] : fallback;
    }
  }
  return { width, height, grid: { block, ...size, data }, redBlueKnown };
}

/** Box blur of one channel along its rows, the window shrinking at the edges. */
function boxRows(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  if (radius <= 0) return src;
  const out = new Float32Array(src.length);
  for (let row = 0; row < h * w; row += w) {
    let acc = 0;
    let lo = 0;
    let hi = -1;
    for (let i = 0; i < w; i++) {
      const a = Math.max(0, i - radius);
      const b = Math.min(w - 1, i + radius);
      while (hi < b) acc += src[row + ++hi];
      while (lo < a) acc -= src[row + lo++];
      out[row + i] = acc / (b - a + 1);
    }
  }
  return out;
}

/** The same down the columns, a row at a time: each column's sums are taken
 *  in the order boxRows takes a row's. */
function boxColumns(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  if (radius <= 0) return src;
  const out = new Float32Array(src.length);
  const acc = new Float64Array(w);
  let lo = 0;
  let hi = -1;
  for (let i = 0; i < h; i++) {
    const a = Math.max(0, i - radius);
    const b = Math.min(h - 1, i + radius);
    while (hi < b) {
      const row = ++hi * w;
      for (let x = 0; x < w; x++) acc[x] += src[row + x];
    }
    while (lo < a) {
      const row = lo++ * w;
      for (let x = 0; x < w; x++) acc[x] -= src[row + x];
    }
    const n = b - a + 1;
    for (let x = 0, o = i * w; x < w; x++) out[o + x] = acc[x] / n;
  }
  return out;
}

function channel(g: Grid, c: number): Float32Array {
  const out = new Float32Array(g.width * g.height);
  for (let i = 0; i < out.length; i++) out[i] = g.data[i * 3 + c];
  return out;
}

/** Radii in blocks: RawTherapee rounds the radius up to an even number of sensels. */
export function blurBlocks(radius: number, block: number): { area: number; line: number } {
  const bs = 2 * Math.ceil(Math.max(0, Math.min(MAX_BLUR_RADIUS, radius)) / 2);
  return { area: Math.round(bs / block), line: Math.round((2 * bs) / block) };
}

function blurred(ch: Float32Array, g: Grid, type: Exclude<BlurType, "vertical-horizontal">, radius: number): Float32Array {
  const { area, line } = blurBlocks(radius, g.block);
  if (type === "area") return boxColumns(boxRows(ch, g.width, g.height, area), g.width, g.height, area);
  if (type === "vertical") return boxColumns(ch, g.width, g.height, line);
  return boxRows(ch, g.width, g.height, line);
}

/** The correction factor per colour and block for a blur: the blurred flat at
 *  the frame's centre over the blurred flat there, 1 where the flat holds no
 *  signal. */
export function flatCorrection(flat: FlatMaster, type: BlurType, radius: number): Grid {
  const g = flat.grid;
  const out = new Float32Array(g.data.length);
  const cx = flat.width / 2;
  const cy = flat.height / 2;
  for (let c = 0; c < 3; c++) {
    const ch = channel(g, c);
    const area = blurred(ch, g, type === "vertical-horizontal" ? "area" : type, radius);
    const ref = sampleGrid({ ...g, data: area }, cx, cy, 0, 1);
    const h = type === "vertical-horizontal" ? blurred(ch, g, "horizontal", radius) : null;
    const v = type === "vertical-horizontal" ? blurred(ch, g, "vertical", radius) : null;
    for (let i = 0; i < area.length; i++) {
      const b = area[i];
      let k = b <= MIN_SIGNAL || ref <= MIN_SIGNAL ? 1 : ref / b;
      if (h && v && b > MIN_SIGNAL) k *= Math.max(1e-5, (b * b) / Math.max(1e-5, h[i] * v[i]));
      out[i * 3 + c] = k;
    }
  }
  if (!flat.redBlueKnown) {
    for (let i = 0; i < out.length; i += 3) out[i] = out[i + 2] = (out[i] + out[i + 2]) / 2;
  }
  return { ...g, data: out };
}

