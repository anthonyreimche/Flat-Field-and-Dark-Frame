// What activate() registers, and the controller between the library, the
// textures and the open photo's bag, with RAW reading stubbed by synthetic frames.

import { describe, expect, it } from "vitest";
import manifest from "../safelight.json";
import { MENU_ID, activate, deactivate, matchedMessage } from "../src/index";
import type { RawIo } from "../src/controller";
import { DARK_MAGIC, FLAT_MAGIC, signature } from "../src/pack";
import { CHOICE_KEYS, DEFAULT_CHOICES, EXT_ID, PANEL_ID, STAGE_ID, UNIFORM_KEYS, VARIANT_KEYS, choicePatch } from "../src/params";
import { darkVariant, flatVariant, parseFlatVariant } from "../src/resolve";
import { correctionStage } from "../src/stage";
import { fakeApi, memoryStore, photo, type Rig } from "./support/fake-api";
import type { EditState } from "../src/safelight";
import { H, INFO, W, controllerOn, file, io, settle, withFile } from "./support/calibration";

describe("activate", () => {
  it("registers the stage, the panel in Develop and the Library menu item, named under the manifest's id", async () => {
    const rig = fakeApi();
    activate(rig.api);
    await settle();
    expect(rig.stages.map((s) => s.id)).toEqual([STAGE_ID]);
    expect(rig.panels.map((p) => p.id)).toEqual([PANEL_ID]);
    expect(rig.menus.map((m) => m.id)).toEqual([MENU_ID]);
    expect(EXT_ID).toBe(manifest.id);
    deactivate();
    expect(rig.stages).toEqual([]);
  });

  it("is dormant while both corrections are off", () => {
    expect(correctionStage().dormantWhen).toEqual({ darkOn: 0, flatOn: 0 });
  });

  it("words the Library menu item's result", () => {
    expect(matchedMessage(3, 0)).toBe("3 photos now use the best matching dark frame and flat field.");
    expect(matchedMessage(1, 2)).toMatch(/^1 photo now uses .* 2 photos were left alone/);
  });
});

describe("controller", () => {
  it("supplies a new dark master as its own variant, and writes the open photo's mirrors", async () => {
    const rig = fakeApi(choicePatch({ dark: true }), [withFile()]);
    const c = controllerOn(rig.api, { io: io("dark") });
    await c.start();
    expect(c.status.dark).toMatchObject({ state: "none", reason: expect.stringMatching(/No dark frame from the Z 6_2/) });
    expect(await c.addMaster("dark", [file("d1.nef"), file("d2.nef")])).toBeNull();
    await settle();
    const id = c.masters[0].id;
    const tex = rig.textures.get(`${STAGE_ID}.darkMaster#${darkVariant(id)}`);
    expect(tex?.data[0]).toBe(DARK_MAGIC);
    expect(c.masters[0]).toMatchObject({ kind: "dark", hot: 1, frames: [{ name: "d1.nef" }, { name: "d2.nef" }] });
    const bag = rig.develop.getState().paramBag;
    expect(bag[VARIANT_KEYS.dark]).toBe(darkVariant(id));
    expect(bag[UNIFORM_KEYS.darkSig]).toEqual(signature(darkVariant(id)));
    expect(bag[UNIFORM_KEYS.pass]).toBe(1);
    expect(bag[UNIFORM_KEYS.sensorSize]).toEqual([W, H]);
    expect(c.status.dark).toMatchObject({ state: "matched", auto: true });
  });

  it("supplies the flat variant for the photo's blur", async () => {
    const rig = fakeApi({ ...choicePatch({ flat: true, blur: "vertical", radius: 12 }) }, [withFile()]);
    const c = controllerOn(rig.api, { io: io("flat") });
    await c.start();
    await c.addMaster("flat", [file("f.nef")]);
    await settle();
    const name = flatVariant(c.masters[0].id, "vertical", 12);
    expect(rig.textures.get(`${STAGE_ID}.flatMaster#${name}`)?.data[0]).toBe(FLAT_MAGIC);
    expect(rig.develop.getState().paramBag[VARIANT_KEYS.flat]).toBe(name);
  });

  it("says why a frame from another camera can't be added beside the first", async () => {
    const rig = fakeApi();
    let n = 0;
    const base = io("dark");
    const mixed: RawIo = {
      ...base,
      frames: () => {
        const r = base.frames();
        return { ...r, read: async (f) => ({ ...(await r.read(f)), info: { ...INFO, model: n++ ? "Z 8" : "Z 6_2" } }) };
      },
    };
    const c = controllerOn(rig.api, { io: mixed });
    await c.start();
    expect(await c.addMaster("dark", [file("a.nef"), file("b.nef")])).toMatch(/b\.nef is from another camera/);
    expect(c.masters).toEqual([]);
  });

  it("drops a deleted master's texture and stops correcting with it", async () => {
    const rig = fakeApi(choicePatch({ dark: true }), [withFile()]);
    const c = controllerOn(rig.api, { io: io("dark") });
    await c.start();
    await c.addMaster("dark", [file("d.nef")]);
    await settle();
    const id = c.masters[0].id;
    await c.removeMaster(id);
    await settle();
    expect([...rig.textures.keys()]).toEqual([]);
    expect(rig.develop.getState().paramBag[UNIFORM_KEYS.darkSig]).toEqual([-1, -1]);
    expect(c.status.dark.state).toBe("none");
  });

  it("leaves a rendered photo alone and says why", async () => {
    const rig = fakeApi(choicePatch({ dark: true }), [withFile({ mimeType: "image/jpeg" })]);
    const c = controllerOn(rig.api, { io: io("dark") });
    await c.start();
    expect(c.status.blocked).toMatch(/RAW photos only/);
    expect(rig.develop.getState().paramBag[UNIFORM_KEYS.pass]).toBe(0);
  });

  it("says when the original can't be read", async () => {
    const rig = fakeApi(choicePatch({ flat: true }), [photo()]);
    const c = controllerOn(rig.api, { io: io("flat") });
    await c.start();
    await settle();
    expect(c.status.blocked).toMatch(/original file isn't available/);
  });

  it("writes nothing while both corrections are off", async () => {
    const rig = fakeApi({}, [withFile()]);
    const c = controllerOn(rig.api, { io: io("dark") });
    await c.start();
    await c.addMaster("dark", [file("d.nef")]);
    await settle();
    expect(rig.develop.getState().paramBag).toEqual({});
    expect(CHOICE_KEYS.darkPick in rig.develop.getState().paramBag).toBe(false);
  });
});

describe("a photo's textures, made when a frame needs them", () => {
  const NO_PARAMS = {} as EditState["stack"][number]["params"];
  const ids = ["p1", "p2", "p3", "p4", "p5"];
  const photos = () => ids.map((id) => withFile({ id, filename: `${id}.NEF`, relPath: `${id}.NEF` }));
  const saved = (rig: Rig, photoId: string, bag: Record<string, unknown>) =>
    rig.edits.set(photoId, { photoId, stack: [{ timestamp: 1, label: "Edit", params: NO_PARAMS, paramBag: bag }], currentIndex: 0 });

  /** A library with one master of `kind`, built in a window that is then closed. */
  async function library(kind: "dark" | "flat") {
    const store = memoryStore();
    const first = fakeApi({}, photos());
    first.develop.setState({ photoId: null });
    const c = controllerOn(first.api, { io: io(kind), store });
    await c.start();
    await c.addMaster(kind, [file(`${kind}.nef`)]);
    const id = c.masters[0].id;
    c.stop();
    return { store, id };
  }

  /** The next start on `store`, with no photo open and the saved edits copied over. */
  async function nextStart(store: ReturnType<typeof memoryStore>, edits?: Map<string, EditState>) {
    const rig = fakeApi({}, photos());
    rig.develop.setState({ photoId: null });
    for (const [id, state] of edits ?? []) rig.edits.set(id, state);
    const c = controllerOn(rig.api, { io: io("flat"), store });
    await c.start();
    return { rig, c };
  }

  it("reads nothing at start, and exports a photo that isn't open corrected with nothing supplied beforehand", async () => {
    const { store, id } = await library("flat");
    const before = fakeApi({}, photos());
    before.develop.setState({ photoId: "p1" });
    saved(before, "p2", {});
    const c = controllerOn(before.api, { io: io("flat"), store });
    await c.start();
    expect(await c.applyTo(["p2"])).toEqual({ applied: 1, skipped: 0 });
    c.stop();

    store.masterReads.length = 0;
    const { rig } = await nextStart(store, before.edits);
    expect(store.masterReads).toEqual([]);
    expect([...rig.textures.keys()]).toEqual([]);
    const out = await rig.exportPhoto("p2");
    const name = flatVariant(id, "area", DEFAULT_CHOICES.radius);
    expect(out).toEqual({ drew: [`${STAGE_ID}.flatMaster#${name}`], failure: null });
    expect(rig.textures.get(`${STAGE_ID}.flatMaster#${name}`)?.data[0]).toBe(FLAT_MAGIC);
  });

  it("exports a photo's dark frame read from the store when its frame first needs it", async () => {
    const { store, id } = await library("dark");
    const { rig } = await nextStart(store);
    saved(rig, "p3", { ...choicePatch({ dark: true }), [VARIANT_KEYS.dark]: darkVariant(id) });
    expect(await rig.exportPhoto("p3")).toEqual({ drew: [`${STAGE_ID}.darkMaster#${darkVariant(id)}`], failure: null });
    expect(rig.textures.get(`${STAGE_ID}.darkMaster#${darkVariant(id)}`)?.data[0]).toBe(DARK_MAGIC);
  });

  it("has the open photo's textures made when it starts with the photo already open", async () => {
    const { store, id } = await library("flat");
    const name = flatVariant(id, "area", DEFAULT_CHOICES.radius);
    const rig = fakeApi({ ...choicePatch({ flat: true }), [VARIANT_KEYS.flat]: name }, photos());
    await controllerOn(rig.api, { io: io("flat"), store }).start();
    await settle();
    expect([...rig.textures.keys()]).toEqual([`${STAGE_ID}.flatMaster#${name}`]);
  });

  it("exports every photo corrected when their saved edits name more flat variants than fit at once", async () => {
    const { store, id } = await library("flat");
    const { rig } = await nextStart(store);
    const name = (i: number) => flatVariant(id, "area", 10 + i * 10);
    ids.forEach((photoId, i) => saved(rig, photoId, { ...choicePatch({ flat: true }), [VARIANT_KEYS.flat]: name(i) }));
    const first = await rig.exportPhoto("p1");
    const size = rig.textures.get(first.drew[0])!.data.byteLength;
    rig.budget = 2 * size;
    for (let round = 0; round < 2; round++) {
      for (const [i, photoId] of ids.entries()) {
        expect(await rig.exportPhoto(photoId)).toEqual({ drew: [`${STAGE_ID}.flatMaster#${name(i)}`], failure: null });
        expect([...rig.textures.values()].reduce((n, t) => n + t.data.byteLength, 0)).toBeLessThanOrEqual(rig.budget);
      }
    }
  });

  it("draws a removed master's photos uncorrected, and says so in the panel", async () => {
    const rig = fakeApi(choicePatch({ flat: true }), photos());
    const c = controllerOn(rig.api, { io: io("flat"), store: memoryStore() });
    await c.start();
    await c.addMaster("flat", [file("f.nef")]);
    await settle();
    await c.settled();
    const id = c.masters[0].id;
    const name = flatVariant(id, "area", DEFAULT_CHOICES.radius);
    expect(rig.develop.getState().paramBag[VARIANT_KEYS.flat]).toBe(name);
    saved(rig, "p2", { ...choicePatch({ flat: true }), [VARIANT_KEYS.flat]: name });
    await c.removeMaster(id);
    await settle();
    expect(c.status.flat).toMatchObject({ state: "none", reason: expect.stringMatching(/No flat field/) });
    expect(rig.develop.getState().paramBag[UNIFORM_KEYS.flatSig]).toEqual([-1, -1]);
    expect(await rig.exportPhoto("p2")).toEqual({ drew: [], failure: null });
  });
});

describe("a flat variant's name", () => {
  it("reads back as the master, blur and radius it was made from", () => {
    for (const blur of ["area", "vertical", "horizontal", "vertical-horizontal"] as const)
      expect(parseFlatVariant(flatVariant("k3x9q0ab", blur, 137))).toEqual({ id: "k3x9q0ab", blur, radius: 137, name: flatVariant("k3x9q0ab", blur, 137) });
  });

  it("is nothing for a dark's name, an empty one or a value that isn't text", () => {
    expect(parseFlatVariant(darkVariant("k3x9q0ab"))).toBeNull();
    expect(parseFlatVariant("")).toBeNull();
    expect(parseFlatVariant(undefined)).toBeNull();
    expect(parseFlatVariant(12)).toBeNull();
  });
});
