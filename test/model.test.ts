// The per-pixel correction on the CPU, the matching rules and the textures.

import { describe, expect, it } from "vitest";
import { decodeMultipliers } from "../src/frame";
import { buildMaster, type MasterSummary } from "../src/library";
import { matchDark, matchFlat, type Shot } from "../src/match";
import { baseline, clipFactor, correctPixel, invert3, mul3, repairWeight, unbaseline, workingFromSensor, type PixelInputs, type Vec3 } from "../src/model";
import { DARK_MAGIC, FLAT_MAGIC, HOT_REACH, MAX_PER_TILE, TILE, hotTiles, packDark, packFlat, signature } from "../src/pack";
import { bayerPattern } from "../src/cfa";
import { RGGB, mosaic } from "./synthetic";

const info = {
  rgbCam: [[1.7, -0.55, -0.15], [-0.2, 1.55, -0.35], [0.02, -0.45, 1.43]] as const,
  camMul: [2.1, 1, 1.6, 0],
  preMul: [2, 1, 1.5, 0],
};
const toWorking = workingFromSensor(info, -1);
const toSensor = invert3(toWorking);
const base: PixelInputs = { toSensor, toWorking, dark: null, flat: null, clip: 0, hot: 0, ring: [0, 0, 0], baseCurve: true };

describe("the decode's colour, back to sensor units", () => {
  it("is rgb_cam × white balance × the exposure bias the decode undid", () => {
    const w = decodeMultipliers(info);
    const e: Vec3 = [0.1, 0.2, 0.3];
    const lin = mul3(toWorking, e);
    const want = mul3(info.rgbCam, [e[0] * w[0] * 2, e[1] * w[1] * 2, e[2] * w[2] * 2]);
    lin.forEach((v, i) => expect(v).toBeCloseTo(want[i], 12));
  });

  it("undoes the baseline tone", () => {
    for (const x of [-0.2, 0, 0.001, 0.05, 0.18, 0.5, 0.99, 1, 3]) expect(unbaseline(baseline(x))).toBeCloseTo(x, 9);
  });
});

describe("one pixel", () => {
  const lin: Vec3 = [baseline(0.3), baseline(0.2), baseline(0.1)];

  it("changes nothing with every correction off", () => {
    correctPixel(lin, base).forEach((v, i) => expect(v).toBeCloseTo(lin[i], 12));
  });

  it("takes the dark's pattern off in sensor units, per colour", () => {
    const x = lin.map(unbaseline) as Vec3;
    const e = mul3(toSensor, x);
    const dark: Vec3 = [0.004, 0.002, 0.003];
    const want = mul3(toWorking, [e[0] - dark[0], e[1] - dark[1], e[2] - dark[2]]).map(baseline);
    correctPixel(lin, { ...base, dark }).forEach((v, i) => expect(v).toBeCloseTo(want[i], 9));
  });

  it("multiplies by the flat's correction in sensor units, whatever the white balance", () => {
    const flat: Vec3 = [1.4, 1.2, 1.3];
    const x = lin.map(unbaseline) as Vec3;
    const want = mul3(info.rgbCam, mul3(invert3(info.rgbCam), x).map((v, c) => v * flat[c])).map(baseline);
    correctPixel(lin, { ...base, flat }).forEach((v, i) => expect(v).toBeCloseTo(want[i], 9));
  });

  it("repairs a hot pixel from the ring around it", () => {
    const ring: Vec3 = [baseline(0.05), baseline(0.05), baseline(0.05)];
    correctPixel(lin, { ...base, hot: 1, ring }).forEach((v, i) => expect(v).toBeCloseTo(ring[i], 9));
  });

  it("holds the flat back from pushing a highlight past white", () => {
    expect(clipFactor([0.9, 0.5, 0.4], [1.35, 0.75, 0.6], 1)).toBeCloseTo(1 / 1.35, 12);
    expect(clipFactor([0.9, 0.5, 0.4], [1.35, 0.75, 0.6], 0)).toBe(1);
    expect(clipFactor([0.9, 0.5, 0.4], [1.35, 0.75, 0.6], 0.5)).toBeCloseTo(1 + (1 / 1.35 - 1) / 2, 12);
    expect(clipFactor([1.2, 0.5, 0.4], [1.8, 0.75, 0.6], 1)).toBeCloseTo(1.2 / 1.8, 12);
    expect(clipFactor([0.5, 0.5, 0.4], [0.75, 0.75, 0.6], 1)).toBe(1);
  });

  it("repairs fully near a hot sensel and fades out a sensel further", () => {
    expect(repairWeight(0.5, 1)).toBe(1);
    expect(repairWeight(1.5, 1)).toBe(1);
    expect(repairWeight(2.5, 1)).toBe(0);
    expect(repairWeight(2.5, 3)).toBe(1);
    expect(repairWeight(3, 3)).toBeCloseTo(0.5, 12);
  });
});

const shot = (s: Partial<Shot>): Shot => ({
  make: "Fujifilm",
  model: "X-T5",
  lens: "XF16mmF2.8 R WR",
  iso: 400,
  shutter: 1 / 100,
  aperture: 8,
  focal: 16,
  temperature: null,
  timestamp: null,
  width: 7728,
  height: 5152,
  ...s,
});
const master = (id: string, kind: "dark" | "flat", s: Partial<Shot>): MasterSummary => ({
  id,
  kind,
  created: 0,
  shot: shot(s),
  frames: [],
  black: [0, 0, 0],
  blackSource: "file",
  white: 1,
  notes: [],
});

describe("matching", () => {
  const masters = [
    master("d-iso800-30s", "dark", { iso: 800, shutter: 30 }),
    master("d-iso3200-30s", "dark", { iso: 3200, shutter: 30 }),
    master("d-iso800-60s", "dark", { iso: 800, shutter: 60 }),
    master("d-other", "dark", { model: "X-H2", iso: 800, shutter: 30 }),
    master("f-f8", "flat", { aperture: 8 }),
    master("f-f2.8", "flat", { aperture: 2.8 }),
    master("f-other-lens", "flat", { lens: "XF23mmF2 R WR", aperture: 8 }),
    master("f-crop", "flat", { width: 5000, height: 3333, aperture: 8 }),
  ];

  it("picks the dark nearest in ISO and exposure from the photo's camera", () => {
    expect(matchDark(shot({ iso: 1000, shutter: 25 }), masters).master?.id).toBe("d-iso800-30s");
    expect(matchDark(shot({ iso: 2500, shutter: 30 }), masters).master?.id).toBe("d-iso3200-30s");
    expect(matchDark(shot({ iso: 800, shutter: 50 }), masters).master?.id).toBe("d-iso800-60s");
  });

  it("weighs sensor temperature when both record it", () => {
    const warm = [master("cold", "dark", { temperature: 5 }), master("warm", "dark", { temperature: 30 })];
    expect(matchDark(shot({ temperature: 28 }), warm).master?.id).toBe("warm");
  });

  it("picks the flat with the photo's lens and nearest aperture", () => {
    expect(matchFlat(shot({ aperture: 7.1 }), masters).master?.id).toBe("f-f8");
    expect(matchFlat(shot({ aperture: 3.2 }), masters).master?.id).toBe("f-f2.8");
  });

  it("says why nothing matches", () => {
    expect(matchDark(shot({ model: "X100V" }), masters)).toMatchObject({ master: null, reason: expect.stringMatching(/X100V/) });
    expect(matchFlat(shot({ lens: "XF56mmF1.2 R" }), masters)).toMatchObject({ master: null, reason: expect.stringMatching(/XF56mm/) });
    expect(matchDark(shot({ width: 100, height: 100 }), masters)).toMatchObject({ master: null, reason: expect.stringMatching(/frame size/) });
  });
});

describe("textures", () => {
  it("files hot sensels under every tile a repair can reach, strongest first, a few a tile", () => {
    const tiles = hotTiles(Uint32Array.from([17 * 100 + 17, 2 * 100 + 2]), 100, 100);
    expect(tiles.get(1 * 7 + 1)).toEqual([1717]);
    expect(tiles.get(0)).toEqual([1717, 202]);
    const crowded = hotTiles(Uint32Array.from({ length: 20 }, (_, i) => 50 * 100 + 40 + i % TILE), 100, 100);
    for (const list of crowded.values()) expect(list.length).toBeLessThanOrEqual(MAX_PER_TILE);
    expect(HOT_REACH).toBeGreaterThanOrEqual(2);
  });

  it("marks each texture with its kind and variant", () => {
    const pattern = bayerPattern(RGGB)!;
    const sum = mosaic(64, 48, pattern, () => 600);
    const readout = { raw_width: 64, raw_height: 48, top_margin: 0, left_margin: 0, width: 64, height: 48, data: sum };
    const frameInfo = {
      make: "A", model: "B", lens: "", iso: 100, shutter: 1, aperture: 0, focal: 0, temperature: null, timestamp: null,
      width: 64, height: 48, flip: 0, filters: RGGB, black: 512, white: 4095, camMul: [2, 1, 1.5, 0], preMul: [2, 1, 1.5, 0], rgbCam: null,
    };
    return buildMaster("dark", 1, async () => ({ name: "d.raw", info: frameInfo, readout }), "m1").then((rec) => {
      const t = packDark(rec.dark!, "m1");
      expect(Array.from(t.data.slice(0, 4))).toEqual([DARK_MAGIC, ...signature("m1"), TILE]);
      const f = packFlat({ block: 6, width: 3, height: 2, data: new Float32Array(18).fill(1) }, 18, 12, "f1");
      expect(Array.from(f.data.slice(0, 4))).toEqual([FLAT_MAGIC, ...signature("f1"), 6]);
      expect(f.width).toBeGreaterThanOrEqual(4);
    });
  });

  it("tells variants apart by signature, in half-float-exact numbers", () => {
    const a = signature("dark-1");
    const b = signature("dark-2");
    expect(a).not.toEqual(b);
    for (const v of [...a, ...b]) expect(Number.isInteger(v) && v >= 0 && v < 2048).toBe(true);
  });
});
