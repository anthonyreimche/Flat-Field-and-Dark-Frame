// Two app windows on one calibration library: each has its own renderer and
// its own copies of the textures, made from the store they share when a frame
// there needs them, and each hears from the other which masters came and went.

import { describe, expect, it } from "vitest";
import { readNews } from "../src/news";
import { DEFAULT_CHOICES, STAGE_ID, VARIANT_KEYS, choicePatch } from "../src/params";
import { darkVariant, flatVariant } from "../src/resolve";
import type { EditState } from "../src/safelight";
import { fakeApi, memoryStore, newsHub, type Rig } from "./support/fake-api";
import { controllerOn, file, io, settle, withFile } from "./support/calibration";

const NO_PARAMS = {} as EditState["stack"][number]["params"];
const two = () => [withFile({ id: "p1" }), withFile({ id: "p2", filename: "DSC_0002.NEF", relPath: "DSC_0002.NEF" })];
const keys = (rig: Rig, kind: "dark" | "flat") => [...rig.textures.keys()].filter((k) => k.startsWith(`${STAGE_ID}.${kind}Master#`)).sort();
const saved = (rig: Rig, photoId: string, bag: Record<string, unknown>) =>
  rig.edits.set(photoId, { photoId, stack: [{ timestamp: 1, label: "Edit", params: NO_PARAMS, paramBag: bag }], currentIndex: 0 });

/** Two windows on one store, A open on p1 and B on p2, with nothing on. */
async function windows(kind: "dark" | "flat", line: "hub" | "none" = "hub") {
  const hub = newsHub();
  const news = line === "hub" ? hub.connect : () => null;
  const store = memoryStore();
  const a = fakeApi({}, two());
  const b = fakeApi({}, two());
  b.develop.setState({ photoId: "p2" });
  const ca = controllerOn(a.api, { io: io(kind), store, news });
  const cb = controllerOn(b.api, { io: io(kind), store, news });
  await Promise.all([ca.start(), cb.start()]);
  return { hub, store, a, b, ca, cb };
}

describe("a second window", () => {
  it("lists a master the first one adds", async () => {
    const { ca, cb } = await windows("dark");
    expect(await ca.addMaster("dark", [file("d.nef")])).toBeNull();
    await settle();
    expect(cb.masters.map((m) => m.id)).toEqual([ca.masters[0].id]);
  });

  it("exports a photo corrected with a master the first one added, without any message from it", async () => {
    const { a, b, ca, cb } = await windows("flat", "none");
    await ca.addMaster("flat", [file("f.nef")]);
    const id = ca.masters[0].id;
    const name = flatVariant(id, "area", DEFAULT_CHOICES.radius);
    saved(a, "p1", { ...choicePatch({ flat: true }), [VARIANT_KEYS.flat]: name });
    b.edits.set("p1", a.edits.get("p1")!);
    expect(cb.masters).toEqual([]);
    expect(await b.exportPhoto("p1")).toEqual({ drew: [`${STAGE_ID}.flatMaster#${name}`], failure: null });
  });

  it("lets go of a removed master's textures, and draws its photos uncorrected", async () => {
    const { b, ca, cb } = await windows("dark");
    await ca.addMaster("dark", [file("d.nef")]);
    await settle();
    const id = ca.masters[0].id;
    saved(b, "p1", { ...choicePatch({ dark: true }), [VARIANT_KEYS.dark]: darkVariant(id) });
    expect((await b.exportPhoto("p1")).drew).toHaveLength(1);
    await ca.removeMaster(id);
    await settle();
    expect(cb.masters).toEqual([]);
    expect(keys(b, "dark")).toEqual([]);
    expect(await b.exportPhoto("p1")).toEqual({ drew: [], failure: null });
  });

  it("takes news in the order it was sent, so a master removed while it was still being read stays out", async () => {
    const hub = newsHub();
    const store = memoryStore();
    const a = fakeApi({}, two());
    const ca = controllerOn(a.api, { io: io("dark"), store, news: hub.connect });
    // B reads a summary as it was when asked for, and has it once A is done.
    let asked!: () => void;
    const reading = new Promise<void>((r) => (asked = r));
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    const slowRead = {
      ...store,
      loadSummary: async (id: string) => {
        const summary = await store.loadSummary(id);
        asked();
        await released;
        return summary;
      },
    };
    const b = fakeApi({}, two());
    const cb = controllerOn(b.api, { io: io("dark"), store: slowRead, news: hub.connect });
    await Promise.all([ca.start(), cb.start()]);
    await ca.addMaster("dark", [file("d.nef")]);
    await reading;
    await ca.removeMaster(ca.masters[0].id);
    await settle();
    release();
    await settle();
    expect(cb.masters).toEqual([]);
  });

  it("hears what the first one posts while it is still listing the library", async () => {
    const hub = newsHub();
    const store = memoryStore();
    const a = fakeApi({}, two());
    const ca = controllerOn(a.api, { io: io("dark"), store, news: hub.connect });
    await ca.start();
    let listed!: () => void;
    const listing = new Promise<void>((r) => (listed = r));
    const slow = {
      ...store,
      loadSummaries: async () => {
        const summaries = await store.loadSummaries();
        await listing;
        return summaries;
      },
    };
    const b = fakeApi({}, two());
    const cb = controllerOn(b.api, { io: io("dark"), store: slow, news: hub.connect });
    const starting = cb.start();
    await settle();
    await ca.addMaster("dark", [file("d.nef")]);
    await settle();
    listed();
    await starting;
    await settle();
    expect(cb.masters.map((m) => m.id)).toEqual([ca.masters[0].id]);
  });

  it("closes its line when it stops, and hears nothing after", async () => {
    const { hub, ca, cb } = await windows("dark");
    expect(hub.open()).toBe(2);
    cb.stop();
    expect(hub.open()).toBe(1);
    await ca.addMaster("dark", [file("d.nef")]);
    await settle();
    expect(cb.masters).toEqual([]);
  });
});

describe("news off the channel", () => {
  it("is taken only in the shapes a window posts", () => {
    expect(readNews({ kind: "master-added", id: "k3x9q0ab" })).toEqual({ kind: "master-added", id: "k3x9q0ab" });
    expect(readNews({ kind: "master-removed", id: "k3x9q0ab" })).toEqual({ kind: "master-removed", id: "k3x9q0ab" });
    expect(readNews({ kind: "flat-use", photoId: "p1", variant: null })).toBeNull();
    expect(readNews({ kind: "master-removed", id: 3 })).toBeNull();
    expect(readNews("master-added")).toBeNull();
    expect(readNews(null)).toBeNull();
  });
});
