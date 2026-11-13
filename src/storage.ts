// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// The calibration library and the photos' sensor details, in IndexedDB: the
// masters are a few megabytes each, past what the extension's settings hold.
// Each master's summary is kept apart from its pixels, so the library lists
// without reading them; the pixels are read when a photo first draws with them.

import type { FrameInfo } from "./frame";
import type { MasterRecord, MasterSummary } from "./library";

const DB_NAME = "safelight-flat-field-dark-frame";
const DB_VERSION = 3;
const MASTERS = "masters";
const SUMMARIES = "summaries";
const PHOTOS = "photos";
/** Version 2's record of the flat variant each saved edit named, which Safelight
 *  now asks for when a frame needs it. */
const GONE_STORES = ["flatUses"];

export const BLOCKED_NOTE = "Close Safelight's other windows to finish updating the calibration library.";

/** The library's connection: opened when first used, upgraded from older
 *  versions, let go of when a newer version wants the library (another window
 *  updated), and saying so while another window holds it at an older one. */
export class LibraryDb {
  private opened: Promise<IDBDatabase | null> | null = null;
  private notes = new Set<(note: string | null) => void>();

  constructor(private readonly factory: () => IDBFactory | undefined) {}

  /** Hears a note for the person about the library (null: none now). */
  onNote(listener: (note: string | null) => void): () => void {
    this.notes.add(listener);
    return () => void this.notes.delete(listener);
  }

  private note(note: string | null): void {
    for (const listener of this.notes) listener(note);
  }

  get(): Promise<IDBDatabase | null> {
    this.opened ??= new Promise((resolve) => {
      const factory = this.factory();
      if (!factory) return resolve(null);
      const req = factory.open(DB_NAME, DB_VERSION);
      let blocked = false;
      req.onblocked = () => {
        blocked = true;
        this.note(BLOCKED_NOTE);
      };
      req.onupgradeneeded = (e) => {
        if (req.transaction) upgrade(req.result, req.transaction, e.oldVersion);
      };
      req.onsuccess = () => {
        const d = req.result;
        d.onversionchange = () => {
          d.close();
          this.opened = null;
        };
        if (blocked) this.note(null);
        resolve(d);
      };
      req.onerror = () => resolve(null);
    });
    return this.opened;
  }
}

function upgrade(d: IDBDatabase, tx: IDBTransaction, oldVersion: number): void {
  for (const store of [MASTERS, SUMMARIES, PHOTOS]) if (!d.objectStoreNames.contains(store)) d.createObjectStore(store);
  for (const store of GONE_STORES) if (d.objectStoreNames.contains(store)) d.deleteObjectStore(store);
  // Masters kept before summaries were (versions 1 and 2) get theirs listed.
  if (oldVersion === 0 || oldVersion >= 3) return;
  const summaries = tx.objectStore(SUMMARIES);
  const walk = tx.objectStore(MASTERS).openCursor();
  walk.onsuccess = () => {
    const cursor = walk.result;
    if (!cursor) return;
    const record: MasterRecord = cursor.value;
    summaries.put(record.summary, record.summary.id);
    cursor.continue();
  };
}

export const library = new LibraryDb(() => (typeof indexedDB === "undefined" ? undefined : indexedDB));

const db = () => library.get();

function transact<T>(stores: string[], mode: IDBTransactionMode, run: (tx: IDBTransaction) => IDBRequest | void): Promise<T | null> {
  return db().then(
    (d) =>
      new Promise<T | null>((resolve, reject) => {
        if (!d) return resolve(null);
        const tx = d.transaction(stores, mode);
        const req = run(tx);
        tx.oncomplete = () => resolve((req?.result as T | undefined) ?? null);
        tx.onerror = () => reject(tx.error ?? new Error("the calibration library couldn't be written"));
        tx.onabort = () => reject(tx.error ?? new Error("the calibration library couldn't be written"));
      }),
  );
}

export async function loadSummaries(): Promise<MasterSummary[]> {
  return (await transact<MasterSummary[]>([SUMMARIES], "readonly", (tx) => tx.objectStore(SUMMARIES).getAll())) ?? [];
}

export async function loadSummary(id: string): Promise<MasterSummary | null> {
  return transact<MasterSummary>([SUMMARIES], "readonly", (tx) => tx.objectStore(SUMMARIES).get(id));
}

export async function loadMaster(id: string): Promise<MasterRecord | null> {
  return transact<MasterRecord>([MASTERS], "readonly", (tx) => tx.objectStore(MASTERS).get(id));
}

export async function saveMaster(record: MasterRecord): Promise<void> {
  await transact([MASTERS, SUMMARIES], "readwrite", (tx) => {
    tx.objectStore(MASTERS).put(record, record.summary.id);
    tx.objectStore(SUMMARIES).put(record.summary, record.summary.id);
  });
}

export async function deleteMaster(id: string): Promise<void> {
  await transact([MASTERS, SUMMARIES], "readwrite", (tx) => {
    tx.objectStore(MASTERS).delete(id);
    tx.objectStore(SUMMARIES).delete(id);
  });
}

/** A photo's sensor details as LibRaw read them, or why it can't be corrected. */
export type PhotoSensor = { info: FrameInfo; unsupported: null } | { info: null; unsupported: string };

export async function loadPhotoSensor(key: string): Promise<PhotoSensor | null> {
  return transact<PhotoSensor>([PHOTOS], "readonly", (tx) => tx.objectStore(PHOTOS).get(key));
}

export async function savePhotoSensor(key: string, value: PhotoSensor): Promise<void> {
  await transact([PHOTOS], "readwrite", (tx) => void tx.objectStore(PHOTOS).put(value, key));
}

/** Where the controller keeps the library; IndexedDB unless a test hands it
 *  another. Every window of the app shares it. */
export interface CalibrationStore {
  loadSummaries(): Promise<MasterSummary[]>;
  loadSummary(id: string): Promise<MasterSummary | null>;
  loadMaster(id: string): Promise<MasterRecord | null>;
  saveMaster(record: MasterRecord): Promise<void>;
  deleteMaster(id: string): Promise<void>;
  loadPhotoSensor(key: string): Promise<PhotoSensor | null>;
  savePhotoSensor(key: string, value: PhotoSensor): Promise<void>;
  /** Hears a note for the person about the store (null: none now). */
  onNote?(listener: (note: string | null) => void): () => void;
}

export const indexedDbStore: CalibrationStore = {
  loadSummaries,
  loadSummary,
  loadMaster,
  saveMaster,
  deleteMaster,
  loadPhotoSensor,
  savePhotoSensor,
  onNote: (listener) => library.onNote(listener),
};
