// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// Which master suits a photo. A master only ever fits photos from its own
// camera at its own frame size (a crop mode reads another part of the sensor).
// Among those, as RawTherapee picks: for darks the nearest ISO and exposure
// time, then sensor temperature; for flats the same lens, then the nearest
// aperture and focal length. Ties go to the master shot closest in time.

import type { MasterSummary } from "./library";

export interface Shot {
  make: string;
  model: string;
  lens: string;
  iso: number;
  shutter: number;
  aperture: number;
  focal: number;
  temperature: number | null;
  timestamp: number | null;
  /** The visible frame in sensor orientation. */
  width: number;
  height: number;
}

export type MatchResult =
  | { master: MasterSummary; score: number }
  | { master: null; reason: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function sameCamera(a: Pick<Shot, "make" | "model">, b: Pick<Shot, "make" | "model">): boolean {
  return norm(a.model) !== "" && norm(a.make) === norm(b.make) && norm(a.model) === norm(b.model);
}

export function sameFrame(a: Pick<Shot, "width" | "height">, b: Pick<Shot, "width" | "height">): boolean {
  return a.width === b.width && a.height === b.height;
}

export function sameLens(a: Pick<Shot, "lens">, b: Pick<Shot, "lens">): boolean {
  return norm(a.lens) === norm(b.lens);
}

/** |log2| distance, 0 when either side is unknown. */
const stops = (a: number, b: number) => (a > 0 && b > 0 ? Math.abs(Math.log2(a / b)) : 0);
const days = (a: number | null, b: number | null) => (a !== null && b !== null ? Math.abs(a - b) / 86_400_000 : 0);

export function darkScore(photo: Shot, m: Shot): number {
  const temp = photo.temperature !== null && m.temperature !== null ? Math.abs(photo.temperature - m.temperature) / 5 : 0;
  return stops(photo.iso, m.iso) + stops(photo.shutter, m.shutter) + temp + days(photo.timestamp, m.timestamp) / 3650;
}

export function flatScore(photo: Shot, m: Shot): number {
  // An f-number's stops are twice its log2.
  return 2 * stops(photo.aperture, m.aperture) + stops(photo.focal, m.focal) + days(photo.timestamp, m.timestamp) / 3650;
}

function best(photo: Shot, candidates: readonly MasterSummary[], score: (p: Shot, m: Shot) => number): MatchResult {
  let pick: { master: MasterSummary; score: number } | null = null;
  for (const m of candidates) {
    const s = score(photo, m.shot);
    if (!pick || s < pick.score) pick = { master: m, score: s };
  }
  return pick ?? { master: null, reason: "no match" };
}

export function matchDark(photo: Shot, masters: readonly MasterSummary[]): MatchResult {
  const camera = masters.filter((m) => m.kind === "dark" && sameCamera(photo, m.shot));
  if (camera.length === 0) return { master: null, reason: `No dark frame from the ${photo.model || "camera"} yet.` };
  const frame = camera.filter((m) => sameFrame(photo, m.shot));
  if (frame.length === 0) return { master: null, reason: "No dark frame at this photo's frame size." };
  return best(photo, frame, darkScore);
}

export function matchFlat(photo: Shot, masters: readonly MasterSummary[]): MatchResult {
  const camera = masters.filter((m) => m.kind === "flat" && sameCamera(photo, m.shot));
  if (camera.length === 0) return { master: null, reason: `No flat field from the ${photo.model || "camera"} yet.` };
  const frame = camera.filter((m) => sameFrame(photo, m.shot));
  if (frame.length === 0) return { master: null, reason: "No flat field at this photo's frame size." };
  const lens = frame.filter((m) => sameLens(photo, m.shot));
  if (lens.length === 0) return { master: null, reason: photo.lens ? `No flat field with the ${photo.lens}.` : "No flat field without a recorded lens." };
  return best(photo, lens, flatScore);
}

/** A master the user picked for a photo, if it still fits it. */
export function pickedFits(photo: Shot, m: MasterSummary): string | null {
  if (!sameCamera(photo, m.shot)) return "It's from another camera.";
  if (!sameFrame(photo, m.shot)) return "It's at another frame size.";
  return null;
}
