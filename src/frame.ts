// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// A calibration frame or a photo as LibRaw reads it: the visible part of the
// sensor's mosaic in sensor orientation, its levels and colour data, and the
// shooting details matching goes by. Pure: libraw.ts does the reading.

import { XTRANS_FILTERS, bayerPattern, type CfaPattern } from "./cfa";

export type Mat3 = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];

/** Shooting details and decode data of one RAW file. */
export interface FrameInfo {
  make: string;
  model: string;
  lens: string;
  iso: number;
  /** Seconds. */
  shutter: number;
  aperture: number;
  /** Millimetres. */
  focal: number;
  /** °C, when the file records one. */
  temperature: number | null;
  /** Milliseconds since 1970, when the file records it. */
  timestamp: number | null;
  /** The visible frame, in sensor orientation. */
  width: number;
  height: number;
  /** LibRaw's flip: bit 4 swaps the axes, 2 mirrors rows, 1 mirrors columns. */
  flip: number;
  filters: number;
  /** The black level LibRaw reports, in sensor units. */
  black: number;
  /** Sensor white, in sensor units. */
  white: number;
  /** The as-shot white balance multipliers (R, G, B, G2). */
  camMul: readonly number[];
  /** The daylight multipliers (R, G, B, G2). */
  preMul: readonly number[];
  /** Camera RGB to linear sRGB, LibRaw's rgb_cam (rows sum to 1). */
  rgbCam: Mat3 | null;
}

/** What `rawImageData()` hands back: the whole readout, masked borders included. */
export interface RawReadout {
  raw_width: number;
  raw_height: number;
  top_margin: number;
  left_margin: number;
  width: number;
  height: number;
  data: Uint16Array;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
const nums = (v: unknown, n: number): number[] => {
  const a = Array.isArray(v) ? v : [];
  return Array.from({ length: n }, (_, i) => num(a[i]));
};

function temperatureOf(common: Record<string, unknown>): number | null {
  for (const key of ["SensorTemperature", "CameraTemperature", "SensorTemperature2", "exifAmbientTemperature", "AmbientTemperature"]) {
    const t = common[key];
    // LibRaw marks an unset temperature with -1000.
    if (typeof t === "number" && Number.isFinite(t) && t > -100 && t < 150) return t;
  }
  return null;
}

function matrixOf(v: unknown): Mat3 | null {
  if (!Array.isArray(v) || v.length < 3) return null;
  const rows = v.slice(0, 3).map((r) => nums(r, 3));
  if (rows.some((r) => r.every((x) => x === 0))) return null;
  return [rows[0] as [number, number, number], rows[1] as [number, number, number], rows[2] as [number, number, number]];
}

/** The visible frame's size in sensor orientation. LibRaw's wasm builds differ
 *  on whether they report it before or after the flip's axis swap, so the pair
 *  that fits inside the readout past its margins wins. */
export function visibleSize(readout: Pick<RawReadout, "raw_width" | "raw_height" | "top_margin" | "left_margin" | "width" | "height">): { width: number; height: number } {
  const roomW = readout.raw_width - readout.left_margin;
  const roomH = readout.raw_height - readout.top_margin;
  const { width, height } = readout;
  if (width <= roomW && height <= roomH) return { width, height };
  if (height <= roomW && width <= roomH) return { width: height, height: width };
  return { width: Math.min(width, roomW), height: Math.min(height, roomH) };
}

/** A file's details from LibRaw's `metadata(true)`, sized by its readout.
 *  Fields LibRaw left out read as 0, "" or null. */
export function frameInfoOf(meta: unknown, size: { width: number; height: number }): FrameInfo {
  const m = obj(meta);
  const colour = obj(m.color_data);
  const lens = obj(m.lens);
  const stamp = m.timestamp instanceof Date ? m.timestamp.getTime() : typeof m.timestamp === "number" ? m.timestamp * 1000 : NaN;
  return {
    make: str(m.camera_make),
    model: str(m.camera_model),
    lens: str(lens.Lens),
    iso: num(m.iso_speed),
    shutter: num(m.shutter),
    aperture: num(m.aperture),
    focal: num(m.focal_len),
    temperature: temperatureOf(obj(m.metadata_common)),
    timestamp: Number.isFinite(stamp) && stamp > 0 ? stamp : null,
    width: size.width,
    height: size.height,
    flip: num(m.flip),
    filters: num(m.filters) >>> 0,
    black: num(colour.black),
    white: num(colour.maximum),
    camMul: nums(colour.cam_mul, 4),
    preMul: nums(colour.pre_mul, 4),
    rgbCam: matrixOf(colour.rgb_cam),
  };
}

/** Why a frame can't be calibrated or corrected, or null when it can. */
export function unsupportedReason(info: FrameInfo): string | null {
  if (info.width < 16 || info.height < 16) return "LibRaw read no sensor data from it";
  if (info.filters === 0) return "its sensor has no colour filter mosaic (a monochrome, Foveon or already demosaiced file)";
  if (info.filters !== XTRANS_FILTERS && !bayerPattern(info.filters)) return "its sensor layout isn't Bayer or X-Trans";
  if (!(info.white > info.black)) return "LibRaw reported no white level for it";
  return null;
}

/** The Bayer layout, or null for X-Trans (settled from a flat's levels). */
export function bayerOf(info: FrameInfo): CfaPattern | null {
  return info.filters === XTRANS_FILTERS ? null : bayerPattern(info.filters);
}

/** The visible part of a readout, row-major, in sensor orientation. */
export function visibleMosaic(readout: RawReadout): { mosaic: Uint16Array; width: number; height: number } {
  const { width, height } = visibleSize(readout);
  const mosaic = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) {
    const from = (y + readout.top_margin) * readout.raw_width + readout.left_margin;
    mosaic.set(readout.data.subarray(from, from + width), y * width);
  }
  return { mosaic, width, height };
}

/** The white balance multipliers LibRaw scales by: as shot when usable, else
 *  daylight; a three-colour sensor's second green is its first. Normalized to
 *  the smallest, which is how Safelight's decode leaves the channels (it undoes
 *  the highlight mode's normalization to the largest). R, G, B. */
export function decodeMultipliers(info: Pick<FrameInfo, "camMul" | "preMul">): [number, number, number] {
  const usable = info.camMul[0] > 0 && info.camMul[2] > 0;
  const m = usable ? info.camMul : info.preMul;
  const r = m[0] > 0 ? m[0] : 1;
  const g = m[1] > 0 ? m[1] : 1;
  const b = m[2] > 0 ? m[2] : 1;
  const low = Math.min(r, g, b);
  return [r / low, g / low, b / low];
}
