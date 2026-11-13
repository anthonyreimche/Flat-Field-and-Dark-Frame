// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// Where a position in a photo's decoded frame sits on its sensor. Safelight's
// decode is LibRaw's output, turned upright by LibRaw's flip, then by the
// photo's manual quarter turns; the masters are kept in sensor orientation, so
// the stage undoes both. Positions are 0..1 across each frame (texture UV,
// first row at v = 0).

/** Row-major 3×3 acting on (u, v, 1). */
export type Affine = readonly [number, number, number, number, number, number, number, number, number];

const IDENTITY: Affine = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function compose(after: Affine, before: Affine): Affine {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out.push(after[r * 3] * before[c] + after[r * 3 + 1] * before[3 + c] + after[r * 3 + 2] * before[6 + c]);
    }
  }
  return out as unknown as Affine;
}

/** From the turned frame back to the one before a clockwise turn (frame-job.ts placement). */
function unturn(turn: number): Affine {
  switch (((turn % 360) + 360) % 360) {
    case 90:
      return [0, 1, 0, -1, 0, 1, 0, 0, 1];
    case 180:
      return [-1, 0, 1, 0, -1, 1, 0, 0, 1];
    case 270:
      return [0, -1, 1, 1, 0, 0, 0, 0, 1];
    default:
      return IDENTITY;
  }
}

/** From LibRaw's output back to the sensor (its flip_index: swap the axes,
 *  then mirror rows, then columns). */
function unflip(flip: number): Affine {
  let m: Affine = IDENTITY;
  if (flip & 4) m = [0, 1, 0, 1, 0, 0, 0, 0, 1];
  if (flip & 2) m = compose([1, 0, 0, 0, -1, 1, 0, 0, 1], m);
  if (flip & 1) m = compose([-1, 0, 1, 0, 1, 0, 0, 0, 1], m);
  return m;
}

/** EXIF orientation → the clockwise turn it stands for (core's orient.ts). */
export function orientationTurn(orientation: number | undefined): number {
  return orientation === 3 ? 180 : orientation === 6 ? 90 : orientation === 8 ? 270 : 0;
}

/** The quarter turns the decode bakes in on top of LibRaw's flip: the photo's
 *  rotation less its EXIF orientation (core's manualRotation). */
export function manualTurn(rotation: number | undefined, orientation: number | undefined): number {
  const r = rotation ?? orientationTurn(orientation);
  return (((r - orientationTurn(orientation)) % 360) + 360) % 360;
}

/** Decoded-frame UV → sensor UV. */
export function sensorFromSource(flip: number, turn: number): Affine {
  return compose(unflip(flip), unturn(turn));
}

export function apply(m: Affine, u: number, v: number): [number, number] {
  return [m[0] * u + m[1] * v + m[2], m[3] * u + m[4] * v + m[5]];
}

/** Whether the decoded frame lies across the sensor (a quarter turn in all). */
export function swapsAxes(m: Affine): boolean {
  return m[0] === 0;
}

/** Column-major, as a GLSL mat3 uniform takes it. */
export function columnMajor(m: Affine): number[] {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}
