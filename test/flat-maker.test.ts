// Flat variants made off the main thread: the worker's jobs, the maker that
// talks to it (over a stand-in worker running the same jobs), and what the
// open photo draws with while a variant is being made.

import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFlat, type FlatMaster } from "../src/flat";
import { flatJobs, flatTexture, type FlatJob, type FlatJobReply } from "../src/flat-job";
import { IDLE_MS, WorkerFlatMaker, onMainThread, type FlatMaker, type JobWorker } from "../src/flat-maker";
import type { Texture } from "../src/pack";
import { CHOICE_KEYS, STAGE_ID, UNIFORM_KEYS, VARIANT_KEYS, choicePatch } from "../src/params";
import { flatVariant, parseFlatVariant, type FlatNeed } from "../src/resolve";
import { signature } from "../src/pack";
import { fakeApi, memoryStore, type Rig } from "./support/fake-api";
import type { Controller } from "../src/controller";
import type { EditState } from "../src/safelight";
import { H, W, controllerOn, file, io, pattern, settle, withFile } from "./support/calibration";
import { readout } from "./support/camera";

const FLAT: FlatMaster = buildFlat(Float32Array.from(readout("flat").data), W, H, pattern, [1008, 1008, 1008]);
const need = (radius: number, blur: FlatNeed["blur"] = "area"): FlatNeed => parseFlatVariant(flatVariant("m1", blur, radius))!;
const NO_PARAMS = {} as EditState["stack"][number]["params"];
const load = vi.fn(async (): Promise<FlatMaster | null> => FLAT);

/** Runs the worker's jobs a task later, as a worker would, keeping what it was sent. */
class StandInWorker implements JobWorker {
  onmessage: ((e: MessageEvent<FlatJobReply>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  posted: FlatJob[] = [];
  terminated = false;
  private run = flatJobs();
  postMessage(job: FlatJob): void {
    this.posted.push(job);
    const reply = this.run(structuredClone(job));
    if (reply) setTimeout(() => this.onmessage?.(new MessageEvent("message", { data: reply })));
  }
  terminate(): void {
    this.terminated = true;
  }
}

class BrokenWorker extends StandInWorker {
  postMessage(): void {
    setTimeout(() => this.onerror?.(new ErrorEvent("error", { message: "failed to load", cancelable: true })));
  }
}

afterEach(() => {
  vi.useRealTimers();
  load.mockClear();
});

describe("the flat worker's jobs", () => {
  it("make what the main thread makes, the master's flat sent once", () => {
    const run = flatJobs();
    const first = run({ master: "m1", flat: FLAT, need: need(12) });
    const again = run({ master: "m1", need: need(40, "vertical") });
    expect(first).toEqual({ texture: flatTexture(FLAT, need(12)) });
    expect(again).toEqual({ texture: flatTexture(FLAT, need(40, "vertical")) });
  });

  it("say so for a master never sent, or let go of", () => {
    const run = flatJobs();
    run({ master: "m1", flat: FLAT, need: need(12) });
    expect(run({ forget: "m1" })).toBeNull();
    expect(run({ master: "m1", need: need(12) })).toEqual({ error: "master m1 wasn't sent" });
  });
});

describe("the worker flat maker", () => {
  it("reads and sends a master's flat for its first job only, and hands back the worker's texture", async () => {
    const worker = new StandInWorker();
    const maker = new WorkerFlatMaker(() => worker);
    const [a, b] = await Promise.all([maker.make(need(12), load), maker.make(need(30), load)]);
    expect(a).toEqual(flatTexture(FLAT, need(12)));
    expect(b).toEqual(flatTexture(FLAT, need(30)));
    expect(worker.posted.map((j) => ("flat" in j && j.flat ? "with flat" : "without"))).toEqual(["with flat", "without"]);
    expect(load).toHaveBeenCalledTimes(1);
    maker.dispose();
  });

  it("makes nothing for a master the store no longer has", async () => {
    const worker = new StandInWorker();
    const maker = new WorkerFlatMaker(() => worker);
    expect(await maker.make(need(12), async () => null)).toBeNull();
    expect(worker.posted).toEqual([]);
    maker.dispose();
  });

  it("tells the worker to let go of a master taken out, and sends it again if it comes back", async () => {
    const worker = new StandInWorker();
    const maker = new WorkerFlatMaker(() => worker);
    await maker.make(need(12), load);
    maker.forget("m1");
    await maker.make(need(12), load);
    expect(worker.posted.map((j) => ("forget" in j ? "forget" : j.flat ? "with flat" : "without"))).toEqual(["with flat", "forget", "with flat"]);
    maker.dispose();
  });

  it("ends the worker after a while without work, and starts another when needed", async () => {
    vi.useFakeTimers();
    const workers: StandInWorker[] = [];
    const maker = new WorkerFlatMaker(() => {
      workers.push(new StandInWorker());
      return workers[workers.length - 1];
    });
    const made = maker.make(need(12), load);
    await vi.advanceTimersByTimeAsync(1);
    await made;
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(workers[0].terminated).toBe(true);
    const again = maker.make(need(12), load);
    await vi.advanceTimersByTimeAsync(1);
    expect(await again).toEqual(flatTexture(FLAT, need(12)));
    expect(workers).toHaveLength(2);
    maker.dispose();
  });

  it("makes flats on the main thread where no worker starts or the worker fails", async () => {
    const none = new WorkerFlatMaker(() => {
      throw new Error("no workers here");
    });
    expect(await none.make(need(12), load)).toEqual(flatTexture(FLAT, need(12)));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const broken = new BrokenWorker();
    const failing = new WorkerFlatMaker(() => broken);
    expect(await failing.make(need(12), load)).toEqual(flatTexture(FLAT, need(12)));
    expect(await failing.make(need(30), load)).toEqual(flatTexture(FLAT, need(30)));
    expect(broken.terminated).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("is the same texture on the main thread", async () => {
    expect(await onMainThread.make(need(12), load)).toEqual(flatTexture(FLAT, need(12)));
  });
});

/** A maker whose variants are made when the test says; one whose request was
 *  aborted before then is skipped, as the worker skips it. */
function heldMaker() {
  const waiting: { need: FlatNeed; release: () => void }[] = [];
  const maker: FlatMaker = {
    make: (n, from, signal) =>
      new Promise<Texture | null>((done, fail) =>
        waiting.push({
          need: n,
          release: () => (signal?.aborted ? fail(new Error("skipped")) : void from().then((flat) => done(flat && flatTexture(flat, n)))),
        }),
      ),
    forget: () => undefined,
    dispose: () => undefined,
  };
  const made: string[] = [];
  let rig: Rig | null = null;
  /** Makes (or skips) the variant asked for first. */
  const releaseOne = async () => {
    const next = waiting.shift();
    next?.release();
    await settle();
    if (next && rig?.textures.has(`${STAGE_ID}.flatMaster#${next.need.name}`)) made.push(next.need.name);
  };
  const finish = async () => {
    while (waiting.length) await releaseOne();
  };
  return { maker, waiting, releaseOne, finish, made, watch: (r: Rig) => void (rig = r) };
}

describe("the open photo while its flat variant is being made", () => {
  async function started() {
    const rig = fakeApi(choicePatch({ flat: true, blur: "area", radius: 12 }), [withFile(), withFile({ id: "p2", filename: "DSC_0002.NEF", relPath: "DSC_0002.NEF" })]);
    const held = heldMaker();
    held.watch(rig);
    const c = controllerOn(rig.api, { io: io("flat"), store: memoryStore(), flats: held.maker });
    await c.start();
    const adding = c.addMaster("flat", [file("f.nef")]);
    await settle();
    await held.finish();
    await adding;
    await settle();
    await held.finish();
    const id = c.masters[0].id;
    held.made.length = 0;
    return { rig, c, held, id };
  }
  const bagFlat = (rig: Rig) => [rig.develop.getState().paramBag[VARIANT_KEYS.flat], rig.develop.getState().paramBag[UNIFORM_KEYS.flatSig]];
  /** What the Panel does: the choice and the mirrors it makes, in one write. */
  const set = (rig: Rig, c: Controller, radius: number) => rig.develop.getState().setDynParams(c.withMirrors(choicePatch({ radius })));

  it("names the variant its settings make in the same write as the radius, at every moment", async () => {
    const { rig, c, id } = await started();
    const seen: [unknown, unknown, unknown][] = [];
    rig.develop.subscribe((s) => seen.push([s.paramBag[CHOICE_KEYS.radius], s.paramBag[VARIANT_KEYS.flat], s.paramBag[UNIFORM_KEYS.flatSig]]));
    set(rig, c, 40);
    await settle();
    expect(seen[0]).toEqual([40, flatVariant(id, "area", 40), signature(flatVariant(id, "area", 40))]);
    for (const [radius, name] of seen) expect(name).toBe(flatVariant(id, "area", Number(radius)));
  });

  it("keeps the live view on the variant it had until the new one lands, never drawing without a flat", async () => {
    const { rig, c, held, id } = await started();
    const missing: string[] = [];
    rig.develop.subscribe(() => missing.push(...rig.live().missing));
    set(rig, c, 40);
    await settle();
    expect(rig.live()).toEqual({ drew: [`${STAGE_ID}.flatMaster#${flatVariant(id, "area", 12)}`], missing: [] });
    await held.finish();
    expect(rig.live()).toEqual({ drew: [`${STAGE_ID}.flatMaster#${flatVariant(id, "area", 40)}`], missing: [] });
    expect(rig.viewValues()).toEqual({});
    expect(missing).toEqual([]);
    expect(bagFlat(rig)).toEqual([flatVariant(id, "area", 40), signature(flatVariant(id, "area", 40))]);
  });

  it("makes the radius a drag ends on, and skips the ones it passed that nothing waits for", async () => {
    const { rig, c, held, id } = await started();
    for (let radius = 20; radius <= 40; radius++) {
      set(rig, c, radius);
      await settle();
    }
    await held.finish();
    expect(held.made).toEqual([flatVariant(id, "area", 20), flatVariant(id, "area", 40)]);
    expect(rig.live().drew).toEqual([`${STAGE_ID}.flatMaster#${flatVariant(id, "area", 40)}`]);
  }, 30_000);

  it("saves the radius with its own variant when the photo is left one tick after the change", async () => {
    const { rig, c, id } = await started();
    let left: Record<string, unknown> = {};
    rig.develop.subscribe((s, prev) => {
      if (s.photoId !== prev.photoId) left = prev.paramBag;
    });
    set(rig, c, 40);
    await Promise.resolve();
    rig.develop.setState({ photoId: "p2", paramBag: {} });
    expect(left[CHOICE_KEYS.radius]).toBe(40);
    expect(left[VARIANT_KEYS.flat]).toBe(flatVariant(id, "area", 40));
    expect(left[UNIFORM_KEYS.flatSig]).toEqual(signature(flatVariant(id, "area", 40)));
    await settle();
    expect(rig.viewValues()).toEqual({});
  });

  it("exports the photo corrected with the new blur right after the change", async () => {
    const { rig, c, held, id } = await started();
    set(rig, c, 40);
    const bag = { ...rig.develop.getState().paramBag };
    rig.edits.set("p1", { photoId: "p1", stack: [{ timestamp: 1, label: "Edit", params: NO_PARAMS, paramBag: bag }], currentIndex: 0 });
    const exported = rig.exportPhoto("p1");
    await settle();
    await held.finish();
    expect(await exported).toEqual({ drew: [`${STAGE_ID}.flatMaster#${flatVariant(id, "area", 40)}`], failure: null });
  });
});

describe("a flat variant that can't be made", () => {
  it("lets the live view go to it (drawn without), says why in the panel, and is asked again once the blur changes", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rig = fakeApi(choicePatch({ flat: true, blur: "area", radius: 12 }), [withFile()]);
    const failing = new Set<number>([40]);
    const flats: FlatMaker = {
      ...onMainThread,
      make: async (n, from) => {
        if (failing.has(n.radius)) throw new Error("the worker ran out of memory");
        return onMainThread.make(n, from);
      },
    };
    const c = controllerOn(rig.api, { io: io("flat"), flats });
    await c.start();
    await c.addMaster("flat", [file("f.nef")]);
    await settle();
    await c.settled();
    const id = c.masters[0].id;
    rig.develop.getState().setDynParams(c.withMirrors(choicePatch({ radius: 40 })));
    await settle();
    await c.settled();
    expect(rig.develop.getState().paramBag[VARIANT_KEYS.flat]).toBe(flatVariant(id, "area", 40));
    expect(rig.viewValues()).toEqual({});
    expect(c.notice).toMatch(/couldn't be made.*ran out of memory/);
    failing.clear();
    rig.develop.getState().setDynParams(c.withMirrors(choicePatch({ radius: 41 })));
    await settle();
    await c.settled();
    expect(rig.live().drew).toEqual([`${STAGE_ID}.flatMaster#${flatVariant(id, "area", 41)}`]);
    expect(c.notice).toBeNull();
    vi.restoreAllMocks();
  });
});

describe("stopping", () => {
  it("stops providing before it ends the worker, and a job the worker was given fails at once", async () => {
    const rig = fakeApi({}, [withFile()]);
    const worker = new StandInWorker();
    worker.postMessage = (job) => void worker.posted.push(job);
    const maker = new WorkerFlatMaker(() => worker);
    let providedAtDispose: string[] = [];
    const dispose = maker.dispose.bind(maker);
    maker.dispose = () => {
      providedAtDispose = rig.providers();
      dispose();
    };
    const c = controllerOn(rig.api, { io: io("flat"), flats: maker });
    await c.start();
    const pending = maker.make(need(12), load);
    await settle();
    c.stop();
    expect(providedAtDispose).toEqual([]);
    await expect(pending).rejects.toThrow(/stopped/);
  });
});

describe("the library held at an older version by another window", () => {
  it("says to close the other windows until it can be opened", async () => {
    const rig = fakeApi({}, [withFile()]);
    let tell: (note: string | null) => void = () => undefined;
    const store = { ...memoryStore(), onNote: (listener: (note: string | null) => void) => ((tell = listener), () => undefined) };
    const c = controllerOn(rig.api, { io: io("flat"), store });
    await c.start();
    tell("Close Safelight's other windows to finish updating the calibration library.");
    expect(c.notice).toMatch(/Close Safelight's other windows/);
    tell(null);
    expect(c.notice).toBeNull();
  });
});
