// Frames, levels and orientation: what LibRaw hands over, read the way the
// decode reads it.

import { describe, expect, it } from "vitest";
import { bayerPattern } from "../src/cfa";
import { decodeMultipliers, frameInfoOf, unsupportedReason, visibleMosaic, visibleSize, type RawReadout } from "../src/frame";
import { blackLevels, maskedBlack } from "../src/levels";
import { apply, manualTurn, sensorFromSource } from "../src/orient";
import { RGGB } from "./synthetic";

/** LibRaw's output for a sensor of W × H: flip_index, as dcraw_make_mem_image copies. */
function librawOutput(sensor: number[], W: number, H: number, flip: number) {
  const swap = (flip & 4) !== 0;
  const w = swap ? H : W;
  const h = swap ? W : H;
  const out: number[] = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      let row = r;
      let col = c;
      if (flip & 4) [row, col] = [col, row];
      if (flip & 2) row = H - 1 - row;
      if (flip & 1) col = W - 1 - col;
      out.push(sensor[row * W + col]);
    }
  }
  return { data: out, w, h };
}

/** frame-job.ts placement: a clockwise turn baked into the frame. */
function turned(img: { data: number[]; w: number; h: number }, turn: number) {
  const { w, h } = img;
  const swap = turn === 90 || turn === 270;
  const out = new Array<number>(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o =
        turn === 90 ? (h - 1) + x * h - y : turn === 180 ? w * h - 1 - x - y * w : turn === 270 ? (w - 1 - x) * h + y : y * w + x;
      out[o] = img.data[y * w + x];
    }
  }
  return { data: out, w: swap ? h : w, h: swap ? w : h };
}

describe("decoded frame to sensor", () => {
  const W = 7;
  const H = 5;
  const sensor = Array.from({ length: W * H }, (_, i) => i);
  for (const flip of [0, 3, 5, 6]) {
    for (const turn of [0, 90, 180, 270]) {
      it(`finds every pixel's sensel under flip ${flip}, turn ${turn}`, () => {
        const frame = turned(librawOutput(sensor, W, H, flip), turn);
        const m = sensorFromSource(flip, turn);
        for (let y = 0; y < frame.h; y++) {
          for (let x = 0; x < frame.w; x++) {
            const [u, v] = apply(m, (x + 0.5) / frame.w, (y + 0.5) / frame.h);
            expect(Math.floor(v * H) * W + Math.floor(u * W)).toBe(frame.data[y * frame.w + x]);
          }
        }
      });
    }
  }

  it("bakes in only the manual part of the rotation", () => {
    expect(manualTurn(90, 6)).toBe(0);
    expect(manualTurn(180, 6)).toBe(90);
    expect(manualTurn(undefined, 8)).toBe(0);
    expect(manualTurn(0, 6)).toBe(270);
  });
});

describe("LibRaw's frame", () => {
  const readout: RawReadout = {
    raw_width: 12,
    raw_height: 8,
    left_margin: 4,
    top_margin: 2,
    width: 8,
    height: 6,
    data: Uint16Array.from({ length: 96 }, (_, i) => i),
  };

  it("cuts the visible part out of the readout", () => {
    const v = visibleMosaic(readout);
    expect([v.width, v.height]).toEqual([8, 6]);
    expect(v.mosaic[0]).toBe(2 * 12 + 4);
    expect(v.mosaic[8]).toBe(3 * 12 + 4);
  });

  it("swaps a size reported after the flip back to sensor orientation", () => {
    expect(visibleSize({ ...readout, width: 6, height: 8 })).toEqual({ width: 8, height: 6 });
  });

  it("reads the details matching goes by", () => {
    const info = frameInfoOf(
      {
        camera_make: "Nikon",
        camera_model: " Z 6_2 ",
        iso_speed: 800,
        shutter: 30,
        aperture: 8,
        focal_len: 24,
        flip: 6,
        filters: RGGB,
        timestamp: new Date(1_700_000_000_000),
        lens: { Lens: "NIKKOR Z 24-70mm f/4 S" },
        metadata_common: { SensorTemperature: -1000, CameraTemperature: 31 },
        color_data: { black: 1008, maximum: 15520, cam_mul: [2, 1, 1.5, 0], pre_mul: [1.9, 1, 1.4, 0], rgb_cam: [[1.7, -0.6, -0.1, 0], [-0.2, 1.5, -0.3, 0], [0, -0.5, 1.5, 0]] },
      },
      { width: 6048, height: 4032 },
    );
    expect(info).toMatchObject({ make: "Nikon", model: "Z 6_2", lens: "NIKKOR Z 24-70mm f/4 S", iso: 800, shutter: 30, temperature: 31, flip: 6, black: 1008, white: 15520 });
    expect(info.rgbCam?.[0]).toEqual([1.7, -0.6, -0.1]);
    expect(unsupportedReason(info)).toBeNull();
    expect(unsupportedReason({ ...info, filters: 0 })).toMatch(/no colour filter/);
  });

  it("normalizes the white balance to its smallest multiplier, as the decode does", () => {
    expect(decodeMultipliers({ camMul: [2, 1, 1.5, 0], preMul: [0, 0, 0, 0] })).toEqual([2, 1, 1.5]);
    decodeMultipliers({ camMul: [0, 0, 0, 0], preMul: [2.2, 1.1, 1.65, 0] }).forEach((v, i) => expect(v).toBeCloseTo([2, 1, 1.5][i], 12));
  });
});

describe("black level", () => {
  const pattern = bayerPattern(RGGB)!;
  const readout = (black: (c: number) => number): RawReadout => {
    const rw = 64;
    const rh = 40;
    const data = new Uint16Array(rw * rh);
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        const vx = x - 16;
        const vy = y - 0;
        const c = pattern.colours[(((vy % 2) + 2) % 2) * 2 + (((vx % 2) + 2) % 2)];
        data[y * rw + x] = x < 16 ? black(c) : 3000;
      }
    }
    return { raw_width: rw, raw_height: rh, left_margin: 16, top_margin: 0, width: 48, height: 40, data };
  };

  it("measures the masked border per colour", () => {
    expect(maskedBlack(readout((c) => 2040 + c * 4), pattern)).toEqual([2040, 2044, 2048]);
  });

  it("uses the masked border only when LibRaw reports no black", () => {
    const masked = maskedBlack(readout(() => 2048), pattern);
    expect(blackLevels(0, masked)).toEqual({ black: [2048, 2048, 2048], source: "masked" });
    expect(blackLevels(512, masked)).toEqual({ black: [512, 512, 512], source: "file" });
    expect(blackLevels(512, null).source).toBe("file");
  });
});
