// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// Keeps the library, the stage's textures and the open photo's mirrors in
// step. Safelight asks for a master's texture (a dark, or a flat at a blur)
// when a frame whose bag names it first needs it, and lets go of the least
// recently drawn when they don't all fit: the textures are made here from the
// store on demand (dark masters packed, flats blurred in a worker,
// flat-maker.ts), so a thumbnail or an export of any photo finds what it names,
// in any window, and nothing is read at start.
//
// The open photo's bag names the textures its settings make, written with the
// settings themselves, so whatever is saved, whenever, names the right ones.
// Until a new one is held, view values (never saved or exported) keep the live
// view drawing with the one it had, so a blur radius drag never shows the photo
// uncorrected; radii passed on the way are skipped. The app's other windows
// hear of masters added and removed (news.ts), so their library lists follow
// and their renderers let go of a removed master's textures.

import type { BlurType } from "./flat";
import { WorkerFlatMaker, type FlatMaker } from "./flat-maker";
import { BuildError, buildMaster, type MasterKind, type MasterSummary } from "./library";
import { LibRawWorker, readFrame, readInfo } from "./libraw";
import { broadcastNews, type LibraryNews, type NewsLine, type OpenNews } from "./news";
import { packDark, signature, type Texture } from "./pack";
import { CHOICE_KEYS, STAGE_ID, TEXTURE_KEYS, UNIFORM_KEYS, VARIANT_KEYS, choicePatch, readChoices } from "./params";
import { changed, darkVariant, parseDarkVariant, parseFlatVariant, resolve, type PhotoFacts, type PhotoStatus } from "./resolve";
import type { CatalogPhoto, DevelopState, SafelightAPI, StageTextureData } from "./safelight";
import { unsupportedReason, type FrameInfo, type RawReadout } from "./frame";
import { indexedDbStore, type CalibrationStore, type PhotoSensor } from "./storage";
import { correctionStage } from "./stage";

const warn = (what: string) => (e: unknown) => console.warn(`[flat-field-dark-frame] ${what}`, e);

export function isRawMime(mimeType: string | undefined): boolean {
  return typeof mimeType === "string" && mimeType.startsWith("image/x-");
}

export function factsOf(photo: Pick<CatalogPhoto, "mimeType" | "rotation" | "exif">): PhotoFacts {
  return { isRaw: isRawMime(photo.mimeType), rotation: photo.rotation, orientation: photo.exif?.orientation, rawExposureBias: photo.exif?.rawExposureBias };
}

const sensorKey = (p: Pick<CatalogPhoto, "id" | "fileSize" | "dateCreated">) => `${p.id}:${p.fileSize}:${p.dateCreated}`;

const stageData = (t: Texture): StageTextureData => ({ data: t.data, width: t.width, height: t.height, format: "rgba16f", version: 1 });

/** Each texture's variant name and signature in the bag. */
const VARIANT_ENTRIES = [
  { texture: TEXTURE_KEYS.dark, name: VARIANT_KEYS.dark, signature: UNIFORM_KEYS.darkSig },
  { texture: TEXTURE_KEYS.flat, name: VARIANT_KEYS.flat, signature: UNIFORM_KEYS.flatSig },
] as const;

export interface Progress {
  kind: MasterKind;
  done: number;
  total: number;
}

type Listener = () => void;

/** How the controller reads RAW files; LibRaw in its worker unless a test
 *  hands it another. `frames` opens a reader for one master's frames. */
export interface RawIo {
  info(file: Blob): Promise<FrameInfo>;
  frames(): { read(file: Blob): Promise<{ info: FrameInfo; readout: RawReadout }>; dispose(): void };
}

/** What the controller works through; each has a default for the app. */
export interface ControllerDeps {
  io: RawIo;
  store: CalibrationStore;
  news: OpenNews;
  flats: FlatMaker;
}

export class Controller {
  private summaries = new Map<string, MasterSummary>();
  private sensors = new Map<string, PhotoSensor>();
  private reading = new Map<string, Promise<PhotoSensor>>();
  /** The textures the open photo's edit asks for that aren't held yet, newest
   *  ask only, as [texture key, variant]; `target` names it. */
  private wanted: [string, string][] | null = null;
  private target: string | null = null;
  private making: Promise<void> | null = null;
  /** The photo the live view draws, and the variant it draws under each bag
   *  key: the bag's own, or the one view values keep on show until it is held. */
  private shownFor: string | null = null;
  private shown: Record<string, string> = {};
  private override: Record<string, unknown> = {};
  private unmadeNote: string | null = null;
  private libraryNote: string | null = null;
  private listeners = new Set<Listener>();
  private unsubscribers: (() => void)[] = [];
  private infoWorker: LibRawWorker | null = null;
  private infoIdle: ReturnType<typeof setTimeout> | null = null;
  private summaryList: MasterSummary[] = [];
  private running = false;
  private line: NewsLine | null = null;
  /** News from the other windows, heard in order once the library is listed. */
  private inbox: Promise<void> = Promise.resolve();
  private readonly io: RawIo;
  private readonly store: CalibrationStore;
  private readonly openNews: OpenNews;
  private readonly flats: FlatMaker;
  status: PhotoStatus = { blocked: null, reading: false, dark: { state: "off" }, flat: { state: "off" } };
  progress: Progress | null = null;
  loaded = false;

  /** What the panel tells the person beside the photo's status, or null. */
  get notice(): string | null {
    return this.libraryNote ?? this.unmadeNote;
  }

  constructor(
    private readonly api: SafelightAPI,
    deps: Partial<ControllerDeps> = {},
  ) {
    this.io = deps.io ?? {
      info: async (file) => readInfo(this.worker(), file),
      frames: () => {
        const worker = new LibRawWorker();
        return { read: (file) => readFrame(worker, file), dispose: () => worker.dispose() };
      },
    };
    this.store = deps.store ?? indexedDbStore;
    this.openNews = deps.news ?? broadcastNews;
    this.flats = deps.flats ?? new WorkerFlatMaker();
  }

  async start(): Promise<void> {
    this.api.registerProcessingStage(correctionStage());
    this.api.setStageTextureProvider(STAGE_ID, TEXTURE_KEYS.dark, (variant) => this.darkTexture(variant));
    this.api.setStageTextureProvider(STAGE_ID, TEXTURE_KEYS.flat, (variant, signal) => this.flatTexture(variant, signal));
    const develop = this.api.stores.useDevelopStore;
    this.unsubscribers.push(
      develop.subscribe((s: DevelopState, prev: DevelopState) => {
        if (s.photoId !== prev.photoId || s.paramBag !== prev.paramBag) void this.refresh();
      }),
      this.api.stores.useCatalogStore.subscribe((s, prev) => {
        if (s.photos !== prev.photos) void this.refresh();
      }),
    );
    this.running = true;
    const offNote = this.store.onNote?.((note) => {
      this.libraryNote = note;
      this.emit();
    });
    if (offNote) this.unsubscribers.push(offNote);
    let ready!: () => void;
    this.inbox = new Promise<void>((r) => (ready = r));
    this.line = this.openNews((news) => {
      this.inbox = this.inbox.then(() => this.hear(news)).catch(warn("news from another window couldn't be taken in"));
    });
    try {
      for (const summary of await this.store.loadSummaries()) this.summaries.set(summary.id, summary);
    } catch (e) {
      warn("the calibration library couldn't be read")(e);
    }
    this.loaded = true;
    ready();
    this.changedLibrary();
    await this.refresh();
  }

  stop(): void {
    this.running = false;
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    this.line?.close();
    this.line = null;
    this.wanted = null;
    this.setOverride({});
    // Before the worker ends: a frame still waiting fails at once, saying why.
    this.api.setStageTextureProvider(STAGE_ID, TEXTURE_KEYS.dark, null);
    this.api.setStageTextureProvider(STAGE_ID, TEXTURE_KEYS.flat, null);
    this.flats.dispose();
    this.infoWorker?.dispose();
    this.infoWorker = null;
    if (this.infoIdle) clearTimeout(this.infoIdle);
    this.api.unregisterProcessingStage(STAGE_ID);
  }

  // ── The library ─────────────────────────────────────────────────────────────

  get masters(): readonly MasterSummary[] {
    return this.summaryList;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private changedLibrary(): void {
    this.summaryList = [...this.summaries.values()].sort((a, b) => b.created - a.created);
    this.emit();
  }

  /** Build a master from RAW files and add it to the library. Resolves with
   *  why it couldn't, or null. */
  async addMaster(kind: MasterKind, files: readonly File[]): Promise<string | null> {
    if (this.progress) return "A master is being built already.";
    const reader = this.io.frames();
    this.progress = { kind, done: 0, total: files.length };
    this.emit();
    try {
      const id = Math.random().toString(36).slice(2, 10);
      const record = await buildMaster(kind, files.length, async (i) => {
        const frame = await reader.read(files[i]).catch((e: unknown) => {
          throw new BuildError(`${files[i].name} couldn't be read: ${e instanceof Error ? e.message : String(e)}.`);
        });
        this.progress = { kind, done: i + 1, total: files.length };
        this.emit();
        return { name: files[i].name, ...frame };
      }, id);
      await this.store.saveMaster(record);
      this.summaries.set(id, record.summary);
      this.tell({ kind: "master-added", id });
      this.changedLibrary();
      void this.refresh();
      return null;
    } catch (e) {
      return e instanceof BuildError ? e.message : `The master couldn't be built: ${e instanceof Error ? e.message : String(e)}.`;
    } finally {
      reader.dispose();
      this.progress = null;
      this.emit();
    }
  }

  async removeMaster(id: string): Promise<void> {
    if (!this.summaries.has(id)) return;
    await this.store.deleteMaster(id);
    this.forget(id);
    this.tell({ kind: "master-removed", id });
  }

  /** Lets a master go, and the textures made of it. Which flat variants were
   *  made of it isn't known here, so every flat is let go, to be made again. */
  private forget(id: string): void {
    this.summaries.delete(id);
    this.flats.forget(id);
    this.api.dropStageTextureVariants(STAGE_ID, TEXTURE_KEYS.dark, darkVariant(id));
    this.api.dropStageTextureVariants(STAGE_ID, TEXTURE_KEYS.flat);
    this.changedLibrary();
    void this.refresh();
  }

  // ── The other windows ───────────────────────────────────────────────────────

  private tell(news: LibraryNews): void {
    try {
      this.line?.post(news);
    } catch (e) {
      warn("the other windows couldn't be told of a change to the library")(e);
    }
  }

  private async hear(news: LibraryNews): Promise<void> {
    if (!this.running) return;
    if (news.kind === "master-removed") return this.forget(news.id);
    if (this.summaries.has(news.id)) return;
    const summary = await this.store.loadSummary(news.id);
    if (!summary || !this.running || this.summaries.has(news.id)) return;
    this.summaries.set(news.id, summary);
    this.changedLibrary();
    void this.refresh();
  }

  // ── Textures, made when Safelight asks ──────────────────────────────────────

  private async darkTexture(variant: string): Promise<StageTextureData | null> {
    const id = parseDarkVariant(variant);
    const record = id ? await this.store.loadMaster(id) : null;
    return record?.dark ? stageData(packDark(record.dark, variant)) : null;
  }

  private async flatTexture(variant: string, signal: AbortSignal): Promise<StageTextureData | null> {
    const need = parseFlatVariant(variant);
    if (!need) return null;
    const made = await this.flats.make(need, async () => (await this.store.loadMaster(need.id))?.flat ?? null, signal);
    return made && stageData(made);
  }

  /** `patch` and the mirrors the open photo's bag needs with it, for one write:
   *  the edit names the textures its settings make at every moment. The live
   *  view keeps the ones it draws with until the new ones are held. */
  withMirrors(patch: Record<string, unknown>): Record<string, unknown> {
    const develop = this.api.stores.useDevelopStore.getState();
    const photo = this.photo(develop.photoId);
    if (!photo) return patch;
    const bag = { ...develop.paramBag, ...patch };
    const choices = readChoices((k) => bag[k]);
    const facts = factsOf(photo);
    const sensor = this.sensors.get(sensorKey(photo)) ?? null;
    // Without the details yet, refresh writes the mirrors once they are read.
    if ((!choices.dark && !choices.flat) || (facts.isRaw && !sensor)) return patch;
    const mirrors = changed(bag, resolve(choices, facts, sensor, this.masters).mirrors) ?? {};
    this.follow(photo.id, { ...bag, ...mirrors });
    return { ...patch, ...mirrors };
  }

  /** Keeps the live view on what it draws for the open photo while the
   *  textures `bag` names are made, the newest ask only. */
  private follow(photoId: string, bag: Readonly<Record<string, unknown>>): void {
    const names: Record<string, string> = {};
    for (const entry of VARIANT_ENTRIES) {
      const name = bag[entry.name];
      names[entry.name] = typeof name === "string" ? name : "";
    }
    const unmade = photoId === this.shownFor ? VARIANT_ENTRIES.filter((e) => names[e.name] && names[e.name] !== this.shown[e.name]) : [];
    if (photoId !== this.shownFor || unmade.length === 0) {
      this.shownFor = photoId;
      this.shown = names;
      this.target = null;
      this.wanted = null;
      this.setOverride({});
      return;
    }
    const view: Record<string, unknown> = {};
    for (const entry of VARIANT_ENTRIES) {
      const old = this.shown[entry.name];
      if (!unmade.includes(entry)) this.shown[entry.name] = names[entry.name];
      else if (old) {
        view[entry.name] = old;
        view[entry.signature] = signature(old);
      }
    }
    this.setOverride(view);
    this.prepare(unmade.map((e) => [e.texture, names[e.name]]));
  }

  private setOverride(view: Record<string, unknown>): void {
    const same = Object.keys(view).length === Object.keys(this.override).length && Object.entries(view).every(([k, v]) => this.override[k] === v);
    if (same) return;
    this.override = view;
    this.api.develop.setViewValues(Object.keys(view).length ? view : null);
  }

  /** Has the open photo's textures `names` made, the newest ask only, then
   *  lets the live view draw with them. */
  private prepare(names: [string, string][]): void {
    const target = names.map((n) => n.join(":")).join("|");
    if (target === this.target) return;
    this.target = target;
    this.wanted = names;
    this.unmadeNote = null;
    this.emit();
    void this.work();
  }

  private work(): Promise<void> {
    this.making ??= (async () => {
      while (this.wanted && this.running) {
        const names = this.wanted;
        const target = this.target;
        this.wanted = null;
        const failures = await Promise.all(
          names.map(([key, variant]) =>
            this.api.prepareStageTextureVariant(STAGE_ID, key, variant).then(
              () => null,
              (e: unknown) => [key, variant, e instanceof Error ? e.message : String(e)] as const,
            ),
          ),
        );
        if (target !== this.target) continue;
        this.target = null;
        for (const [key, variant] of names) {
          const entry = VARIANT_ENTRIES.find((e) => e.texture === key);
          if (entry) this.shown[entry.name] = variant;
        }
        for (const f of failures) {
          if (!f) continue;
          const [key, variant, reason] = f;
          warn(`the texture ${variant} couldn't be made`)(reason);
          this.unmadeNote = `The ${key === TEXTURE_KEYS.dark ? "dark frame" : "flat field"} for these settings couldn't be made (${reason}), so the photo is shown without it.`;
        }
        this.setOverride({});
        this.emit();
      }
    })().finally(() => {
      this.making = null;
    });
    return this.making;
  }

  /** Resolves once the live view draws the textures the open photo's edit
   *  names (or they couldn't be made). */
  async settled(): Promise<void> {
    while (this.making) await this.making;
  }

  // ── Photos ──────────────────────────────────────────────────────────────────

  private photo(id: string | null): CatalogPhoto | undefined {
    return id ? this.api.stores.useCatalogStore.getState().photos.find((p) => p.id === id) : undefined;
  }

  /** The LibRaw that reads photos' sensor details: started on the first read,
   *  ended after half a minute without one. */
  private worker(): LibRawWorker {
    if (this.infoIdle) clearTimeout(this.infoIdle);
    this.infoIdle = setTimeout(() => {
      this.infoWorker?.dispose();
      this.infoWorker = null;
    }, 30_000);
    this.infoWorker ??= new LibRawWorker();
    return this.infoWorker;
  }

  /** A photo's sensor details: remembered, stored, or read from its original. */
  sensorOf(photo: CatalogPhoto): PhotoSensor | Promise<PhotoSensor> {
    const key = sensorKey(photo);
    const known = this.sensors.get(key);
    if (known) return known;
    let pending = this.reading.get(key);
    if (!pending) {
      pending = (async (): Promise<PhotoSensor> => {
        const stored = await this.store.loadPhotoSensor(key).catch(() => null);
        if (stored) return stored;
        const file = await photo.fileHandle?.getFile().catch(() => null);
        if (!file) return { info: null, unsupported: "its original file isn't available" };
        let result: PhotoSensor;
        try {
          const info = await this.io.info(file);
          const why = unsupportedReason(info);
          result = why ? { info: null, unsupported: why } : { info, unsupported: null };
        } catch (e) {
          result = { info: null, unsupported: `LibRaw couldn't read it (${e instanceof Error ? e.message : String(e)})` };
        }
        await this.store.savePhotoSensor(key, result).catch(() => undefined);
        return result;
      })().then((r) => {
        this.sensors.set(key, r);
        this.reading.delete(key);
        return r;
      });
      this.reading.set(key, pending);
    }
    return pending;
  }

  /** Bring the open photo's mirrors in line with its choices. */
  async refresh(): Promise<void> {
    if (!this.loaded) return;
    const develop = this.api.stores.useDevelopStore.getState();
    const photo = this.photo(develop.photoId);
    if (!photo) {
      this.setStatus({ blocked: null, reading: false, dark: { state: "off" }, flat: { state: "off" } });
      return;
    }
    const bag = develop.paramBag;
    const choices = readChoices((k) => bag[k]);
    const facts = factsOf(photo);
    let sensor: PhotoSensor | null = null;
    if ((choices.dark || choices.flat) && facts.isRaw) {
      const s = this.sensorOf(photo);
      if (s instanceof Promise) {
        this.setStatus(resolve(choices, facts, null, this.masters).status);
        await s;
        return this.refresh();
      }
      sensor = s;
    }
    const r = resolve(choices, facts, sensor, this.masters);
    this.setStatus(r.status);
    if (!choices.dark && !choices.flat) return this.follow(photo.id, {});
    const now = this.api.stores.useDevelopStore.getState();
    if (now.photoId !== photo.id) return;
    const patch = changed(now.paramBag, r.mirrors);
    this.follow(photo.id, patch ? { ...now.paramBag, ...patch } : now.paramBag);
    if (patch) now.setDynParams(patch);
  }

  private setStatus(s: PhotoStatus): void {
    this.status = s;
    this.emit();
  }

  /** The Library's "Match calibration frames": turn both corrections on with
   *  automatic matching for each photo that has a match, as one undo step each.
   *  A photo that isn't open has its textures made when a frame first needs them. */
  async applyTo(ids: readonly string[]): Promise<{ applied: number; skipped: number }> {
    let applied = 0;
    let skipped = 0;
    for (const id of ids) {
      const photo = this.photo(id);
      if (!photo || !isRawMime(photo.mimeType)) {
        skipped++;
        continue;
      }
      const sensor = await this.sensorOf(photo);
      const want = { ...choicePatch({ dark: true, flat: true, darkPick: "auto", flatPick: "auto" }) };
      const state = await this.api.catalog.getEditState(id);
      const current = state?.stack[state.currentIndex];
      const bag = { ...(current?.paramBag ?? {}), ...want };
      const choices = readChoices((k) => bag[k]);
      const r = resolve(choices, factsOf(photo), sensor, this.masters);
      if (r.status.dark.state !== "matched" && r.status.flat.state !== "matched") {
        skipped++;
        continue;
      }
      const next = {
        ...bag,
        ...choicePatch({ dark: r.status.dark.state === "matched", flat: r.status.flat.state === "matched" }),
        ...r.mirrors,
      };
      if (this.api.stores.useDevelopStore.getState().photoId === id) {
        const develop = this.api.stores.useDevelopStore.getState();
        this.follow(id, next);
        develop.setDynParams(next);
        await develop.commitEdit("Match calibration frames");
      } else if (state && current) {
        const stack = [...state.stack.slice(0, state.currentIndex + 1), { timestamp: Date.now(), label: "Match calibration frames", params: current.params, paramBag: next }];
        await this.api.catalog.putEditState({ photoId: id, stack, currentIndex: stack.length - 1 });
      } else {
        skipped++;
        continue;
      }
      applied++;
    }
    return { applied, skipped };
  }
}

export const BLUR_LABELS: Record<BlurType, string> = {
  area: "Area",
  vertical: "Vertical",
  horizontal: "Horizontal",
  "vertical-horizontal": "Vertical + horizontal",
};

/** Keys whose change makes the open photo's mirrors stale. */
export const WATCHED_KEYS = Object.values(CHOICE_KEYS);
