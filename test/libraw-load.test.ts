// When the bundled LibRaw is loaded: its worker (and with it the wasm) only
// when a calibration frame or a photo's sensor details are read, never at
// start, while the corrections are off, or for a photo whose details are on
// record. The real reader is replaced by a counting stand-in; the controller
// runs on its default RAW reading.

import { describe, expect, it, vi } from "vitest";
import { choicePatch } from "../src/params";
import { fakeApi, memoryStore } from "./support/fake-api";
import { controllerOn, file, settle, withFile } from "./support/calibration";

const libraw = vi.hoisted(() => ({ made: 0, live: 0, infoReads: 0, frameReads: 0 }));

vi.mock("../src/libraw", async () => {
  const { INFO, readout } = await import("./support/camera");
  return {
    LibRawWorker: class {
      constructor() {
        libraw.made++;
        libraw.live++;
      }
      dispose() {
        libraw.live--;
      }
    },
    readInfo: async () => {
      libraw.infoReads++;
      return INFO;
    },
    readFrame: async () => {
      libraw.frameReads++;
      return { info: INFO, readout: readout("dark") };
    },
  };
});

const reset = () => Object.assign(libraw, { made: 0, live: 0, infoReads: 0, frameReads: 0 });
const two = () => [withFile({ id: "p1" }), withFile({ id: "p2", filename: "DSC_0002.NEF", relPath: "DSC_0002.NEF" })];

describe("the bundled LibRaw", () => {
  it("isn't loaded at start, on a photo switch or anywhere while both corrections are off", async () => {
    reset();
    const rig = fakeApi({}, two());
    const c = controllerOn(rig.api, { store: memoryStore() });
    await c.start();
    rig.develop.setState({ photoId: "p2" });
    await settle();
    rig.develop.setState({ photoId: "p1" });
    await settle();
    expect(libraw.made).toBe(0);
    c.stop();
  });

  it("reads a photo's sensor details once: a later visit and the next start take them from the store", async () => {
    reset();
    const store = memoryStore();
    const rig = fakeApi(choicePatch({ flat: true }), two());
    const c = controllerOn(rig.api, { store });
    await c.start();
    await settle();
    expect([libraw.made, libraw.infoReads]).toEqual([1, 1]);
    rig.develop.setState({ photoId: "p2", paramBag: {} });
    await settle();
    rig.develop.setState({ photoId: "p1", paramBag: choicePatch({ flat: true }) });
    await settle();
    expect(libraw.infoReads).toBe(1);
    c.stop();
    expect(libraw.live).toBe(0);

    const next = fakeApi(choicePatch({ flat: true }), two());
    const again = controllerOn(next.api, { store });
    await again.start();
    await settle();
    expect([libraw.made, libraw.infoReads]).toEqual([1, 1]);
    expect(again.status.flat.state).toBe("none");
    again.stop();
  });

  it("reads calibration frames in a LibRaw of their own, ended when the master is built", async () => {
    reset();
    const rig = fakeApi({}, two());
    const c = controllerOn(rig.api, { store: memoryStore() });
    await c.start();
    expect(await c.addMaster("dark", [file("d1.nef"), file("d2.nef")])).toBeNull();
    expect([libraw.made, libraw.frameReads, libraw.live]).toEqual([1, 2, 0]);
    c.stop();
  });
});
