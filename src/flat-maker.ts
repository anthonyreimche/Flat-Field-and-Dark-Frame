// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// Makes flat variants for the controller: in a worker of their own, or on the
// main thread where a worker can't be had. A master's flat is read (`load`)
// only when the worker doesn't hold it yet: the worker keeps a copy of each it
// was sent and ends after a while without work, letting them go.

import type { FlatMaster } from "./flat";
import { flatTexture, type FlatJob, type FlatJobReply } from "./flat-job";
import FlatWorker from "./flat-worker?worker&inline";
import type { Texture } from "./pack";
import type { FlatNeed } from "./resolve";

export interface FlatMaker {
  /** The texture of `need`'s variant, or null when `load` finds no master.
   *  Skipped (rejected) when `signal` aborted before its turn: nothing needs it. */
  make(need: FlatNeed, load: () => Promise<FlatMaster | null>, signal?: AbortSignal): Promise<Texture | null>;
  /** Lets go of a master taken out of the library. */
  forget(masterId: string): void;
  dispose(): void;
}

export const onMainThread: FlatMaker = {
  make: async (need, load, signal) => {
    signal?.throwIfAborted();
    const flat = await load();
    return flat && flatTexture(flat, need);
  },
  forget: () => undefined,
  dispose: () => undefined,
};

/** The worker as the maker talks to it. */
export interface JobWorker {
  onmessage: ((e: MessageEvent<FlatJobReply>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(job: FlatJob): void;
  terminate(): void;
}

export const IDLE_MS = 30_000;

class WorkerLost extends Error {}

export class WorkerFlatMaker implements FlatMaker {
  private worker: JobWorker | null = null;
  private sent = new Set<string>();
  private failed = false;
  private chain: Promise<unknown> = Promise.resolve();
  private idle: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  /** Fails the job the worker has, when the maker is stopped under it. */
  private abandon: ((e: Error) => void) | null = null;

  constructor(private readonly open: () => JobWorker = () => new FlatWorker({ name: "Flat field blur" })) {}

  make(need: FlatNeed, load: () => Promise<FlatMaster | null>, signal?: AbortSignal): Promise<Texture | null> {
    const run = () => {
      signal?.throwIfAborted();
      return this.run(need, load);
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  forget(masterId: string): void {
    if (!this.sent.delete(masterId)) return;
    this.worker?.postMessage({ forget: masterId } satisfies FlatJob);
  }

  /** Ends the worker; the job it has and any after fail. */
  dispose(): void {
    this.stopped = true;
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    this.abandon?.(new Error("the flat field maker was stopped"));
    this.end();
  }

  private start(): JobWorker | null {
    if (this.failed) return null;
    try {
      this.worker ??= this.open();
    } catch {
      this.failed = true;
    }
    return this.worker;
  }

  private end(): void {
    this.worker?.terminate();
    this.worker = null;
    this.sent.clear();
  }

  private async run(need: FlatNeed, load: () => Promise<FlatMaster | null>): Promise<Texture | null> {
    if (this.stopped) throw new Error("the flat field maker was stopped");
    if (this.idle) clearTimeout(this.idle);
    const worker = this.start();
    if (!worker) return onMainThread.make(need, load);
    let flat: FlatMaster | null = null;
    if (!this.sent.has(need.id)) {
      flat = await load();
      if (!flat) return null;
      if (this.stopped || this.worker !== worker) return this.run(need, load);
    }
    try {
      return await new Promise<Texture>((resolve, reject) => {
        this.abandon = reject;
        worker.onmessage = ({ data }: MessageEvent<FlatJobReply>) => ("texture" in data ? resolve(data.texture) : reject(new Error(data.error)));
        worker.onerror = (e) => {
          e.preventDefault();
          reject(new WorkerLost(e.message || "the flat field worker failed"));
        };
        this.sent.add(need.id);
        worker.postMessage({ master: need.id, flat: flat ?? undefined, need } satisfies FlatJob);
      });
    } catch (e) {
      if (!(e instanceof WorkerLost)) throw e;
      console.warn("[flat-field-dark-frame] the flat field worker failed; flats are made on the main thread from now on", e);
      this.failed = true;
      this.end();
      return onMainThread.make(need, load);
    } finally {
      this.abandon = null;
      if (!this.stopped) this.idle = setTimeout(() => this.end(), IDLE_MS);
    }
  }
}
