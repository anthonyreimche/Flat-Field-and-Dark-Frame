// A stand-in Safelight API for unit tests, over real React and zustand. It has
// only what this extension uses: reading any other member throws, naming it,
// so a test shows what to add here when the extension starts using more.
//
// The open photo's edit is a param bag in a zustand develop store, read by the
// panel through useParamScope and by the controller through the store, as in
// Safelight. Core's Slider is a stub that keeps the props it was last drawn
// with; the UI kit's controls are plain elements a test can drive.

import * as React from "react";
import { createPortal } from "react-dom";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import type {
  CatalogPhoto,
  EditState,
  GridMenuItemContribution,
  PanelContribution,
  ParamScope,
  ProcessingStageContribution,
  SafelightAPI,
  SelectProps,
  SliderProps,
  StageTextureData,
  ToggleProps,
  WindowContribution,
} from "../../src/safelight";
import { EXT_ID } from "../../src/params";
import type { MasterRecord } from "../../src/library";
import type { CalibrationStore, PhotoSensor } from "../../src/storage";
import type { LibraryNews, OpenNews } from "../../src/news";

interface DevelopSlice {
  photoId: string | null;
  paramBag: Record<string, unknown>;
  setDynParams(patch: Record<string, unknown>): void;
  commitEdit(label: string): Promise<void>;
}

export interface Rig {
  api: SafelightAPI;
  panels: PanelContribution[];
  stages: ProcessingStageContribution[];
  menus: GridMenuItemContribution[];
  windows: WindowContribution[];
  /** The ids api.windows.open was called with, in order. */
  opened: string[];
  /** The saved edits getEditState hands back, by photo id. */
  edits: Map<string, EditState>;
  /** Stage textures by "{stageId}.{key}#{variant}". */
  textures: Map<string, StageTextureData>;
  /** The bytes the extension's stage textures may take, as core's 256 MB. */
  budget: number;
  /** Each variant a provider was asked for, as "{stageId}.{key}#{variant}". */
  asked: string[];
  /** The stage texture keys a provider is set for. */
  providers(): string[];
  /** The view values the extension has the live view draw over the photo's bag. */
  viewValues(): Record<string, unknown>;
  /** The provided textures the live view draws with now: held, or missing. */
  live(): { drew: string[]; missing: string[] };
  /** Draws a headless frame of `bag`, as an export does: waits for the variants
   *  made on demand it names. Which of its named textures it drew with, or why
   *  it failed. */
  frame(bag: Record<string, unknown>): Promise<{ drew: string[]; failure: string | null }>;
  /** frame() of a photo's saved edit. */
  exportPhoto(photoId: string): Promise<{ drew: string[]; failure: string | null }>;
  settings: Map<string, unknown>;
  develop: UseBoundStore<StoreApi<DevelopSlice>>;
  catalog: UseBoundStore<StoreApi<{ photos: CatalogPhoto[] }>>;
  /** The labels of the undo steps the extension made, in order. */
  commits: string[];
  sliders(root: ParentNode): SliderProps[];
}

export function photo(over: Partial<CatalogPhoto> = {}): CatalogPhoto {
  return {
    id: "p1",
    filename: "DSC_0001.NEF",
    relPath: "DSC_0001.NEF",
    folder: "",
    directoryHandle: null,
    fileHandle: null,
    thumbnailBlob: null,
    thumbnailUrl: null,
    width: 6048,
    height: 4032,
    fileSize: 30_000_000,
    mimeType: "image/x-nikon-nef",
    rating: 0,
    colorLabel: "none",
    flag: "none",
    rotation: 0,
    keywords: [],
    dateCreated: 1,
    dateImported: 1,
    exif: { cameraMake: "Nikon", cameraModel: "Z 6_2" },
    ...over,
  };
}

export function fakeApi(initial: Record<string, unknown> = {}, photos: CatalogPhoto[] = [photo()]): Rig {
  const panels: PanelContribution[] = [];
  const stages: ProcessingStageContribution[] = [];
  const menus: GridMenuItemContribution[] = [];
  const windows: WindowContribution[] = [];
  const opened: string[] = [];
  const edits = new Map<string, EditState>();
  const textures = new Map<string, StageTextureData>();
  const settings = new Map<string, unknown>();
  const commits: string[] = [];
  const defaults = new Map<string, unknown>();
  const sliderProps = new Map<number, SliderProps>();
  let nextSlider = 0;

  // Core's stage texture variants made on demand (api.setStageTextureProvider),
  // in small: asked once while in flight, held within `budget`, the least
  // recently bound let go first, never one the live bag names or a frame in
  // flight draws with. As in core, the live bag is the develop store's (the
  // Develop view hands core every change of it), a provider set is asked at once
  // for what it names, and what a request brings after its variant was dropped
  // is let go of and asked for again.
  const providers = new Map<string, (variant: string, signal: AbortSignal) => Promise<StageTextureData | null>>();
  const used = new Map<string, number>();
  const inflight = new Map<string, Promise<string | null>>();
  const aborts = new Map<string, AbortController>();
  /** As core: a request no frame waits for and the live view no longer names is let go, its signal aborted. */
  const dropUnneeded = () => {
    for (const [key, abort] of [...aborts]) {
      if (pins.has(key) || liveKeys.includes(key)) continue;
      abort.abort();
      aborts.delete(key);
      inflight.delete(key);
    }
  };
  const generations = new Map<string, number>();
  const absent = new Set<string>();
  const pins = new Map<string, number>();
  const asked: string[] = [];
  let liveKeys: string[] = [];
  let clock = 0;
  const named = (bag: Record<string, unknown>) =>
    [...providers.keys()].flatMap((plain) => (typeof bag[plain] === "string" && bag[plain] ? [[`${plain}#${String(bag[plain])}`, plain, String(bag[plain])] as const] : []));
  const ask = (key: string, plain: string, variant: string): Promise<string | null> => {
    if (textures.has(key) || absent.has(key)) return Promise.resolve(null);
    const running = inflight.get(key);
    if (running) return running;
    const provide = providers.get(plain);
    if (!provide) return Promise.resolve(null);
    asked.push(key);
    const generation = generations.get(key) ?? 0;
    const abort = new AbortController();
    aborts.set(key, abort);
    const outcome = provide(variant, abort.signal)
      .then((tex): string | null | Promise<string | null> => {
        if (abort.signal.aborted) return null;
        if ((generations.get(key) ?? 0) !== generation) {
          inflight.delete(key);
          return providers.has(plain) ? ask(key, plain, variant) : `${plain} was turned off`;
        }
        if (!tex) {
          absent.add(key);
          return null;
        }
        let held = [...textures.values()].reduce((n, t) => n + t.data.byteLength, tex.data.byteLength);
        const free = [...textures.keys()].filter((k) => !pins.has(k) && !liveKeys.includes(k)).sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0));
        while (held > rig.budget && free.length) {
          const out = free.shift()!;
          held -= textures.get(out)!.data.byteLength;
          textures.delete(out);
        }
        if (held > rig.budget) return `no room for ${key}`;
        textures.set(key, tex);
        used.set(key, ++clock);
        return null;
      })
      .catch((e: unknown) => (abort.signal.aborted ? null : e instanceof Error ? e.message : String(e)))
      .finally(() => {
        if (inflight.get(key) === outcome) inflight.delete(key);
        if (aborts.get(key) === abort) aborts.delete(key);
      });
    inflight.set(key, outcome);
    return outcome;
  };
  async function frame(bag: Record<string, unknown>): Promise<{ drew: string[]; failure: string | null }> {
    const keys = named(bag);
    for (const [key] of keys) pins.set(key, (pins.get(key) ?? 0) + 1);
    try {
      const failures = await Promise.all(keys.map(([key, plain, variant]) => ask(key, plain, variant)));
      for (const [key] of keys) used.set(key, ++clock);
      return { drew: keys.flatMap(([key]) => (textures.has(key) ? [key] : [])), failure: failures.find((f) => f !== null) ?? null };
    } finally {
      for (const [key] of keys) pins.set(key, (pins.get(key) ?? 1) - 1);
      for (const [key, n] of pins) if (n <= 0) pins.delete(key);
      dropUnneeded();
    }
  }
  const drop = (plain: string, variant?: string) => {
    for (const k of new Set([...textures.keys(), ...absent, ...inflight.keys()])) {
      if (variant === undefined ? !k.startsWith(`${plain}#`) : k !== `${plain}#${variant}`) continue;
      textures.delete(k);
      absent.delete(k);
      generations.set(k, (generations.get(k) ?? 0) + 1);
    }
  };
  let viewValues: Record<string, unknown> = {};
  /** What the live view draws with: the photo's bag under the view values. */
  const liveBag = () => ({ ...develop.getState().paramBag, ...viewValues });
  /** As core's noteLiveStageBag(shown, own): what either names is asked for and kept. */
  const noteLive = () => {
    const keys = [...named(liveBag()), ...named(develop.getState().paramBag)];
    liveKeys = keys.map(([key]) => key);
    dropUnneeded();
    for (const [key, plain, variant] of keys) void ask(key, plain, variant);
  };

  const develop = create<DevelopSlice>()((set) => ({
    photoId: photos[0]?.id ?? null,
    paramBag: { ...initial },
    setDynParams: (patch) =>
      set((s) => {
        const next = { ...s.paramBag, ...patch };
        for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
        return { paramBag: next };
      }),
    commitEdit: async (label) => void commits.push(label),
  }));
  const catalog = create<{ photos: CatalogPhoto[] }>()(() => ({ photos }));
  develop.subscribe(() => noteLive());

  function useParamScope(): ParamScope {
    const params = develop((s) => s.paramBag);
    return {
      maskId: null,
      getParam: (key) => (key in params ? params[key] : defaults.get(key)),
      getParams: () => params,
      setParams: (patch) => develop.getState().setDynParams(patch),
      commit: (label) => void commits.push(label),
    };
  }

  function Slider(props: SliderProps) {
    const id = React.useRef(nextSlider++).current;
    sliderProps.set(id, props);
    return React.createElement("div", { "data-slider": id }, `${props.label} ${props.value}`);
  }
  const Toggle = (p: ToggleProps) =>
    React.createElement("input", {
      type: "checkbox",
      "aria-label": p.ariaLabel,
      checked: p.checked,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => p.onChange(e.target.checked),
    });
  const Select = (p: SelectProps) =>
    React.createElement(
      "select",
      { "aria-label": p.ariaLabel, value: p.value, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => p.onChange(e.target.value) },
      (p.options ?? []).map((o) => React.createElement("option", { key: o.value, value: o.value }, o.label)),
    );
  const box = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  const Section = ({ title, right, children }: { title: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode }) =>
    React.createElement("section", null, React.createElement("h3", null, title), right, children);
  const Button = (p: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", { onClick: p.onClick, disabled: p.disabled, title: p.title }, p.children);

  const members = {
    version: 1,
    extensionId: EXT_ID,
    assetUrl: (path: string) => `app://bundle/__plugins__/${EXT_ID}/${path}?v=test`,
    react: React,
    reactDom: { createPortal },
    registerPanel: (c: PanelContribution) => void panels.push(c),
    registerGridMenuItem: (c: GridMenuItemContribution) => void menus.push(c),
    registerWindow: (c: WindowContribution) => void windows.push(c),
    windows: { open: (id: string) => void opened.push(id) },
    registerProcessingStage: (c: ProcessingStageContribution) => {
      stages.push(c);
      for (const u of c.uniforms) defaults.set(`${c.id}.${u.key}`, u.default);
    },
    unregisterProcessingStage: (id: string) => {
      const i = stages.findIndex((s) => s.id === id);
      if (i >= 0) stages.splice(i, 1);
    },
    setStageTexture: (stageId: string, key: string, tex: StageTextureData | null, variant?: string) => {
      const k = `${stageId}.${key}${variant ? `#${variant}` : ""}`;
      if (tex) textures.set(k, tex);
      else textures.delete(k);
    },
    setStageTextureProvider: (stageId: string, key: string, provide: ((variant: string, signal: AbortSignal) => Promise<StageTextureData | null>) | null) => {
      const plain = `${stageId}.${key}`;
      if (provide) providers.set(plain, provide);
      else providers.delete(plain);
      drop(plain);
      if (provide) noteLive();
    },
    dropStageTextureVariants: (stageId: string, key: string, variant?: string) => {
      drop(`${stageId}.${key}`, variant);
      noteLive();
    },
    prepareStageTextureVariant: async (stageId: string, key: string, variant: string) => {
      const failure = (await frame({ [`${stageId}.${key}`]: variant })).failure;
      if (failure) throw new Error(failure);
    },
    settings: {
      get: <T,>(key: string, fallback: T): T => (settings.has(key) ? (settings.get(key) as T) : fallback),
      set: (key: string, value: unknown) => void settings.set(key, value),
    },
    stores: { useDevelopStore: develop, useCatalogStore: catalog },
    catalog: {
      getEditState: async (id: string) => edits.get(id) ?? null,
      putEditState: async (state: EditState) => void edits.set(state.photoId, state),
    },
    components: { Slider },
    develop: {
      useParamScope,
      setViewValues: (values: Record<string, unknown> | null) => {
        viewValues = { ...(values ?? {}) };
        noteLive();
      },
    },
    ui: {
      Toggle,
      Select,
      Section,
      Button,
      Stack: box,
      Row: box,
      Field: box,
      Card: box,
      ProgressBar: () => React.createElement("progress"),
      tokens: { textMuted: "", textSecondary: "", textPrimary: "", surface2: "", border: "" },
      alertDialog: async () => undefined,
      confirmDialog: async () => true,
    },
  };

  const rig: Rig = {
    api: strict(members, "api") as unknown as SafelightAPI,
    panels,
    stages,
    menus,
    windows,
    opened,
    edits,
    textures,
    budget: Infinity,
    asked,
    providers: () => [...providers.keys()],
    viewValues: () => viewValues,
    live: () => {
      const keys = named(liveBag()).map(([key]) => key);
      return { drew: keys.filter((k) => textures.has(k)), missing: keys.filter((k) => !textures.has(k)) };
    },
    frame,
    exportPhoto: (photoId) => {
      const state = edits.get(photoId);
      return frame(state?.stack[state.currentIndex]?.paramBag ?? {});
    },
    settings,
    develop,
    catalog,
    commits,
    sliders: (root) =>
      [...root.querySelectorAll("[data-slider]")].map((el) => {
        const props = sliderProps.get(Number(el.getAttribute("data-slider")));
        if (!props) throw new Error("a slider without props");
        return props;
      }),
  };
  return rig;
}

/** Wraps a plain object so reading a member it lacks throws, naming the member. */
function strict<T extends object>(target: T, path: string): T {
  return new Proxy(target, {
    get(obj, key, receiver) {
      if (typeof key === "symbol" || key === "then" || key === "toJSON") return Reflect.get(obj, key, receiver);
      if (!(key in obj)) throw new Error(`The fake API has no ${path}.${key}. Add it to test/support/fake-api.ts.`);
      const value: unknown = Reflect.get(obj, key, receiver);
      const isPlainObject = typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
      return isPlainObject && key !== "react" && key !== "tokens" ? strict(value, `${path}.${key}`) : value;
    },
  });
}

export interface NewsHub {
  /** Opens a window's line, as broadcastNews does. */
  connect: OpenNews;
  /** How many lines are open. */
  open(): number;
}

/** A stand-in for the BroadcastChannel between windows: a copy of what one
 *  line posts reaches every other line still open, a task later, in order,
 *  and never the line that posted it. */
export function newsHub(): NewsHub {
  const lines = new Set<(news: LibraryNews) => void>();
  return {
    connect: (hear) => {
      const own = (news: LibraryNews) => hear(news);
      lines.add(own);
      return {
        post: (news) => {
          const copy = structuredClone(news);
          for (const other of lines) if (other !== own) setTimeout(() => lines.has(other) && other(copy));
        },
        close: () => void lines.delete(own),
      };
    },
    open: () => lines.size,
  };
}

/** A calibration library held in memory, which a second controller can be
 *  started on as the next launch would be, or as another window shares it. */
export function memoryStore(): CalibrationStore & { masterReads: string[] } {
  const masters = new Map<string, MasterRecord>();
  const sensors = new Map<string, PhotoSensor>();
  const masterReads: string[] = [];
  return {
    masterReads,
    loadSummaries: async () => [...masters.values()].map((r) => r.summary),
    loadSummary: async (id) => masters.get(id)?.summary ?? null,
    loadMaster: async (id) => {
      masterReads.push(id);
      return masters.get(id) ?? null;
    },
    saveMaster: async (record) => void masters.set(record.summary.id, record),
    deleteMaster: async (id) => void masters.delete(id),
    loadPhotoSensor: async (key) => sensors.get(key) ?? null,
    savePhotoSensor: async (key, value) => void sensors.set(key, value),
  };
}
