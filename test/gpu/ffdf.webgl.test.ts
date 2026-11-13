// The stage on Safelight's real renderer (run with `npm run test:gpu`, which
// copies this file into a SafeLight checkout and runs it under its headless
// Chromium + SwiftShader rig). What the CPU suite cannot check:
//  • core's stage contract takes the stage without a warning, and the GLSL
//    compiles with the host's namespacing;
//  • the masters reach the stage as texture variants the photo's bag names,
//    and a variant the renderer holds no data for changes nothing;
//  • off, and on a bitmap source, the frame is exactly as without the stage;
//  • the hot pixel repair, the dark's pattern, the flat's correction and the
//    clip control land on the CPU model (test/reference.ts) at every pixel,
//    through the orientation, with and without the RAW baseline.

import { describe, expect, it } from "vitest";
import { CURRENT_PROCESS_VERSION } from "@/catalog/types";
import { checkStageContract } from "@/extensions/stage-validation";
import type { ProcessingStageContribution, StageTextureData } from "@/extensions/types";
import type { ResolvedPipeline } from "@/rendering/webgl/resolved-pipeline";
import { OPEN_PROBE, floatImage, identityParams, withRenderer, type Frame } from "@/rendering/webgl/webgl.test-support";
import type { DarkMaster } from "@ffdf/dark";
import type { Grid } from "@ffdf/grid";
import { columnMajor3, invert3, unbaseline, workingFromSensor } from "@ffdf/model";
import { columnMajor, sensorFromSource, type Affine } from "@ffdf/orient";
import { packDark, packFlat, signature } from "@ffdf/pack";
import { EXT_ID, IDENTITY3, STAGE_ID, TEXTURE_KEYS, UNIFORM_KEYS, VARIANT_KEYS } from "@ffdf/params";
import { correctionStage } from "@ffdf/stage";
import { referenceFrame, type FrameSetup, type RgbFrame } from "@ffdf-test/reference";

const SW = 96;
const SH = 64;
const BASE_PROBE: ResolvedPipeline = { ...OPEN_PROBE, id: "test.base-probe", sig: "test.base-probe", skipBaseCurve: false };
const STAGES = (): ProcessingStageContribution[] => [correctionStage()];

const half = (v: number) => Math.round(v * 1024) / 1024;
const HOT = [[20, 10], [61, 40], [80, 5]];

const DARK: DarkMaster = {
  width: SW,
  height: SH,
  glow: {
    block: 8,
    width: 12,
    height: 8,
    data: Float32Array.from({ length: 12 * 8 * 3 }, (_, i) => (Math.floor(i / 3) % 12 + (i % 3) * 4 + 8) / 8192),
  },
  cols: Float32Array.from({ length: SW }, (_, x) => (x % 7 === 0 ? 24 : 0) / 16384),
  rows: Float32Array.from({ length: SH }, (_, y) => (y % 11 === 3 ? 12 : 0) / 16384),
  hot: Uint32Array.from(HOT.map(([x, y]) => y * SW + x)),
  level: 0,
  noise: 0,
  blackEstimated: false,
};

const FLAT: Grid = {
  block: 6,
  width: 16,
  height: 11,
  data: Float32Array.from({ length: 16 * 11 * 3 }, (_, i) => {
    const cell = Math.floor(i / 3);
    const dx = (cell % 16) - 7.5;
    const dy = Math.floor(cell / 16) - 5;
    return 1 + Math.round((dx * dx + dy * dy) * (i % 3 === 0 ? 4 : 3)) / 1024;
  }),
};

const INFO = { rgbCam: [[1.7, -0.55, -0.15], [-0.2, 1.55, -0.35], [0.02, -0.45, 1.43]] as const, camMul: [2.1, 1, 1.6, 0], preMul: [2, 1, 1.5, 0] };
const TO_WORKING = workingFromSensor(INFO, -0.5);
const TO_SENSOR = invert3(TO_WORKING);

const tex = (t: { data: Float32Array; width: number; height: number }, version = 1): StageTextureData => ({ ...t, format: "rgba16f", version });
const TEXTURES: Record<string, StageTextureData> = {
  [`${STAGE_ID}.${TEXTURE_KEYS.dark}#d1`]: tex(packDark(DARK, "d1")),
  [`${STAGE_ID}.${TEXTURE_KEYS.flat}#f1`]: tex(packFlat(FLAT, SW, SH, "f1")),
};

/** A smooth scene in half-float steps, with the hot sensels lit up. */
function scene(width: number, height: number, toSensorUv: Affine): RgbFrame {
  const data = new Float64Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const v = (y + 0.5) / height;
      const sx = Math.floor((toSensorUv[0] * u + toSensorUv[1] * v + toSensorUv[2]) * SW);
      const sy = Math.floor((toSensorUv[3] * u + toSensorUv[4] * v + toSensorUv[5]) * SH);
      const hot = HOT.some(([hx, hy]) => hx === sx && hy === sy) ? 0.3 : 0;
      data.set([half(0.06 + 0.35 * u + hot), half(0.1 + 0.25 * v + hot), half(0.08 + 0.2 * u * v + hot)], (y * width + x) * 3);
    }
  }
  return { width, height, data };
}

function bagFor(setup: { toSensorUv: Affine; dark: boolean; flat: boolean; clip: number }, darkVariant = "d1", flatVariant = "f1"): Record<string, unknown> {
  return {
    [UNIFORM_KEYS.darkOn]: setup.dark ? 1 : 0,
    [UNIFORM_KEYS.flatOn]: setup.flat ? 1 : 0,
    [UNIFORM_KEYS.pass]: setup.dark || setup.flat ? 1 : 0,
    [UNIFORM_KEYS.clip]: setup.clip,
    [UNIFORM_KEYS.toSensorUv]: columnMajor(setup.toSensorUv),
    [UNIFORM_KEYS.sensorSize]: [SW, SH],
    [UNIFORM_KEYS.toSensor]: columnMajor3(TO_SENSOR),
    [UNIFORM_KEYS.toWorking]: columnMajor3(TO_WORKING),
    [UNIFORM_KEYS.darkSig]: signature(darkVariant),
    [UNIFORM_KEYS.flatSig]: signature(flatVariant),
    [VARIANT_KEYS.dark]: darkVariant,
    [VARIANT_KEYS.flat]: flatVariant,
  };
}

function render(src: RgbFrame, bag: Record<string, unknown> | null, pipeline: ResolvedPipeline = OPEN_PROBE): Frame {
  return withRenderer({ stages: bag ? STAGES() : [], pipeline }, (renderer) => {
    renderer.setImage(floatImage(src.width, src.height, (x, y) => {
      const o = (y * src.width + x) * 3;
      return [src.data[o], src.data[o + 1], src.data[o + 2]];
    }));
    renderer.setStageTextures(TEXTURES);
    renderer.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION }));
    if (bag) renderer.setContributedParams(bag);
    const f = renderer.captureFloatFrame();
    if (!f) throw new Error("captureFloatFrame returned null");
    return f;
  });
}

/** The linear colour a baseline-toned frame came from. */
function linearOf(f: RgbFrame): RgbFrame {
  return { ...f, data: f.data.map(unbaseline) };
}

function asDrawn(f: Frame): RgbFrame {
  const data = new Float64Array(f.width * f.height * 3);
  for (let i = 0; i < f.width * f.height; i++) data.set([f.data[i * 4], f.data[i * 4 + 1], f.data[i * 4 + 2]], i * 3);
  return { width: f.width, height: f.height, data };
}

/** Worst |GPU − CPU| relative to the larger of 1 and the value. */
function worst(gpu: Frame, cpu: RgbFrame): { error: number; at: string } {
  let error = 0;
  let at = "";
  for (let i = 0; i < cpu.width * cpu.height; i++) {
    for (let c = 0; c < 3; c++) {
      const want = cpu.data[i * 3 + c];
      const e = Math.abs(gpu.data[i * 4 + c] - want) / Math.max(1, Math.abs(want));
      if (e > error) {
        error = e;
        at = `${i % cpu.width},${Math.floor(i / cpu.width)}[${c}] gpu ${gpu.data[i * 4 + c]} cpu ${want}`;
      }
    }
  }
  return { error, at };
}

const ORIENTATIONS: [string, Affine, number, number][] = [
  ["upright", sensorFromSource(0, 0), SW, SH],
  ["flip 6", sensorFromSource(6, 0), SH, SW],
  ["flip 3, turned 90", sensorFromSource(3, 90), SH, SW],
];

describe("Flat field and dark frame on the GPU", () => {
  it("passes core's stage contract without a warning", () => {
    expect(checkStageContract(correctionStage(), EXT_ID)).toMatchObject({ error: null, warnings: [] });
  });

  const plain = scene(SW, SH, sensorFromSource(0, 0));

  it("leaves the frame exactly as it was while off", () => {
    const without = render(plain, null);
    const off = render(plain, bagFor({ toSensorUv: sensorFromSource(0, 0), dark: false, flat: false, clip: 0 }));
    expect(Array.from(off.data)).toEqual(Array.from(without.data));
  });

  it("changes nothing when the photo names variants the renderer holds no data for", () => {
    const without = render(plain, null);
    const missing = render(plain, bagFor({ toSensorUv: sensorFromSource(0, 0), dark: true, flat: true, clip: 0 }, "nodata1", "nodata2"));
    expect(Array.from(missing.data)).toEqual(Array.from(without.data));
  });

  it("changes nothing on the plain texture names, the variants' only", () => {
    const without = render(plain, null);
    const bag = bagFor({ toSensorUv: sensorFromSource(0, 0), dark: true, flat: true, clip: 0 });
    delete bag[VARIANT_KEYS.dark];
    delete bag[VARIANT_KEYS.flat];
    expect(Array.from(render(plain, bag).data)).toEqual(Array.from(without.data));
  });

  for (const [name, m, fw, fh] of ORIENTATIONS) {
    for (const [pipelineName, pipeline, baseCurve] of [["linear", OPEN_PROBE, false], ["baseline", BASE_PROBE, true]] as const) {
      for (const [what, dark, flat, clip] of [["dark", true, false, 0], ["flat", false, true, 0], ["both, clip 0.7", true, true, 0.7]] as const) {
        it(`lands on the model: ${what}, ${name}, ${pipelineName}`, () => {
          const src = scene(fw, fh, m);
          const gpu = render(src, bagFor({ toSensorUv: m, dark, flat, clip }), pipeline);
          const setup: FrameSetup = {
            toSensorUv: m,
            sensor: { width: SW, height: SH },
            toSensor: TO_SENSOR,
            toWorking: TO_WORKING,
            dark: dark ? DARK : null,
            flat: flat ? FLAT : null,
            clip,
            baseCurve,
          };
          // With the baseline on, the frame is compared with the source corrected
          // on the CPU and drawn without the stage: the pipeline after it is the same.
          const cpu = baseCurve ? asDrawn(render(linearOf(referenceFrame(src, setup)), null, pipeline)) : referenceFrame(src, setup);
          const e = worst(gpu, cpu);
          console.log(`[ffdf-gpu] ${what}, ${name}, ${pipelineName}: ${e.error.toExponential(2)} at ${e.at}`);
          expect(gpu.data.every(Number.isFinite)).toBe(true);
          expect(e.error).toBeLessThan(3e-3);
        });
      }
    }
  }

  it("holds a bright corner back with clip control, where the flat would lift it past white", () => {
    const m = sensorFromSource(0, 0);
    const base = scene(SW, SH, m);
    // An exposure bias of +1 EV puts sensor white at 0.5 in the frame, below
    // where core's highlight handling after the stage starts.
    const toWorking = workingFromSensor(INFO, 1);
    const toSensor = invert3(toWorking);
    const bright: RgbFrame = { ...base, data: base.data.map((v) => half(Math.min(0.45, v * 0.9))) };
    const setup = (clip: number): FrameSetup => ({ toSensorUv: m, sensor: { width: SW, height: SH }, toSensor, toWorking, dark: null, flat: FLAT, clip, baseCurve: false });
    const unclipped = referenceFrame(bright, setup(0));
    expect(Math.max(...unclipped.data)).toBeGreaterThan(0.51);
    const bag = { ...bagFor({ toSensorUv: m, dark: false, flat: true, clip: 1 }), [UNIFORM_KEYS.toSensor]: columnMajor3(toSensor), [UNIFORM_KEYS.toWorking]: columnMajor3(toWorking) };
    const gpu = render(bright, bag);
    const want = referenceFrame(bright, setup(1));
    const e = worst(gpu, want);
    console.log(`[ffdf-gpu] clip control 1: ${e.error.toExponential(2)} at ${e.at}`);
    expect(e.error).toBeLessThan(3e-3);
  });

  it("repairs the hot pixels it lists", () => {
    const m = sensorFromSource(0, 0);
    const gpu = render(plain, bagFor({ toSensorUv: m, dark: true, flat: false, clip: 0 }));
    for (const [x, y] of HOT) {
      const o = (y * SW + x) * 4;
      expect(gpu.data[o]).toBeLessThan(plain.data[(y * SW + x) * 3] - 0.2);
    }
  });

  it("takes no stage texture for the identity mapping it needs nothing from", () => {
    expect(IDENTITY3).toEqual(columnMajor(sensorFromSource(0, 0)));
  });
});
