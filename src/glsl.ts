// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// The GPU side of model.ts. The pass, drawn once at the source's size,
// takes the colour of the ring three sensels around every pixel, the brightest
// of its eight taps left out, for the hot pixel repair; for a photo that isn't
// a RAW decode it writes a sentinel instead, and the inline then does nothing.
// The inline reads the masters' textures at the pixel's sensor position (the
// header texels of pack.ts first, so a variant with no data changes nothing)
// and runs correctPixel.
//
// Helpers are prefixed `ff`. Uniform and texture keys are rewritten by
// whole-identifier replace, so the bodies use those names only for them.

import { BASELINE, INVERSE_STEPS, RING_RADIUS, REPAIR_RADIUS } from "./model";
import { DARK_MAGIC, DARK_ROW, FLAT_MAGIC, MAX_PER_TILE } from "./pack";

/** A GLSL float literal that always carries a decimal point. */
export function lit(v: number): string {
  const s = v.toPrecision(10);
  if (/e/i.test(s)) {
    const [m, e] = s.split(/e/i);
    return `${m.includes(".") ? m : `${m}.0`}e${Number(e)}`;
  }
  return s.includes(".") ? s : `${s}.0`;
}

const { A, B, C, D, E, F, G } = BASELINE;

export const RESULT_SENTINEL = -1e4;

const BASELINE_GLSL = `
float ffBase(float x) {
  float c = clamp(x, 0.0, 1.0);
  return c * ((${lit(A)} * c + ${lit(B)}) * c + ${lit(C)}) / (((${lit(D)} * c + ${lit(E)}) * c + ${lit(F)}) * c + ${lit(G)})
       + max(x - 1.0, 0.0) + min(x, 0.0) * ${lit(C / G)};
}
float ffUnbase(float y) {
  if (y >= 1.0) return y;
  if (y <= 0.0) return y * ${lit(G / C)};
  float c = y * y;
  float a = ${lit(A)} - y * ${lit(D)};
  float b = ${lit(B)} - y * ${lit(E)};
  float k = ${lit(C)} - y * ${lit(F)};
  for (int i = 0; i < ${INVERSE_STEPS}; i++) {
    float p = ((a * c + b) * c + k) * c - y * ${lit(G)};
    float dp = (3.0 * a * c + 2.0 * b) * c + k;
    c = clamp(c - p / dp, 0.0, 1.0);
  }
  return c;
}
vec3 ffLinear3(vec3 v) { return uApplyBaseCurve ? vec3(ffUnbase(v.r), ffUnbase(v.g), ffUnbase(v.b)) : v; }
vec3 ffBase3(vec3 v) { return vec3(ffBase(v.r), ffBase(v.g), ffBase(v.b)); }
`;

// Index arithmetic is highp by hand: radeonsi runs mediump ints as 16-bit, and
// the tile and hot-list indices pass 32767 on a large sensor.
export const HELPERS = `${BASELINE_GLSL}
float ffJoin(float hi, float lo) { return hi * 1024.0 + lo; }
vec4 ffAt(sampler2D t, highp int x, highp int y) { return texelFetch(t, ivec2(x, y), 0); }
bool ffSizeIs(vec4 h, vec2 size) { return ffJoin(h.x, h.y) == size.x && ffJoin(h.z, h.w) == size.y; }
float ffPacked(sampler2D t, highp int row0, highp int i) {
  highp int texel = i / 4;
  vec4 v = ffAt(t, texel % ${DARK_ROW}, row0 + texel / ${DARK_ROW});
  int k = i - texel * 4;
  return k == 0 ? v.x : k == 1 ? v.y : k == 2 ? v.z : v.w;
}
`;

/** One draw: the ring's colour, or the sentinel off a RAW decode. */
export const PASS_GLSL = `
{
  if (!uSrcLinear) {
    c = vec3(${lit(RESULT_SENTINEL)});
  } else {
    float passLong = max(1.0 / uTexel.x, 1.0 / uTexel.y);
    float sourceLong = uSourceSize.x > 0.0 ? max(uSourceSize.x, uSourceSize.y) : passLong;
    float r = max(1.5, ${lit(RING_RADIUS)} * passLong / sourceLong);
    vec3 sum = vec3(0.0);
    vec3 top = vec3(0.0);
    float topLuma = -1e30;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853981634;
      vec3 t = fetchInput(ivec2(floor(vUv / uTexel + vec2(cos(a), sin(a)) * r)));
      float l = dot(t, vec3(0.2126, 0.7152, 0.0722));
      sum += t;
      if (l > topLuma) {
        topLuma = l;
        top = t;
      }
    }
    c = (sum - top) / 7.0;
  }
}`;

/** The stage's inline: correctPixel. */
export const INLINE_GLSL = `
{
  vec2 ffS = (toSensorUv * vec3(srcUv, 1.0)).xy * sensorSize;
  vec2 ffW = fwidth(ffS);
  float ffSpan = max(ffW.x, ffW.y);
  vec4 ffD0 = ffAt(darkMaster, 0, 0);
  vec4 ffF0 = ffAt(flatMaster, 0, 0);
  bool ffDark = darkOn > 0.5 && ffD0.x == ${lit(DARK_MAGIC)} && ffD0.y == darkSig.x && ffD0.z == darkSig.y && ffSizeIs(ffAt(darkMaster, 4, 0), sensorSize);
  bool ffFlat = flatOn > 0.5 && ffF0.x == ${lit(FLAT_MAGIC)} && ffF0.y == flatSig.x && ffF0.z == flatSig.y && ffSizeIs(ffAt(flatMaster, 2, 0), sensorSize);
  if ((ffDark || ffFlat) && pass > 0.5 && stageResult.r > -1000.0) {
    vec3 ffX0 = ffLinear3(lin);
    vec3 ffX = ffX0;
    vec3 ffE;
    if (ffDark) {
      vec4 h1 = ffAt(darkMaster, 1, 0);
      vec4 h2 = ffAt(darkMaster, 2, 0);
      vec4 h3 = ffAt(darkMaster, 3, 0);
      highp ivec2 tile = ivec2(floor(ffS / ffD0.w));
      float w = 0.0;
      if (tile.x >= 0 && tile.y >= 0 && tile.x < int(h3.y) && tile.y < int(h3.z)) {
        highp int k = tile.y * int(h3.y) + tile.x;
        vec4 te = ffAt(darkMaster, k % ${DARK_ROW}, int(h2.w) + k / ${DARK_ROW});
        highp int start = int(ffJoin(te.x, te.y));
        int count = int(te.z);
        float r0 = ${lit(REPAIR_RADIUS)} + 0.5 * ffSpan;
        for (int i = 0; i < ${MAX_PER_TILE}; i++) {
          if (i >= count) break;
          highp int n = start + i;
          vec4 e = ffAt(darkMaster, n % ${DARK_ROW}, int(h3.x) + n / ${DARK_ROW});
          vec2 hot = vec2(ffJoin(e.x, e.y), ffJoin(e.z, e.w)) + 0.5;
          w = max(w, 1.0 - smoothstep(r0, r0 + 1.0, length(ffS - hot)));
        }
      }
      if (w > 0.0) ffX = mix(ffX, ffLinear3(stageResult), w);
      ffE = toSensor * ffX;
      vec2 g = clamp(ffS / h1.z - 0.5, vec2(0.0), h1.xy - 1.0);
      vec3 glow = textureLod(darkMaster, (g + vec2(0.5, h2.x + 0.5)) / vec2(textureSize(darkMaster, 0)), 0.0).rgb;
      highp ivec2 p = clamp(ivec2(floor(ffS)), ivec2(0), ivec2(sensorSize) - 1);
      ffE -= glow + vec3(ffPacked(darkMaster, int(h2.y), p.x) + ffPacked(darkMaster, int(h2.z), p.y));
    } else {
      ffE = toSensor * ffX;
    }
    if (ffFlat) {
      vec4 h1 = ffAt(flatMaster, 1, 0);
      vec2 g = clamp(ffS / ffF0.w - 0.5, vec2(0.0), h1.xy - 1.0);
      vec3 k = textureLod(flatMaster, (g + vec2(0.5, 1.5)) / vec2(textureSize(flatMaster, 0)), 0.0).rgb;
      vec3 l = ffE * k;
      float top = max(max(l.r, l.g), l.b);
      float f = 1.0;
      if (top > 1.0 && clip > 0.0) {
        f = 1.0 + (min(1.0, max(1.0, max(max(ffE.r, ffE.g), ffE.b)) / top) - 1.0) * clip;
      }
      ffE = l * f;
    }
    vec3 ffX1 = toWorking * ffE;
    lin += uApplyBaseCurve ? ffBase3(ffX1) - ffBase3(ffX0) : ffX1 - ffX0;
  }
}`;

/** Texture reads per draw, for the cost test: the inline's worst case. */
export const INLINE_FETCHES = { header: 8, tile: 1, list: MAX_PER_TILE, darkPattern: 3, flat: 1, stageResult: 1 } as const;
