// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// From a photo's choices, its sensor details and the library to what the
// stage reads (the bag's mirrors and the texture variants it names), and to
// what the panel says. Pure, so the matching and the mirrors are tested
// without LibRaw or a GPU.

import type { BlurType } from "./flat";
import { matchDark, matchFlat, pickedFits } from "./match";
import type { MasterSummary } from "./library";
import { columnMajor3, invert3, workingFromSensor } from "./model";
import { columnMajor, manualTurn, sensorFromSource } from "./orient";
import { signature } from "./pack";
import { AUTO, NO_SIGNATURE, UNIFORM_KEYS, VARIANT_KEYS, type Choices } from "./params";
import type { PhotoSensor } from "./storage";
import { shotOf } from "./library";

export type Side =
  | { state: "off" }
  | { state: "matched"; master: MasterSummary; auto: boolean }
  | { state: "none"; reason: string };

export interface PhotoStatus {
  /** Why the photo can't be corrected at all, or null. */
  blocked: string | null;
  /** True while its sensor details are being read. */
  reading: boolean;
  dark: Side;
  flat: Side;
}

export const NOT_RAW = "Flat field and dark frame correction works on RAW photos only: a JPEG, TIFF or other rendered file has no sensor data left to correct.";

export interface PhotoFacts {
  isRaw: boolean;
  rotation: number | undefined;
  orientation: number | undefined;
  rawExposureBias: number | undefined;
}

const BLUR_CODES: Record<BlurType, string> = { area: "a", vertical: "v", horizontal: "h", "vertical-horizontal": "x" };

export const darkVariant = (id: string) => `d${id}`;

/** The master a dark variant's name was made from (darkVariant's inverse), or
 *  null for anything else. */
export function parseDarkVariant(name: unknown): string | null {
  const m = typeof name === "string" ? /^d([^-]+)$/.exec(name) : null;
  return m ? m[1] : null;
}
export const flatVariant = (id: string, blur: BlurType, radius: number) => `f${id}-${BLUR_CODES[blur]}${radius}`;

export interface FlatNeed {
  id: string;
  blur: BlurType;
  radius: number;
  name: string;
}

const BLUR_OF_CODE = new Map(Object.entries(BLUR_CODES).map(([blur, code]) => [code, blur as BlurType]));

/** The master, blur and radius a flat variant's name was made from
 *  (flatVariant's inverse), or null for anything else. */
export function parseFlatVariant(name: unknown): FlatNeed | null {
  const m = typeof name === "string" ? /^f([^-]+)-([a-z])(\d{1,4})$/.exec(name) : null;
  const blur = m ? BLUR_OF_CODE.get(m[2]) : undefined;
  return m && blur ? { id: m[1], blur, radius: Number(m[3]), name: m[0] } : null;
}

export interface Resolution {
  status: PhotoStatus;
  /** The bag entries the stage reads. */
  mirrors: Record<string, unknown>;
  /** The flat variant the photo draws with, which must have been supplied. */
  flatNeed: FlatNeed | null;
}

function side(on: boolean, pick: string, find: () => ReturnType<typeof matchDark>, masters: readonly MasterSummary[], photo: Parameters<typeof pickedFits>[0], kind: "dark" | "flat"): Side {
  if (!on) return { state: "off" };
  if (pick !== AUTO) {
    const m = masters.find((x) => x.id === pick && x.kind === kind);
    if (!m) return { state: "none", reason: `The ${kind === "dark" ? "dark frame" : "flat field"} picked for this photo is no longer in the library.` };
    const misfit = pickedFits(photo, m);
    return misfit ? { state: "none", reason: misfit } : { state: "matched", master: m, auto: false };
  }
  const r = find();
  return r.master ? { state: "matched", master: r.master, auto: true } : { state: "none", reason: r.reason };
}

const OFF_MIRRORS: Record<string, unknown> = {
  [UNIFORM_KEYS.pass]: 0,
  [UNIFORM_KEYS.darkSig]: NO_SIGNATURE,
  [UNIFORM_KEYS.flatSig]: NO_SIGNATURE,
  [VARIANT_KEYS.dark]: "",
  [VARIANT_KEYS.flat]: "",
};

export function resolve(choices: Choices, facts: PhotoFacts, sensor: PhotoSensor | null, masters: readonly MasterSummary[]): Resolution {
  const off: PhotoStatus = { blocked: null, reading: false, dark: { state: "off" }, flat: { state: "off" } };
  if (!choices.dark && !choices.flat) return { status: off, mirrors: OFF_MIRRORS, flatNeed: null };
  if (!facts.isRaw) return { status: { ...off, blocked: NOT_RAW }, mirrors: OFF_MIRRORS, flatNeed: null };
  if (!sensor) return { status: { ...off, reading: true }, mirrors: OFF_MIRRORS, flatNeed: null };
  if (!sensor.info) return { status: { ...off, blocked: `This photo can't be corrected: ${sensor.unsupported}.` }, mirrors: OFF_MIRRORS, flatNeed: null };

  const info = sensor.info;
  const shot = shotOf(info);
  const dark = side(choices.dark, choices.darkPick, () => matchDark(shot, masters), masters, shot, "dark");
  const flat = side(choices.flat, choices.flatPick, () => matchFlat(shot, masters), masters, shot, "flat");
  const status: PhotoStatus = { blocked: null, reading: false, dark, flat };
  if (dark.state !== "matched" && flat.state !== "matched") return { status, mirrors: OFF_MIRRORS, flatNeed: null };

  const toWorking = workingFromSensor(info, facts.rawExposureBias);
  const toSensor = invert3(toWorking);
  const darkName = dark.state === "matched" ? darkVariant(dark.master.id) : "";
  const flatNeed: FlatNeed | null =
    flat.state === "matched" ? { id: flat.master.id, blur: choices.blur, radius: choices.radius, name: flatVariant(flat.master.id, choices.blur, choices.radius) } : null;
  const mirrors: Record<string, unknown> = {
    [UNIFORM_KEYS.pass]: 1,
    [UNIFORM_KEYS.toSensorUv]: columnMajor(sensorFromSource(info.flip, manualTurn(facts.rotation, facts.orientation))),
    [UNIFORM_KEYS.sensorSize]: [info.width, info.height],
    [UNIFORM_KEYS.toSensor]: columnMajor3(toSensor),
    [UNIFORM_KEYS.toWorking]: columnMajor3(toWorking),
    [UNIFORM_KEYS.darkSig]: darkName ? signature(darkName) : NO_SIGNATURE,
    [UNIFORM_KEYS.flatSig]: flatNeed ? signature(flatNeed.name) : NO_SIGNATURE,
    [VARIANT_KEYS.dark]: darkName,
    [VARIANT_KEYS.flat]: flatNeed?.name ?? "",
  };
  return { status, mirrors, flatNeed };
}

/** The entries of `patch` that differ from what `bag` holds. */
export function changed(bag: Readonly<Record<string, unknown>>, patch: Readonly<Record<string, unknown>>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  let any = false;
  for (const [key, value] of Object.entries(patch)) {
    const held = bag[key];
    const same = Array.isArray(value) && Array.isArray(held) ? value.length === held.length && value.every((v, i) => v === held[i]) : held === value;
    if (!same) {
      out[key] = value;
      any = true;
    }
  }
  return any ? out : null;
}
