// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// One decode stage, first among the decode stages so later ones (RAW
// Denoise, Capture Sharpening) work on the corrected photo. Off, or on a
// photo with no matching master, it is dormant and costs nothing.

import { HELPERS, INLINE_GLSL, PASS_GLSL } from "./glsl";
import { DEFAULT_TO_SENSOR, DEFAULT_TO_WORKING, IDENTITY3, NO_SIGNATURE, STAGE_ID, TEXTURE_KEYS } from "./params";
import type { ProcessingStageContribution } from "./safelight";

export const STAGE_PRIORITY = 1;

export function correctionStage(): ProcessingStageContribution {
  return {
    id: STAGE_ID,
    name: "Flat field and dark frame",
    phase: "decode",
    priority: STAGE_PRIORITY,
    presetScope: "per-image",
    uniforms: [
      { key: "darkOn", glslType: "float", default: 0, range: { min: 0, max: 1 } },
      { key: "flatOn", glslType: "float", default: 0, range: { min: 0, max: 1 } },
      { key: "clip", glslType: "float", default: 0, range: { min: 0, max: 1 } },
      { key: "pass", glslType: "float", default: 0, range: { min: 0, max: 1 } },
      { key: "toSensorUv", glslType: "mat3", default: IDENTITY3 },
      { key: "sensorSize", glslType: "vec2", default: [0, 0] },
      { key: "toSensor", glslType: "mat3", default: DEFAULT_TO_SENSOR },
      { key: "toWorking", glslType: "mat3", default: DEFAULT_TO_WORKING },
      { key: "darkSig", glslType: "vec2", default: NO_SIGNATURE },
      { key: "flatSig", glslType: "vec2", default: NO_SIGNATURE },
    ],
    textures: [
      { key: TEXTURE_KEYS.dark, kind: "dynamic", format: "rgba16f" },
      { key: TEXTURE_KEYS.flat, kind: "dynamic", format: "rgba16f" },
    ],
    passes: [
      {
        glsl: PASS_GLSL,
        uniforms: [{ key: "pass", glslType: "float", default: 0, range: { min: 0, max: 1 } }],
        iterations: { key: "pass", max: 1 },
      },
    ],
    reads: "source",
    helpers: HELPERS,
    glsl: INLINE_GLSL,
    dormantWhen: { darkOn: 0, flatOn: 0 },
  };
}
