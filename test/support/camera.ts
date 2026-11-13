// A synthetic camera and its calibration frames. Imports nothing of the
// extension's but pure modules, so a mock of its RAW reader can use it.

import { bayerPattern } from "../../src/cfa";
import type { FrameInfo, RawReadout } from "../../src/frame";
import { RGGB, mosaic, vignette } from "../synthetic";

export const W = 120;
export const H = 80;

export const INFO: FrameInfo = {
  make: "Nikon",
  model: "Z 6_2",
  lens: "NIKKOR Z 24-70mm f/4 S",
  iso: 800,
  shutter: 30,
  aperture: 8,
  focal: 24,
  temperature: null,
  timestamp: null,
  width: W,
  height: H,
  flip: 0,
  filters: RGGB,
  black: 1008,
  white: 15520,
  camMul: [2, 1, 1.5, 0],
  preMul: [2, 1, 1.5, 0],
  rgbCam: [[1.7, -0.55, -0.15], [-0.2, 1.55, -0.35], [0.02, -0.45, 1.43]],
};

export const pattern = bayerPattern(RGGB)!;

export const file = (name: string) => new File([new Uint8Array(4)], name);

/** A dark frame's readout with one hot sensel, or a vignetted flat's. */
export function readout(kind: "dark" | "flat"): RawReadout {
  const data = mosaic(W, H, pattern, (x, y, c) => 1008 + (kind === "dark" ? (x === 30 && y === 20 ? 3000 : 6) : 9000 * vignette(W, H, x, y, c)));
  return { raw_width: W, raw_height: H, top_margin: 0, left_margin: 0, width: W, height: H, data };
}
