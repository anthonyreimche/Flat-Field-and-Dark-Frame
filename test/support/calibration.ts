// The controller's test rig: RAW reading stubbed by the synthetic camera's
// frames, a library in memory, no other windows and flats made in place
// unless a test says otherwise.

import { Controller, type ControllerDeps, type RawIo } from "../../src/controller";
import { onMainThread } from "../../src/flat-maker";
import type { FrameInfo } from "../../src/frame";
import type { SafelightAPI } from "../../src/safelight";
import { INFO, file, readout } from "./camera";
import { memoryStore, photo } from "./fake-api";

export { H, INFO, W, file, pattern } from "./camera";

export function io(kind: "dark" | "flat", info: FrameInfo = INFO): RawIo {
  const frame = readout(kind);
  return {
    info: async () => info,
    frames: () => ({ read: async () => ({ info, readout: frame }), dispose: () => undefined }),
  };
}

export function controllerOn(api: SafelightAPI, deps: Partial<ControllerDeps> = {}): Controller {
  return new Controller(api, { news: () => null, flats: onMainThread, store: memoryStore(), ...deps });
}

export const withFile = (over = {}) => photo({ fileHandle: { getFile: async () => file("p.nef") } as unknown as FileSystemFileHandle, ...over });

export async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}
