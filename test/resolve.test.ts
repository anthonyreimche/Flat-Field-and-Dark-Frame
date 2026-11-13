// From choices, a photo and the library to the stage's mirrors and the panel's words.

import { describe, expect, it } from "vitest";
import type { FrameInfo } from "../src/frame";
import type { MasterSummary } from "../src/library";
import { shotOf } from "../src/library";
import { columnMajor, sensorFromSource } from "../src/orient";
import { signature } from "../src/pack";
import { DEFAULT_CHOICES, UNIFORM_KEYS, VARIANT_KEYS, readChoices, choicePatch } from "../src/params";
import { NOT_RAW, changed, darkVariant, flatVariant, resolve } from "../src/resolve";
import { RGGB } from "./synthetic";

const INFO: FrameInfo = {
  make: "Canon", model: "EOS R5", lens: "RF24-105mm F4 L IS USM", iso: 100, shutter: 1 / 60, aperture: 8, focal: 24,
  temperature: null, timestamp: null, width: 8192, height: 5464, flip: 6, filters: RGGB, black: 0, white: 16383,
  camMul: [2, 1, 1.5, 0], preMul: [2, 1, 1.5, 0], rgbCam: null,
};
const summary = (id: string, kind: "dark" | "flat", over: Partial<FrameInfo> = {}): MasterSummary => ({
  id, kind, created: 0, shot: shotOf({ ...INFO, ...over }), frames: [], black: [2048, 2048, 2048], blackSource: "masked", white: 16383, notes: [],
});
const facts = { isRaw: true, rotation: 90, orientation: 6, rawExposureBias: undefined };
const sensor = { info: INFO, unsupported: null } as const;
const masters = [summary("d1", "dark"), summary("f1", "flat"), summary("f2", "flat", { model: "EOS R6" })];

describe("resolve", () => {
  it("costs nothing and says nothing with both corrections off", () => {
    const r = resolve(DEFAULT_CHOICES, facts, sensor, masters);
    expect(r.status).toEqual({ blocked: null, reading: false, dark: { state: "off" }, flat: { state: "off" } });
    expect(r.mirrors[UNIFORM_KEYS.pass]).toBe(0);
  });

  it("names the matched variants, signs them, and maps the frame to the sensor", () => {
    const r = resolve({ ...DEFAULT_CHOICES, dark: true, flat: true, blur: "horizontal", radius: 40 }, facts, sensor, masters);
    expect(r.mirrors[VARIANT_KEYS.dark]).toBe(darkVariant("d1"));
    expect(r.mirrors[VARIANT_KEYS.flat]).toBe(flatVariant("f1", "horizontal", 40));
    expect(r.mirrors[UNIFORM_KEYS.flatSig]).toEqual(signature(flatVariant("f1", "horizontal", 40)));
    expect(r.mirrors[UNIFORM_KEYS.toSensorUv]).toEqual(columnMajor(sensorFromSource(6, 0)));
    expect(r.mirrors[UNIFORM_KEYS.sensorSize]).toEqual([8192, 5464]);
    expect(r.flatNeed).toEqual({ id: "f1", blur: "horizontal", radius: 40, name: flatVariant("f1", "horizontal", 40) });
  });

  it("honours a pick, and says when the pick doesn't fit the photo", () => {
    const pick = resolve({ ...DEFAULT_CHOICES, flat: true, flatPick: "f2" }, facts, sensor, masters);
    expect(pick.status.flat).toEqual({ state: "none", reason: "It's from another camera." });
    expect(resolve({ ...DEFAULT_CHOICES, dark: true, darkPick: "gone" }, facts, sensor, masters).status.dark).toMatchObject({ state: "none", reason: expect.stringMatching(/no longer in the library/) });
  });

  it("blocks rendered files and unreadable RAWs, and waits while one is read", () => {
    const on = { ...DEFAULT_CHOICES, dark: true };
    expect(resolve(on, { ...facts, isRaw: false }, sensor, masters).status.blocked).toBe(NOT_RAW);
    expect(resolve(on, facts, { info: null, unsupported: "its sensor has no colour filter mosaic" }, masters).status.blocked).toMatch(/no colour filter/);
    expect(resolve(on, facts, null, masters).status.reading).toBe(true);
  });

  it("writes only what changed", () => {
    expect(changed({ a: [1, 2], b: 3 }, { a: [1, 2], b: 3 })).toBeNull();
    expect(changed({ a: [1, 2], b: 3 }, { a: [1, 3], b: 3 })).toEqual({ a: [1, 3] });
  });

  it("reads choices back from a bag, clamped", () => {
    const bag = choicePatch({ dark: true, radius: 999, clip: 3, blur: "vertical" });
    expect(readChoices((k) => bag[k])).toMatchObject({ dark: true, flat: false, radius: 200, clip: 1, blur: "vertical", darkPick: "auto" });
  });
});
