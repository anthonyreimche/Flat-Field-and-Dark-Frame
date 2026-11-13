// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// The calibration library's records and how a master is built from frames.
// Building reads one frame at a time (`read`), so only the running sum and
// the frame being read are in memory.

import { bayerOf, unsupportedReason, type FrameInfo, type RawReadout } from "./frame";
import { fitXtrans, phaseMeans, type CfaPattern } from "./cfa";
import { FrameMean, buildDark, type DarkMaster } from "./dark";
import { buildFlat, type FlatMaster } from "./flat";
import { blackLevels, maskedBlack, median, type BlackSource } from "./levels";
import { sameCamera, sameFrame, sameLens, type Shot } from "./match";
import { visibleMosaic } from "./frame";

export type MasterKind = "dark" | "flat";

export interface FrameSummary {
  name: string;
  iso: number;
  shutter: number;
  aperture: number;
  focal: number;
  temperature: number | null;
  timestamp: number | null;
}

export interface MasterSummary {
  id: string;
  kind: MasterKind;
  created: number;
  /** What matching goes by: the camera, frame and lens, and the frames' median settings. */
  shot: Shot;
  frames: FrameSummary[];
  black: [number, number, number];
  blackSource: BlackSource | "frame";
  white: number;
  /** Plain-language notes on how the master was made, for the library. */
  notes: string[];
  /** Darks: hot sensels found and the median dark signal (range units). Flats:
   *  the strongest correction, corner against centre. */
  hot?: number;
  level?: number;
  strongest?: number;
}

export interface MasterRecord {
  summary: MasterSummary;
  dark?: DarkMaster;
  flat?: FlatMaster;
}

export function shotOf(info: FrameInfo): Shot {
  return {
    make: info.make,
    model: info.model,
    lens: info.lens,
    iso: info.iso,
    shutter: info.shutter,
    aperture: info.aperture,
    focal: info.focal,
    temperature: info.temperature,
    timestamp: info.timestamp,
    width: info.width,
    height: info.height,
  };
}

/** One frame as `read` hands it over. */
export interface ReadFrame {
  name: string;
  info: FrameInfo;
  readout: RawReadout;
}

export class BuildError extends Error {}

const medianOr = (values: number[]) => (values.length ? median(values) : 0);

function settingsOf(frames: FrameSummary[], first: Shot): Shot {
  const temps = frames.map((f) => f.temperature).filter((t): t is number => t !== null);
  const stamps = frames.map((f) => f.timestamp).filter((t): t is number => t !== null);
  return {
    ...first,
    iso: medianOr(frames.map((f) => f.iso)),
    shutter: medianOr(frames.map((f) => f.shutter)),
    aperture: medianOr(frames.map((f) => f.aperture)),
    focal: medianOr(frames.map((f) => f.focal)),
    temperature: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
    timestamp: stamps.length ? Math.max(...stamps) : null,
  };
}

/** Build a master from `count` frames, read in turn by `read(i)`. Every frame
 *  must come from the first frame's camera at its frame size (and, for a flat,
 *  its lens), or the build stops with a BuildError naming the frame. */
export async function buildMaster(
  kind: MasterKind,
  count: number,
  read: (index: number) => Promise<ReadFrame>,
  id: string,
  now = Date.now(),
): Promise<MasterRecord> {
  if (count < 1) throw new BuildError("Pick at least one frame.");
  const sum = new FrameMean();
  const frames: FrameSummary[] = [];
  let first: { info: FrameInfo; readout: RawReadout; shot: Shot } | null = null;
  for (let i = 0; i < count; i++) {
    const { name, info, readout } = await read(i);
    const why = unsupportedReason(info);
    if (why) throw new BuildError(`${name} can't be used: ${why}.`);
    const shot = shotOf(info);
    if (first) {
      if (!sameCamera(first.shot, shot)) throw new BuildError(`${name} is from another camera (${shot.make} ${shot.model}).`);
      if (!sameFrame(first.shot, shot)) throw new BuildError(`${name} has another frame size (${shot.width} × ${shot.height}).`);
      if (kind === "flat" && !sameLens(first.shot, shot)) throw new BuildError(`${name} was shot with another lens (${shot.lens || "none recorded"}).`);
    } else {
      first = { info, readout, shot };
    }
    const visible = visibleMosaic(readout);
    sum.add({ width: visible.width, height: visible.height, data: visible.mosaic });
    frames.push({ name, iso: shot.iso, shutter: shot.shutter, aperture: shot.aperture, focal: shot.focal, temperature: shot.temperature, timestamp: shot.timestamp });
  }
  if (!first) throw new BuildError("Pick at least one frame.");
  const { info, readout } = first;
  const width = sum.width;
  const height = sum.height;
  const notes: string[] = [];
  const bayer = bayerOf(info);
  const levels = blackLevels(info.black, maskedBlack(readout, bayer));
  if (levels.source === "masked") notes.push("Black level measured from the sensor's masked border.");
  const mean = sum.mean();
  const summary: MasterSummary = {
    id,
    kind,
    created: now,
    shot: settingsOf(frames, first.shot),
    frames,
    black: levels.black,
    blackSource: levels.source,
    white: info.white,
    notes,
  };

  if (kind === "dark") {
    const dark = buildDark(mean, width, height, bayer, levels.black, info.white);
    if (dark.blackEstimated) {
      summary.blackSource = "frame";
      notes.push("The file's black level didn't fit these frames, so their own median level stands in for it: dark current that is even across the frame isn't taken off.");
    }
    if (!bayer) notes.push("X-Trans: the dark's glow is taken off all colours alike.");
    summary.hot = dark.hot.length;
    summary.level = dark.level;
    return { summary, dark };
  }

  let pattern: CfaPattern;
  let redBlueKnown = true;
  if (bayer) {
    pattern = bayer;
  } else {
    const fit = fitXtrans(phaseMeans(mean, width, height, levels.black[1]), info.camMul);
    pattern = fit.pattern;
    redBlueKnown = fit.redBlueKnown;
    if (!redBlueKnown) notes.push("X-Trans: red and blue read too alike to tell apart, so their shading is corrected together.");
  }
  const flat = buildFlat(mean, width, height, pattern, levels.black, redBlueKnown);
  const lowest = Math.min(...flat.grid.data.filter((v) => v > 1));
  const centre = flat.grid.data[(Math.floor(flat.grid.height / 2) * flat.grid.width + Math.floor(flat.grid.width / 2)) * 3 + 1];
  summary.strongest = lowest > 0 && centre > 0 ? centre / lowest : undefined;
  return { summary, flat };
}

/** A label for a master: what it is and what it was shot at. */
export function masterLabel(s: MasterSummary): string {
  const parts = [s.kind === "dark" ? "Dark" : "Flat"];
  if (s.kind === "flat" && s.shot.lens) parts.push(s.shot.lens);
  if (s.kind === "flat" && s.shot.focal > 0) parts.push(`${Math.round(s.shot.focal)} mm`);
  if (s.kind === "flat" && s.shot.aperture > 0) parts.push(`f/${s.shot.aperture.toFixed(1).replace(/\.0$/, "")}`);
  if (s.kind === "dark" && s.shot.iso > 0) parts.push(`ISO ${Math.round(s.shot.iso)}`);
  if (s.kind === "dark" && s.shot.shutter > 0) parts.push(formatShutter(s.shot.shutter));
  return parts.join(" · ");
}

export function formatShutter(s: number): string {
  if (s >= 0.5) return `${Number(s.toFixed(1))} s`;
  return `1/${Math.round(1 / s)} s`;
}
