// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// The photo's edit: what the person chose (corrections on, which master or
// automatic, the flat's blur and clip control) and, beside it, what the stage
// reads, which the controller works out from those choices, the photo and the
// library. Everything lives in the photo's param bag, so undo, copy and paste,
// thumbnails and exports carry it.

import { BLUR_TYPES, DEFAULT_BLUR_RADIUS, MAX_BLUR_RADIUS, type BlurType } from "./flat";
import { MEDIAN_RGB_CAM, columnMajor3, invert3 } from "./model";

export const EXT_ID = "flat-field-dark-frame";
export const STAGE_ID = `${EXT_ID}.correct`;
export const PANEL_ID = `${EXT_ID}.panel`;

export const qualified = (key: string) => `${STAGE_ID}.${key}`;

/** The stage's two textures; the bag names the variant under each key. */
export const TEXTURE_KEYS = { dark: "darkMaster", flat: "flatMaster" } as const;

/** "auto" or a master's id. */
export type Pick = string;
export const AUTO: Pick = "auto";

export interface Choices {
  dark: boolean;
  darkPick: Pick;
  flat: boolean;
  flatPick: Pick;
  blur: BlurType;
  radius: number;
  /** 0..1. */
  clip: number;
}

export const DEFAULT_CHOICES: Choices = {
  dark: false,
  darkPick: AUTO,
  flat: false,
  flatPick: AUTO,
  blur: "area",
  radius: DEFAULT_BLUR_RADIUS,
  clip: 0,
};

/** Bag keys of the choices that aren't uniforms. */
export const CHOICE_KEYS = {
  darkPick: qualified("darkPick"),
  flatPick: qualified("flatPick"),
  blur: qualified("blur"),
  radius: qualified("radius"),
} as const;

export const UNIFORM_KEYS = {
  darkOn: qualified("darkOn"),
  flatOn: qualified("flatOn"),
  clip: qualified("clip"),
  pass: qualified("pass"),
  toSensorUv: qualified("toSensorUv"),
  sensorSize: qualified("sensorSize"),
  toSensor: qualified("toSensor"),
  toWorking: qualified("toWorking"),
  darkSig: qualified("darkSig"),
  flatSig: qualified("flatSig"),
} as const;

export const VARIANT_KEYS = { dark: qualified(TEXTURE_KEYS.dark), flat: qualified(TEXTURE_KEYS.flat) } as const;

/** The matrices' defaults: the median camera, column-major. */
export const DEFAULT_TO_WORKING = columnMajor3(MEDIAN_RGB_CAM);
export const DEFAULT_TO_SENSOR = columnMajor3(invert3(MEDIAN_RGB_CAM));
export const IDENTITY3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** No variant is signed with these. */
export const NO_SIGNATURE = [-1, -1];

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export function readChoices(get: (key: string) => unknown): Choices {
  const blur = get(CHOICE_KEYS.blur);
  const darkPick = get(CHOICE_KEYS.darkPick);
  const flatPick = get(CHOICE_KEYS.flatPick);
  return {
    dark: num(get(UNIFORM_KEYS.darkOn), 0) > 0.5,
    darkPick: typeof darkPick === "string" && darkPick ? darkPick : AUTO,
    flat: num(get(UNIFORM_KEYS.flatOn), 0) > 0.5,
    flatPick: typeof flatPick === "string" && flatPick ? flatPick : AUTO,
    blur: BLUR_TYPES.includes(blur as BlurType) ? (blur as BlurType) : DEFAULT_CHOICES.blur,
    radius: Math.min(MAX_BLUR_RADIUS, Math.max(0, Math.round(num(get(CHOICE_KEYS.radius), DEFAULT_CHOICES.radius)))),
    clip: Math.min(1, Math.max(0, num(get(UNIFORM_KEYS.clip), 0))),
  };
}

/** The bag entries for a set of choices. */
export function choicePatch(c: Partial<Choices>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (c.dark !== undefined) patch[UNIFORM_KEYS.darkOn] = c.dark ? 1 : 0;
  if (c.flat !== undefined) patch[UNIFORM_KEYS.flatOn] = c.flat ? 1 : 0;
  if (c.darkPick !== undefined) patch[CHOICE_KEYS.darkPick] = c.darkPick;
  if (c.flatPick !== undefined) patch[CHOICE_KEYS.flatPick] = c.flatPick;
  if (c.blur !== undefined) patch[CHOICE_KEYS.blur] = c.blur;
  if (c.radius !== undefined) patch[CHOICE_KEYS.radius] = c.radius;
  if (c.clip !== undefined) patch[UNIFORM_KEYS.clip] = c.clip;
  return patch;
}

/** Every key the extension keeps in a bag, for Reset. */
export const ALL_KEYS: readonly string[] = [...Object.values(CHOICE_KEYS), ...Object.values(UNIFORM_KEYS), ...Object.values(VARIANT_KEYS)];
