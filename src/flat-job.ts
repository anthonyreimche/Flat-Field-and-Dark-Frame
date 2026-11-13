// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// Making a flat variant's texture: the blur and the packing, tens of
// milliseconds on a full-size master. The worker in flat-worker.ts runs it off
// the main thread, so a blur radius drag doesn't stall the window; the jobs it
// takes are below.

import { flatCorrection, type FlatMaster } from "./flat";
import { packFlat, type Texture } from "./pack";
import type { FlatNeed } from "./resolve";

export function flatTexture(flat: FlatMaster, need: FlatNeed): Texture {
  return packFlat(flatCorrection(flat, need.blur, need.radius), flat.width, flat.height, need.name);
}

/** A variant to make, the master's flat sent along the first time; or a
 *  master to let go of. */
export type FlatJob = { master: string; flat?: FlatMaster; need: FlatNeed } | { forget: string };

export type FlatJobReply = { texture: Texture } | { error: string };

/** The worker's side: keeps the masters it was sent and answers each job. */
export function flatJobs(): (job: FlatJob) => FlatJobReply | null {
  const masters = new Map<string, FlatMaster>();
  return (job) => {
    if ("forget" in job) {
      masters.delete(job.forget);
      return null;
    }
    if (job.flat) masters.set(job.master, job.flat);
    const flat = masters.get(job.master);
    if (!flat) return { error: `master ${job.master} wasn't sent` };
    try {
      return { texture: flatTexture(flat, job.need) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  };
}
