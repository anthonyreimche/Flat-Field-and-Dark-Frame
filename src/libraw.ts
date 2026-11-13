// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// Reads RAW files with the LibRaw build this extension ships (libraw-wasm,
// copied into dist/libraw by scripts/copy-libraw.mjs). Safelight's own decoder
// hands extensions no sensor data, and its LibRaw build carries neither the
// colour filter layout nor the camera matrix, which the calibration needs.
// The wasm runs in its own worker; calls on it go one at a time.

import { EXT_ID } from "./params";
import { frameInfoOf, visibleSize, type FrameInfo, type RawReadout } from "./frame";

declare const __EXT_VERSION__: string;

/** A file under the installed extension's folder. import.meta.url is
 *  undefined in an installed extension's module, so the URL is built the way
 *  core's loader builds it, cache-busted by the version. */
export function assetUrl(rel: string): string {
  const v = typeof __EXT_VERSION__ === "string" ? __EXT_VERSION__ : "";
  return `${location.origin}/__plugins__/${EXT_ID}/${rel}${v ? `?v=${encodeURIComponent(v)}` : ""}`;
}

type Reply = { out?: unknown; error?: string };

/** One LibRaw instance in its worker. */
export class LibRawWorker {
  private worker: Worker;
  private chain: Promise<unknown> = Promise.resolve();

  constructor() {
    this.worker = new Worker(assetUrl("dist/libraw/worker.js"), { type: "module" });
  }

  private call(fn: string, args: unknown[], transfer: Transferable[] = []): Promise<unknown> {
    const run = () =>
      new Promise<unknown>((resolve, reject) => {
        this.worker.onmessage = ({ data }: MessageEvent<Reply>) => (data?.error ? reject(new Error(data.error)) : resolve(data?.out));
        this.worker.onerror = (e) => reject(new Error(e.message || "the LibRaw worker failed"));
        this.worker.postMessage({ fn, args }, transfer);
      });
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  async open(bytes: ArrayBuffer): Promise<void> {
    const view = new Uint8Array(bytes);
    await this.call("open", [view, {}], [view.buffer]);
  }

  metadata(): Promise<unknown> {
    return this.call("metadata", [true]);
  }

  async rawImageData(): Promise<RawReadout | null> {
    const r = (await this.call("rawImageData", [])) as Partial<RawReadout> | undefined;
    if (!r || !(r.data instanceof Uint16Array)) return null;
    const n = (v: unknown) => (typeof v === "number" ? v : 0);
    return {
      raw_width: n(r.raw_width),
      raw_height: n(r.raw_height),
      top_margin: n(r.top_margin),
      left_margin: n(r.left_margin),
      width: n(r.width),
      height: n(r.height),
      data: r.data,
    };
  }

  dispose(): void {
    this.worker.terminate();
  }
}

/** A calibration frame: its details and its whole sensor readout. */
export async function readFrame(worker: LibRawWorker, file: Blob): Promise<{ info: FrameInfo; readout: RawReadout }> {
  await worker.open(await file.arrayBuffer());
  const readout = await worker.rawImageData();
  if (!readout || readout.data.length < readout.raw_width * readout.raw_height || readout.raw_width === 0) {
    throw new Error("LibRaw read no sensor data from it");
  }
  // After the unpack, so a black level measured from masked sensels is in.
  const meta = await worker.metadata();
  return { info: frameInfoOf(meta, visibleSize(readout)), readout };
}

/** A photo's details without its pixels: only the header is read. */
export async function readInfo(worker: LibRawWorker, file: Blob): Promise<FrameInfo> {
  await worker.open(await file.arrayBuffer());
  const meta = (await worker.metadata()) as Record<string, number> | undefined;
  const n = (k: string) => (typeof meta?.[k] === "number" ? meta[k] : 0);
  const size = visibleSize({
    raw_width: n("raw_width"),
    raw_height: n("raw_height"),
    top_margin: n("top_margin"),
    left_margin: n("left_margin"),
    width: n("width"),
    height: n("height"),
  });
  return frameInfoOf(meta, size);
}
