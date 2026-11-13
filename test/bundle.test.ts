// Checks on dist/index.js, the file Safelight loads. Safelight imports it as it
// is, without an import map, so it must not import anything at runtime.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Not `new URL("../dist/index.js", import.meta.url)`: Vite recognizes that
// exact pattern as an asset import and rewrites it against the test
// environment's http://localhost location instead of the real file.
const BUNDLE = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");

describe("built bundle (run `npm run build` first)", () => {
  it("exists", () => {
    expect(existsSync(BUNDLE)).toBe(true);
  });

  it("imports nothing: Safelight has no import map for it", () => {
    const src = readFileSync(BUNDLE, "utf8");
    expect(/^\s*import\s/m.test(src)).toBe(false);
    expect(/\bimport\s*\(/.test(src)).toBe(false);
  });

  it("never imports React: the host passes it in", () => {
    const src = readFileSync(BUNDLE, "utf8");
    expect(/from\s*["']react(-dom)?(\/[^"']*)?["']/.test(src)).toBe(false);
    expect(src.includes("jsx-runtime")).toBe(false);
  });

  it("never reads import.meta: it is undefined in an installed extension", () => {
    expect(readFileSync(BUNDLE, "utf8").includes("import.meta")).toBe(false);
  });

  it("carries its flat field worker inside it, so it starts wherever the bundle loads", () => {
    const src = readFileSync(BUNDLE, "utf8");
    expect(src).toContain("createObjectURL");
    expect(src).toContain("Flat field blur");
    expect(existsSync(join(dirname(BUNDLE), "assets"))).toBe(false);
  });

  it("ships LibRaw beside it, its scripts finding their siblings without import.meta", () => {
    const dir = join(dirname(BUNDLE), "libraw");
    for (const name of ["worker.js", "libraw.js", "libraw.wasm"]) expect(existsSync(join(dir, name)), name).toBe(true);
    for (const name of ["worker.js", "libraw.js"]) expect(readFileSync(join(dir, name), "utf8").includes("import.meta"), name).toBe(false);
  });
});
