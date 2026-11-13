// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// The master dark: one or more frames shot with the lens capped, averaged
// sensel by sensel, and split into what a photo's decode can be corrected for.
//
//  • The dark's signal above black, in units of the sensor's range (0 = black,
//    1 = white): the level a sensel reads with no light. As in RawTherapee's
//    dark frame subtraction, this, and never the black level itself, comes off
//    the photo, which the decode has already taken its black level from.
//  • That signal is kept as a smooth glow per colour on a coarse grid (amp
//    glow, a warm corner, the uniform dark current), plus a level per column
//    and per row (readout banding). Those three add up to the fixed pattern.
//  • Hot pixels, the sensels far above that pattern, are listed. Safelight's
//    GPU sees the photo demosaiced, where a hot sensel has already bled into
//    its neighbours, so subtracting it there can't take it out cleanly; it is
//    repaired from the pixels around it instead.

import { colourAt, type CfaPattern } from "./cfa";
import { gridSize, sampleGrid, type Grid } from "./grid";
import { median } from "./levels";

/** One frame's mosaic: the visible part, sensor orientation, row-major. */
export interface Mosaic {
  width: number;
  height: number;
  data: Uint16Array;
}

export interface DarkMaster {
  width: number;
  height: number;
  /** Smooth dark signal per colour (R, G, B). */
  glow: Grid;
  /** Banding: each column's and each row's level above the glow. */
  cols: Float32Array;
  rows: Float32Array;
  /** Hot sensels as y * width + x, strongest first. */
  hot: Uint32Array;
  /** The median dark signal and the noise around the pattern, both in range units. */
  level: number;
  noise: number;
  /** True when the reported black level didn't fit the frame and the frame's
   *  own median stood in for it (see darkSignal). */
  blackEstimated: boolean;
}

/** About 256 glow cells across the long edge. */
export const GLOW_CELLS = 256;
/** Sensels further above the pattern than this many times its noise are hot. */
export const HOT_SIGMAS = 8;
/** …and at least this far, in range units, so a very clean dark lists only real defects. */
export const HOT_FLOOR = 0.001;
export const MAX_HOT = 100_000;

/** Sums frames sensel by sensel, one at a time, for their mean. Whole sensor
 *  values stay exact in a float sum up to 256 frames. */
export class FrameMean {
  private sum: Float32Array | null = null;
  private count = 0;
  width = 0;
  height = 0;

  add(f: Mosaic): void {
    if (!this.sum) {
      this.sum = new Float32Array(f.width * f.height);
      this.width = f.width;
      this.height = f.height;
    } else if (f.width !== this.width || f.height !== this.height) {
      throw new Error("the frames differ in size");
    }
    for (let i = 0; i < f.data.length; i++) this.sum[i] += f.data[i];
    this.count++;
  }

  /** The mean, in the sum's own buffer: call once, after the last add. */
  mean(): Float32Array {
    const sum = this.sum;
    if (!sum) throw new Error("no frames");
    for (let i = 0; i < sum.length; i++) sum[i] /= this.count;
    this.sum = null;
    return sum;
  }

  get frames(): number {
    return this.count;
  }
}

/** The dark signal of each sensel in range units: (value − black) / (white − black).
 *  A reported black level that sits clearly above the frame's median (no sensel
 *  reads below black for long), or none at all under a frame lit well above
 *  black (no dark is), is wrong: the frame's median per colour stands in. */
export function darkSignal(
  mean: Float32Array,
  width: number,
  pattern: CfaPattern | null,
  black: readonly [number, number, number],
  white: number,
): { signal: Float32Array; estimated: boolean } {
  const colourOf = (i: number) => (pattern ? colourAt(pattern, i % width, Math.floor(i / width)) : 1);
  const range = white - (black[0] + black[1] + black[2]) / 3;
  const per: number[][] = [[], [], []];
  const step = Math.max(1, Math.floor(mean.length / 300_000));
  for (let i = 0; i < mean.length; i += step) per[colourOf(i)].push(mean[i]);
  const medians = per.map((p) => (p.length ? median(p) : NaN));
  const known = medians.map((m, c) => (Number.isNaN(m) ? black[c] : m));
  const tooHigh = known.some((m, c) => black[c] - m > 0.002 * range);
  const missing = black.every((b) => b <= 0) && known.some((m) => m > 0.02 * range);
  const estimated = tooHigh || missing;
  const base = estimated ? known : black;
  const signal = new Float32Array(mean.length);
  for (let i = 0; i < mean.length; i++) signal[i] = (mean[i] - base[colourOf(i)]) / range;
  return { signal, estimated };
}

/** The glow: each cell's median signal per colour. Without a known pattern
 *  (an X-Trans dark) every colour takes the median of all sensels. */
export function glowGrid(signal: Float32Array, width: number, height: number, pattern: CfaPattern | null): Grid {
  const block = Math.max(6, Math.ceil(Math.max(width, height) / GLOW_CELLS));
  const size = gridSize(width, height, block);
  const data = new Float32Array(size.width * size.height * 3);
  const per: number[][] = [[], [], []];
  for (let gy = 0; gy < size.height; gy++) {
    for (let gx = 0; gx < size.width; gx++) {
      for (const p of per) p.length = 0;
      for (let y = gy * block; y < Math.min(height, (gy + 1) * block); y++) {
        for (let x = gx * block; x < Math.min(width, (gx + 1) * block); x++) {
          per[pattern ? colourAt(pattern, x, y) : 1].push(signal[y * width + x]);
        }
      }
      const all = median(per.flat());
      for (let c = 0; c < 3; c++) data[(gy * size.width + gx) * 3 + c] = pattern && per[c].length ? median(per[c]) : all;
    }
  }
  return { block, ...size, data };
}

const sampleStride = (n: number, want: number) => Math.max(1, Math.floor(n / want));

/** Build the master dark from the mean of frames of one camera and frame size. */
export function buildDark(
  mean: Float32Array,
  width: number,
  height: number,
  pattern: CfaPattern | null,
  black: readonly [number, number, number],
  white: number,
): DarkMaster {
  const { signal, estimated } = darkSignal(mean, width, pattern, black, white);
  const glow = glowGrid(signal, width, height, pattern);
  const colourOf = (x: number, y: number) => (pattern ? colourAt(pattern, x, y) : 1);

  const residual = new Float32Array(signal.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      residual[i] = signal[i] - sampleGrid(glow, x + 0.5, y + 0.5, colourOf(x, y));
    }
  }

  const cols = new Float32Array(width);
  const rowStep = sampleStride(height, 1500);
  const column: number[] = [];
  for (let x = 0; x < width; x++) {
    column.length = 0;
    for (let y = 0; y < height; y += rowStep) column.push(residual[y * width + x]);
    cols[x] = median(column);
  }
  const rows = new Float32Array(height);
  const colStep = sampleStride(width, 1500);
  const row: number[] = [];
  for (let y = 0; y < height; y++) {
    row.length = 0;
    for (let x = 0; x < width; x += colStep) row.push(residual[y * width + x] - cols[x]);
    rows[y] = median(row);
  }

  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) residual[y * width + x] -= cols[x] + rows[y];
  const sampled: number[] = [];
  const step = sampleStride(residual.length, 400_000);
  for (let i = 0; i < residual.length; i += step) sampled.push(Math.abs(residual[i]));
  const noise = 1.4826 * median(sampled);
  const threshold = Math.max(HOT_SIGMAS * noise, HOT_FLOOR);
  const found: number[] = [];
  for (let i = 0; i < residual.length; i++) if (residual[i] > threshold) found.push(i);
  found.sort((a, b) => residual[b] - residual[a]);
  const level = median(Array.from({ length: Math.ceil(signal.length / step) }, (_, k) => signal[k * step]));

  return {
    width,
    height,
    glow,
    cols,
    rows,
    hot: Uint32Array.from(found.slice(0, MAX_HOT)),
    level,
    noise,
    blackEstimated: estimated,
  };
}

/** The fixed pattern a master dark takes off sensel (x, y) of colour `c`, in
 *  range units: what the GPU reads at the sensel's centre. */
export function darkPattern(d: DarkMaster, x: number, y: number, c: number): number {
  return sampleGrid(d.glow, x + 0.5, y + 0.5, c) + d.cols[x] + d.rows[y];
}
