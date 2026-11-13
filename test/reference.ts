// The stage's whole frame on the CPU, from model.ts, for the GPU spec: a
// source drawn at its own size, each pixel's sensel found through the
// orientation, the ring read as the pass reads it (edge texels repeated).

import type { DarkMaster } from "../src/dark";
import type { Grid } from "../src/grid";
import { sampleGrid } from "../src/grid";
import { correctPixel, repairWeight, RING_RADIUS, baseline, type Vec3 } from "../src/model";
import type { Mat3 } from "../src/frame";
import { apply, type Affine } from "../src/orient";

export interface RgbFrame {
  width: number;
  height: number;
  /** RGB, row-major from the top. */
  data: Float64Array;
}

export interface FrameSetup {
  toSensorUv: Affine;
  sensor: { width: number; height: number };
  toSensor: Mat3;
  toWorking: Mat3;
  dark: DarkMaster | null;
  flat: Grid | null;
  clip: number;
  baseCurve: boolean;
}

const luma = (v: readonly number[]) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];

/** The pass: the mean of the eight ring taps without the brightest. */
export function ring(src: RgbFrame, x: number, y: number, lift: (v: number) => number): Vec3 {
  const r = Math.max(1.5, RING_RADIUS);
  const taps: Vec3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = i * 0.7853981634;
    const tx = Math.min(src.width - 1, Math.max(0, Math.floor(x + 0.5 + Math.cos(a) * r)));
    const ty = Math.min(src.height - 1, Math.max(0, Math.floor(y + 0.5 + Math.sin(a) * r)));
    const o = (ty * src.width + tx) * 3;
    taps.push([lift(src.data[o]), lift(src.data[o + 1]), lift(src.data[o + 2])]);
  }
  let top = 0;
  for (let i = 1; i < 8; i++) if (luma(taps[i]) > luma(taps[top])) top = i;
  const sum: Vec3 = [0, 0, 0];
  taps.forEach((t, i) => {
    if (i !== top) for (let c = 0; c < 3; c++) sum[c] += t[c] / 7;
  });
  return sum;
}

export function referenceFrame(src: RgbFrame, s: FrameSetup): RgbFrame {
  const lift = s.baseCurve ? baseline : (v: number) => v;
  const out = new Float64Array(src.data.length);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const o = (y * src.width + x) * 3;
      const lin: Vec3 = [lift(src.data[o]), lift(src.data[o + 1]), lift(src.data[o + 2])];
      const [u, v] = apply(s.toSensorUv, (x + 0.5) / src.width, (y + 0.5) / src.height);
      const sx = u * s.sensor.width;
      const sy = v * s.sensor.height;
      let hot = 0;
      let dark: Vec3 | null = null;
      if (s.dark) {
        const d = s.dark;
        for (const i of d.hot) hot = Math.max(hot, repairWeight(Math.hypot(sx - (i % d.width) - 0.5, sy - Math.floor(i / d.width) - 0.5), 1));
        const px = Math.min(d.width - 1, Math.max(0, Math.floor(sx)));
        const py = Math.min(d.height - 1, Math.max(0, Math.floor(sy)));
        const g = [0, 1, 2].map((c) => sampleGrid(d.glow, sx, sy, c));
        dark = [0, 1, 2].map((c) => g[c] + d.cols[px] + d.rows[py]) as Vec3;
      }
      const flat = s.flat ? ([0, 1, 2].map((c) => sampleGrid(s.flat as Grid, sx, sy, c)) as Vec3) : null;
      const res = correctPixel(lin, {
        toSensor: s.toSensor,
        toWorking: s.toWorking,
        dark,
        flat,
        clip: s.clip,
        hot,
        ring: hot > 0 ? ring(src, x, y, lift) : [0, 0, 0],
        baseCurve: s.baseCurve,
      });
      out.set(res, o);
    }
  }
  return { width: src.width, height: src.height, data: out };
}
