import { describe, expect, it } from "vitest";
import { XTRANS_BASE, bayerPattern, colourAt, fitXtrans, phaseMeans, xtransShift } from "../src/cfa";
import { BGGR, RGGB, mosaic } from "./synthetic";

describe("Bayer layout from LibRaw's filters", () => {
  it("reads RGGB and BGGR as LibRaw's FC does", () => {
    expect(bayerPattern(RGGB)?.colours).toEqual([0, 1, 1, 2]);
    expect(bayerPattern(BGGR)?.colours).toEqual([2, 1, 1, 0]);
  });

  it("folds the second green into green", () => {
    // RGBG with LibRaw's index 3 for the second green.
    expect(bayerPattern(0xb4b4b4b4)?.colours).toEqual([0, 1, 1, 2]);
  });

  it("refuses masks that aren't a Bayer layout", () => {
    expect(bayerPattern(0)).toBeNull();
    expect(bayerPattern(9)).toBeNull();
    expect(bayerPattern(0x55555555)).toBeNull();
  });
});

describe("X-Trans layout from a flat frame", () => {
  const level = [400, 800, 600];
  const flatOf = (dx: number, dy: number) => {
    const pattern = xtransShift(dx, dy);
    return { pattern, phases: phaseMeans(mosaic(60, 48, pattern, (_x, _y, c) => level[c]), 60, 48) };
  };

  it("keeps 20 green, 8 red and 8 blue sensels in every 6 × 6", () => {
    expect([0, 1, 2].map((c) => XTRANS_BASE.filter((v) => v === c).length)).toEqual([8, 20, 8]);
  });

  it("finds the shift, telling red from blue by the white balance", () => {
    for (const [dx, dy] of [[0, 0], [2, 5], [3, 1], [5, 3]]) {
      const { pattern, phases } = flatOf(dx, dy);
      // Red amplified more than blue: under a neutral flat red reads darker.
      const fit = fitXtrans(phases, [2, 1, 1.5, 0]);
      expect(fit.redBlueKnown).toBe(true);
      for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) expect(colourAt(fit.pattern, x, y)).toBe(colourAt(pattern, x, y));
    }
  });

  it("says when red and blue can't be told apart", () => {
    const pattern = xtransShift(1, 2);
    const phases = phaseMeans(mosaic(60, 48, pattern, (_x, _y, c) => (c === 1 ? 800 : 500)), 60, 48);
    expect(fitXtrans(phases, [1.8, 1, 1.5, 0]).redBlueKnown).toBe(false);
  });
});
