// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// What the stage does to one pixel, on the CPU: the reference the GLSL is
// checked against.
//
// A decode stage sees the RAW demosaiced: LibRaw took the black level off,
// scaled each colour by the as-shot white balance and mixed the colours by
// the camera's matrix, and Safelight laid its baseline tone over that. The
// stage undoes the baseline and goes back through the matrix and the white
// balance to sensor units (0 = black, 1 = white) per camera colour, the units
// the masters are in. There it repairs hot pixels, takes the dark's fixed
// pattern off and multiplies by the flat's correction, then goes forward
// again. The change is applied as baseline(new) − baseline(old), so whatever
// the round trip loses cancels.

import { decodeMultipliers, type FrameInfo, type Mat3 } from "./frame";

export type Vec3 = [number, number, number];
type M3 = readonly (readonly number[])[];

// Safelight's baselineTone (src/rendering/baseline-tone.ts), frozen by the
// process versions, and its inverse, as RAW Denoise has them.
const A = 0.5323;
const B = 1.2015;
const C = 0.0293;
const D = -0.4781;
const E = 1.9616;
const F = 0.2281;
const G = +(A + B + C - D - E - F).toFixed(4);
export const BASELINE = { A, B, C, D, E, F, G } as const;
export const INVERSE_STEPS = 6;

export function baseline(x: number): number {
  const c = Math.min(Math.max(x, 0), 1);
  return (c * ((A * c + B) * c + C)) / (((D * c + E) * c + F) * c + G) + Math.max(x - 1, 0) + (Math.min(x, 0) * C) / G;
}

export function unbaseline(y: number): number {
  if (y >= 1) return y;
  if (y <= 0) return (y * G) / C;
  let c = y * y;
  for (let i = 0; i < INVERSE_STEPS; i++) {
    const a = A - y * D;
    const b = B - y * E;
    const k = C - y * F;
    const p = ((a * c + b) * c + k) * c - y * G;
    const dp = (3 * a * c + 2 * b) * c + k;
    c = Math.min(1, Math.max(0, c - p / dp));
  }
  return c;
}

// Linear sRGB from camera RGB for a photo whose file has no matrix LibRaw
// reports: the median over 65 bodies, rows summing to 1 (RAW Denoise's).
export const MEDIAN_RGB_CAM: Mat3 = [
  [1.6638, -0.5403, -0.1235],
  [-0.1671, 1.568, -0.4009],
  [0.0207, -0.4477, 1.427],
];

export function invert3(m: M3): Mat3 {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const c0 = e * i - f * h;
  const c1 = f * g - d * i;
  const c2 = d * h - e * g;
  const s = 1 / (a * c0 + b * c1 + c * c2);
  return [
    [c0 * s, (c * h - b * i) * s, (b * f - c * e) * s],
    [c1 * s, (a * i - c * g) * s, (c * d - a * f) * s],
    [c2 * s, (b * g - a * h) * s, (a * e - b * d) * s],
  ];
}

/** A 3×3 matrix as a GLSL mat3 uniform takes it, column by column. */
export function columnMajor3(m: M3): number[] {
  return [m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]];
}

export function mul3(m: M3, v: readonly number[]): Vec3 {
  return [0, 1, 2].map((r) => m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2]) as Vec3;
}

/** The decode's camera-to-working matrix for a photo: linear sRGB from sensor
 *  units, rgb_cam · white balance · the exposure bias Safelight's decode undoes
 *  (2^−bias). */
export function workingFromSensor(info: Pick<FrameInfo, "rgbCam" | "camMul" | "preMul">, rawExposureBias: number | undefined): Mat3 {
  const rgbCam = info.rgbCam ?? MEDIAN_RGB_CAM;
  const w = decodeMultipliers(info);
  const gain = typeof rawExposureBias === "number" && Number.isFinite(rawExposureBias) ? 2 ** -rawExposureBias : 1;
  return [0, 1, 2].map((r) => [0, 1, 2].map((c) => rgbCam[r][c] * w[c] * gain)) as unknown as Mat3;
}

/** Everything the stage needs at one pixel, besides its colour. */
export interface PixelInputs {
  /** Sensor units from linear working colour, and back. */
  toSensor: Mat3;
  toWorking: Mat3;
  /** The dark's fixed pattern here per colour, or null with dark subtraction off. */
  dark: Vec3 | null;
  /** The flat's correction factor here per colour, or null with it off. */
  flat: Vec3 | null;
  /** 0..1: how far the flat may push a highlight past white. */
  clip: number;
  /** How much of the pixel is a hot sensel's (0..1), and the colour around it. */
  hot: number;
  ring: Vec3;
  /** Whether the source carries the baseline tone (uApplyBaseCurve). */
  baseCurve: boolean;
}

/** The clip control: where the flat would lift a pixel's brightest channel
 *  past white (1), the lift is held back by `clip` so that channel stays at
 *  white, or at its own level when it was there already. A scalar on all three
 *  channels, so the pixel keeps its hue. */
export function clipFactor(before: Vec3, after: Vec3, clip: number): number {
  const top = Math.max(...after);
  if (!(top > 1) || clip <= 0) return 1;
  const limit = Math.max(1, Math.max(...before)) / top;
  return 1 + (Math.min(1, limit) - 1) * clip;
}

/** The stage's result at one pixel. `lin` is the colour the stage receives. */
export function correctPixel(lin: Vec3, p: PixelInputs): Vec3 {
  const lift = (v: Vec3) => (p.baseCurve ? (v.map(unbaseline) as Vec3) : v);
  const lower = (v: Vec3) => (p.baseCurve ? (v.map(baseline) as Vec3) : v);
  const x0 = lift(lin);
  let x = x0;
  if (p.hot > 0) {
    const r = lift(p.ring);
    x = [0, 1, 2].map((c) => x[c] + (r[c] - x[c]) * p.hot) as Vec3;
  }
  let e = mul3(p.toSensor, x);
  if (p.dark) e = [e[0] - p.dark[0], e[1] - p.dark[1], e[2] - p.dark[2]];
  if (p.flat) {
    const k = p.flat;
    const lifted: Vec3 = [e[0] * k[0], e[1] * k[1], e[2] * k[2]];
    const f = clipFactor(e, lifted, p.clip);
    e = [lifted[0] * f, lifted[1] * f, lifted[2] * f];
  }
  const out = mul3(p.toWorking, e);
  const base0 = lower(x0);
  const base1 = lower(out);
  return [0, 1, 2].map((c) => lin[c] + base1[c] - base0[c]) as Vec3;
}

/** How much of a pixel `distance` sensels from a hot sensel's centre the
 *  repair takes: all of it out to REPAIR_RADIUS plus half the pixel's own
 *  span in sensels (`span`), fading out over the next sensel. */
export const REPAIR_RADIUS = 1.0;
export function repairWeight(distance: number, span: number): number {
  const r0 = REPAIR_RADIUS + 0.5 * span;
  const t = Math.min(1, Math.max(0, distance - r0));
  return 1 - t * t * (3 - 2 * t);
}

/** The ring the repair takes its colour from, in sensels from the centre. */
export const RING_RADIUS = 3;
