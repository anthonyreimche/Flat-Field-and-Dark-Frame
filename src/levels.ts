// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// A frame's black level per colour. LibRaw reports one black level, but some
// bodies (Canon among them) keep theirs per channel, measured from the masked
// sensels at the sensor's edges, and report 0 until processing folds it in.
// Subtracting a dark frame or normalizing a flat against the wrong black would
// shift every value by the difference, so a reported 0 beside a masked border
// is replaced by that border's level.

import { colourAt, type CfaPattern, type Colour } from "./cfa";
import type { RawReadout } from "./frame";

export type BlackSource = "file" | "masked";

export interface BlackLevels {
  /** Per camera colour, in sensor units. */
  black: [number, number, number];
  source: BlackSource;
}

/** The smallest masked border worth measuring, in sensels; two at each side
 *  of it are skipped, where the readout's edge and the image's bleed. */
const MIN_MASKED = 8;

export function median(values: ArrayLike<number>): number {
  const a = Float64Array.from(values).sort();
  if (a.length === 0) return 0;
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** The level of the masked border per colour, or null without one. Colours
 *  follow the visible frame's pattern, shifted back by the margins. */
export function maskedBlack(readout: RawReadout, pattern: CfaPattern | null): [number, number, number] | null {
  const { left_margin: left, top_margin: top, raw_width: rw, raw_height: rh, data } = readout;
  const samples: number[][] = [[], [], []];
  const take = (x: number, y: number) => {
    const c: Colour = pattern ? colourAt(pattern, mod(x - left, pattern.size), mod(y - top, pattern.size)) : 1;
    if (samples[c].length < 200_000) samples[c].push(data[y * rw + x]);
  };
  if (left >= MIN_MASKED) for (let y = top; y < rh; y += 3) for (let x = 2; x < left - 2; x++) take(x, y);
  if (top >= MIN_MASKED) for (let y = 2; y < top - 2; y++) for (let x = left; x < rw; x += 3) take(x, y);
  if (samples.every((s) => s.length === 0)) return null;
  const all = samples.flat();
  const fallback = median(all);
  return [0, 1, 2].map((c) => (samples[c].length ? median(samples[c]) : fallback)) as [number, number, number];
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** The black level to subtract: LibRaw's, unless it reports none and the
 *  sensor's masked border has a level. */
export function blackLevels(reported: number, masked: [number, number, number] | null): BlackLevels {
  if (reported <= 0 && masked && masked.some((v) => v > 0)) return { black: masked, source: "masked" };
  return { black: [reported, reported, reported], source: "file" };
}
