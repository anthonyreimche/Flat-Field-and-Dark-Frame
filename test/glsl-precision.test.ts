// Mesa radeonsi runs mediump as 16-bit (ints wrap past 32767) and the host
// declares only `precision highp float`, so a tile index or a hot-list offset
// in a plain int goes wrong on a large sensor. Only small counters may stay
// mediump.

import { describe, expect, it } from "vitest";
import { HELPERS, INLINE_GLSL } from "../src/glsl";

const mediumpInts = (src: string): string[] =>
  [...src.matchAll(/(?<!highp )\b(?:int|ivec[234])\s+(\w+)/g)].map((m) => m[1]);

describe("integer precision", () => {
  it("keeps the texel addressing helpers highp", () => {
    expect(mediumpInts(HELPERS)).toEqual(["i", "k"]);
  });

  it("keeps the tile index and hot-list offsets highp in the inline", () => {
    expect(mediumpInts(INLINE_GLSL)).toEqual(["count", "i"]);
  });
});
