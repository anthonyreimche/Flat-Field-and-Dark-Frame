// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// The masters as the GPU reads them: half-float textures, one per master
// (and per blur, for flats), uploaded as variants of the stage's two textures.
// Row 0 is a header. Its first texel holds a marker and the variant's
// signature, so a frame whose photo names a variant the renderer holds no
// data for (opaque black) changes nothing. Half floats hold whole numbers up
// to 2048 exactly, so larger ones are split base 1024.

import type { DarkMaster } from "./dark";
import type { Grid } from "./grid";

export const DARK_MAGIC = 1031;
export const FLAT_MAGIC = 1033;
/** Texels per row of the dark texture. */
export const DARK_ROW = 256;
/** Sensels per side of a hot-pixel tile. */
export const TILE = 16;
/** The most hot sensels one tile repairs, strongest first. */
export const MAX_PER_TILE = 8;
/** How far from a hot sensel, in sensels, a pixel may still be repaired. */
export const HOT_REACH = 4;

export interface Texture {
  data: Float32Array;
  width: number;
  height: number;
}

/** Two whole numbers below 2048 that tell variants apart. */
export function signature(name: string): [number, number] {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return [(h >>> 11) & 2047, h & 2047];
}

const split = (n: number): [number, number] => [Math.floor(n / 1024), n % 1024];

function texture(width: number, height: number): Texture {
  return { data: new Float32Array(width * height * 4), width, height };
}

function put(t: Texture, x: number, y: number, v: readonly number[]): void {
  t.data.set(v, (y * t.width + x) * 4);
}

const rowsFor = (texels: number) => Math.max(1, Math.ceil(texels / DARK_ROW));

/** Which tiles each hot sensel can reach, strongest first, at most
 *  MAX_PER_TILE a tile: tile index → sensel indices (y * width + x). */
export function hotTiles(hot: Uint32Array, width: number, height: number): Map<number, number[]> {
  const tilesW = Math.ceil(width / TILE);
  const tiles = new Map<number, number[]>();
  for (const i of hot) {
    const x = i % width;
    const y = Math.floor(i / width);
    const tx0 = Math.max(0, Math.floor((x - HOT_REACH) / TILE));
    const tx1 = Math.min(tilesW - 1, Math.floor((x + 1 + HOT_REACH) / TILE));
    const ty0 = Math.max(0, Math.floor((y - HOT_REACH) / TILE));
    const ty1 = Math.min(Math.ceil(height / TILE) - 1, Math.floor((y + 1 + HOT_REACH) / TILE));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const k = ty * tilesW + tx;
        const list = tiles.get(k) ?? [];
        if (list.length < MAX_PER_TILE) list.push(i);
        tiles.set(k, list);
      }
    }
  }
  return tiles;
}

/** The dark master as the stage reads it. */
export function packDark(d: DarkMaster, variant: string): Texture {
  const tilesW = Math.ceil(d.width / TILE);
  const tilesH = Math.ceil(d.height / TILE);
  const tiles = hotTiles(d.hot, d.width, d.height);
  let entries = 0;
  for (const list of tiles.values()) entries += list.length;
  const glowRow = 1;
  const colRow = glowRow + d.glow.height;
  const rowRow = colRow + rowsFor(Math.ceil(d.width / 4));
  const tileRow = rowRow + rowsFor(Math.ceil(d.height / 4));
  const listRow = tileRow + rowsFor(tilesW * tilesH);
  const t = texture(DARK_ROW, listRow + rowsFor(entries));
  const [sa, sb] = signature(variant);
  put(t, 0, 0, [DARK_MAGIC, sa, sb, TILE]);
  put(t, 1, 0, [d.glow.width, d.glow.height, d.glow.block, 0]);
  put(t, 2, 0, [glowRow, colRow, rowRow, tileRow]);
  put(t, 3, 0, [listRow, tilesW, tilesH, 0]);
  put(t, 4, 0, [...split(d.width), ...split(d.height)]);
  for (let y = 0; y < d.glow.height; y++) {
    for (let x = 0; x < d.glow.width; x++) {
      const k = (y * d.glow.width + x) * 3;
      put(t, x, glowRow + y, [d.glow.data[k], d.glow.data[k + 1], d.glow.data[k + 2], 1]);
    }
  }
  const packLine = (values: Float32Array, row0: number) => {
    for (let i = 0; i < values.length; i++) {
      const texel = Math.floor(i / 4);
      t.data[((row0 + Math.floor(texel / DARK_ROW)) * DARK_ROW + (texel % DARK_ROW)) * 4 + (i % 4)] = values[i];
    }
  };
  packLine(d.cols, colRow);
  packLine(d.rows, rowRow);
  let next = 0;
  for (let k = 0; k < tilesW * tilesH; k++) {
    const list = tiles.get(k) ?? [];
    put(t, k % DARK_ROW, tileRow + Math.floor(k / DARK_ROW), [...split(next), list.length, 0]);
    for (const i of list) {
      const n = next++;
      put(t, n % DARK_ROW, listRow + Math.floor(n / DARK_ROW), [...split(i % d.width), ...split(Math.floor(i / d.width))]);
    }
  }
  return t;
}

/** A flat correction grid as the stage reads it. */
export function packFlat(g: Grid, sensorW: number, sensorH: number, variant: string): Texture {
  const t = texture(Math.max(4, g.width), g.height + 1);
  const [sa, sb] = signature(variant);
  put(t, 0, 0, [FLAT_MAGIC, sa, sb, g.block]);
  put(t, 1, 0, [g.width, g.height, 0, 0]);
  put(t, 2, 0, [...split(sensorW), ...split(sensorH)]);
  const out = t.data;
  for (let y = 0; y < g.height; y++) {
    for (let x = 0, k = y * g.width * 3, o = (y + 1) * t.width * 4; x < g.width; x++, k += 3, o += 4) {
      out[o] = g.data[k];
      out[o + 1] = g.data[k + 1];
      out[o + 2] = g.data[k + 2];
      out[o + 3] = 1;
    }
  }
  return t;
}
