// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// A coarse three-channel grid laid over the sensor in square blocks, read
// the way the GPU's filtered texture read reads it: each value sits at its
// block's centre, and between centres it is interpolated linearly, clamped at
// the edges. The masters keep the smooth part of a frame this way.

export interface Grid {
  /** Sensels per block side. */
  block: number;
  width: number;
  height: number;
  /** RGB per cell, row-major. */
  data: Float32Array;
}

export function gridSize(sensorW: number, sensorH: number, block: number): { width: number; height: number } {
  return { width: Math.ceil(sensorW / block), height: Math.ceil(sensorH / block) };
}

/** The grid's value of channel `c` at sensor position (sx, sy), in sensels
 *  from the top-left corner of the visible frame (a sensel's centre is +0.5).
 *  `channels`: per cell in `data`, for a grid of one channel alone. */
export function sampleGrid(g: Grid, sx: number, sy: number, c: number, channels = 3): number {
  const gx = Math.min(Math.max(sx / g.block - 0.5, 0), g.width - 1);
  const gy = Math.min(Math.max(sy / g.block - 0.5, 0), g.height - 1);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(x0 + 1, g.width - 1);
  const y1 = Math.min(y0 + 1, g.height - 1);
  const fx = gx - x0;
  const fy = gy - y0;
  const at = (x: number, y: number) => g.data[(y * g.width + x) * channels + c];
  return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
}
