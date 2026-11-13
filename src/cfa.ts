// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// Which colour filter sits over each sensel of the visible frame, in sensor
// orientation. A Bayer layout comes from LibRaw's `filters` bitmask. LibRaw's
// wasm build doesn't hand over the X-Trans table, so an X-Trans layout is
// Fujifilm's 6×6 pattern at the shift a flat frame's own levels pick.

/** Camera colour channels: red, green, blue. */
export type Colour = 0 | 1 | 2;

/** The colour of the sensel at (x, y): `colours[(y % size) * size + x % size]`. */
export interface CfaPattern {
  size: 2 | 6;
  colours: readonly Colour[];
}

export function colourAt(p: CfaPattern, x: number, y: number): Colour {
  return p.colours[(y % p.size) * p.size + (x % p.size)];
}

/** LibRaw's `filters` value for an X-Trans sensor. */
export const XTRANS_FILTERS = 9;

/** LibRaw's FC(row, col) for a Bayer `filters` mask, with its second green
 *  (index 3) folded into green. */
export function bayerPattern(filters: number): CfaPattern | null {
  if (!Number.isInteger(filters) || filters >>> 0 < 1000) return null;
  const colours: Colour[] = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const c = (filters >>> ((((row << 1) & 14) | (col & 1)) << 1)) & 3;
      colours.push(c === 3 ? 1 : (c as Colour));
    }
  }
  const counts = [0, 1, 2].map((c) => colours.filter((v) => v === c).length);
  return counts[0] === 1 && counts[1] === 2 && counts[2] === 1 ? { size: 2, colours } : null;
}

/** Fujifilm's X-Trans layout (dcraw's table), rows top down. */
export const XTRANS_BASE: readonly Colour[] = [
  1, 1, 0, 1, 1, 2,
  1, 1, 2, 1, 1, 0,
  2, 0, 1, 0, 2, 1,
  1, 1, 2, 1, 1, 0,
  1, 1, 0, 1, 1, 2,
  0, 2, 1, 2, 0, 1,
];

export function xtransShift(dx: number, dy: number): CfaPattern {
  const colours: Colour[] = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) colours.push(XTRANS_BASE[((y + dy) % 6) * 6 + ((x + dx) % 6)]);
  return { size: 6, colours };
}

/** Mean level of each of the 36 sensel phases (x % 6, y % 6) over the frame,
 *  as `phase[(y % 6) * 6 + x % 6]`. */
export function phaseMeans(mosaic: ArrayLike<number>, width: number, height: number, black = 0): number[] {
  const sum = new Float64Array(36);
  const count = new Float64Array(36);
  const step = Math.max(1, Math.floor(Math.min(width, height) / 600)) * 6;
  for (let y0 = 0; y0 + 6 <= height; y0 += step) {
    for (let x0 = 0; x0 + 6 <= width; x0 += step) {
      for (let j = 0; j < 6; j++) {
        for (let i = 0; i < 6; i++) {
          sum[j * 6 + i] += mosaic[(y0 + j) * width + x0 + i] - black;
          count[j * 6 + i]++;
        }
      }
    }
  }
  return Array.from(sum, (s, k) => (count[k] > 0 ? s / count[k] : 0));
}

/** How an X-Trans frame's colours were settled. */
export interface XtransFit {
  pattern: CfaPattern;
  /** False when red and blue sat too close to tell apart: the pattern's red
   *  and blue may be swapped, so the caller should treat them alike. */
  redBlueKnown: boolean;
}

/**
 * The X-Trans shift that best explains a flat frame's phase levels: the one
 * whose phases of one colour agree most closely. Two shifts, three rows apart,
 * swap red and blue and fit equally; of those, the one where the channel the
 * camera's white balance amplifies more is the darker one wins. A flat lit
 * close to neutral always reads that way. `mul` is LibRaw's cam_mul.
 */
export function fitXtrans(phase: readonly number[], mul: readonly number[]): XtransFit {
  let best: { pattern: CfaPattern; score: number } | null = null;
  const scored: { pattern: CfaPattern; score: number }[] = [];
  for (let dy = 0; dy < 6; dy++) {
    for (let dx = 0; dx < 6; dx++) {
      const pattern = xtransShift(dx, dy);
      const groups: number[][] = [[], [], []];
      pattern.colours.forEach((c, k) => groups[c].push(phase[k]));
      let score = 0;
      for (const g of groups) {
        const m = g.reduce((a, b) => a + b, 0) / g.length;
        for (const v of g) score += (v - m) ** 2;
      }
      scored.push({ pattern, score });
      if (!best || score < best.score) best = { pattern, score };
    }
  }
  if (!best) throw new Error("no X-Trans shift");
  const winner = best;
  const twins = scored.filter((s) => Math.abs(s.score - winner.score) <= 1e-9 * Math.max(1, winner.score));
  const colourMean = (p: CfaPattern, c: Colour) => {
    const g = phase.filter((_, k) => p.colours[k] === c);
    return g.reduce((a, b) => a + b, 0) / g.length;
  };
  const mulR = mul[0] > 0 ? mul[0] : 1;
  const mulB = mul[2] > 0 ? mul[2] : 1;
  const pick = twins.find((t) => {
    const r = colourMean(t.pattern, 0);
    const b = colourMean(t.pattern, 2);
    return mulR >= mulB ? r <= b : r >= b;
  }) ?? winner;
  const r = colourMean(pick.pattern, 0);
  const b = colourMean(pick.pattern, 2);
  const apart = Math.abs(r - b) / Math.max(1e-9, Math.max(r, b));
  return { pattern: pick.pattern, redBlueKnown: apart > 0.02 && Math.abs(mulR - mulB) / Math.max(mulR, mulB) > 0.02 };
}
