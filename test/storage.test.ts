// Opening the calibration library: the upgrade from each older version, and a
// window still holding an older connection. IndexedDB is a small stand-in here,
// with just what the upgrade and the open use.

import { describe, expect, it } from "vitest";
import type { MasterRecord } from "../src/library";
import { BLOCKED_NOTE, LibraryDb } from "../src/storage";

/** An object store: values by key, walked in key order by a cursor. */
class Store {
  values = new Map<string, unknown>();
  put(value: unknown, key: string) {
    this.values.set(key, value);
  }
  openCursor() {
    const entries = [...this.values.entries()];
    const request: { result: unknown; onsuccess: (() => void) | null } = { result: null, onsuccess: null };
    let at = 0;
    const step = () => {
      const entry = entries[at];
      request.result = entry ? { value: entry[1], continue: () => (at++, queueMicrotask(step)) } : null;
      request.onsuccess?.();
    };
    queueMicrotask(step);
    return request;
  }
}

/** A database at `version` with `stores`, and the opens it was asked for. */
function fakeIdb(version: number, stores: Record<string, Store>) {
  const db = {
    version,
    stores,
    closed: false,
    onversionchange: null as (() => void) | null,
    objectStoreNames: { contains: (name: string) => name in stores },
    createObjectStore: (name: string) => (stores[name] = new Store()),
    deleteObjectStore: (name: string) => void delete stores[name],
    close() {
      db.closed = true;
    },
  };
  const requests: { fire(kind: "blocked" | "open"): Promise<void> }[] = [];
  const factory = {
    open: (_name: string, to: number) => {
      const request = {
        result: db,
        transaction: { objectStore: (name: string) => stores[name] },
        onupgradeneeded: null as ((e: { oldVersion: number }) => void) | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onblocked: null as (() => void) | null,
      };
      requests.push({
        fire: async (kind) => {
          if (kind === "blocked") return request.onblocked?.();
          if (db.version < to) {
            request.onupgradeneeded?.({ oldVersion: db.version });
            db.version = to;
            for (let i = 0; i < 20; i++) await Promise.resolve();
          }
          request.onsuccess?.();
        },
      });
      return request;
    },
  };
  return { db, requests, factory: factory as unknown as IDBFactory };
}

const record = (id: string): MasterRecord => ({ summary: { id } } as MasterRecord);
const withMasters = (...ids: string[]) => {
  const masters = new Store();
  for (const id of ids) masters.put(record(id), id);
  return masters;
};

describe("opening the calibration library", () => {
  it("lists the masters of a version 1 library by their summaries", async () => {
    const { db, requests, factory } = fakeIdb(1, { masters: withMasters("a", "b"), photos: new Store() });
    const library = new LibraryDb(() => factory);
    const opening = library.get();
    await requests[0].fire("open");
    expect(await opening).toBe(db);
    expect([...db.stores.summaries.values.keys()]).toEqual(["a", "b"]);
    expect(Object.keys(db.stores).sort()).toEqual(["masters", "photos", "summaries"]);
  });

  it("drops version 2's record of the variants saved edits named, and lists its masters", async () => {
    const { db, requests, factory } = fakeIdb(2, { masters: withMasters("a"), photos: new Store(), flatUses: new Store() });
    const library = new LibraryDb(() => factory);
    const opening = library.get();
    await requests[0].fire("open");
    await opening;
    expect(Object.keys(db.stores).sort()).toEqual(["masters", "photos", "summaries"]);
    expect([...db.stores.summaries.values.keys()]).toEqual(["a"]);
  });

  it("makes a new library's stores and walks nothing", async () => {
    const { db, requests, factory } = fakeIdb(0, {});
    const library = new LibraryDb(() => factory);
    const opening = library.get();
    await requests[0].fire("open");
    await opening;
    expect(Object.keys(db.stores).sort()).toEqual(["masters", "photos", "summaries"]);
  });

  it("says to close the other windows while one holds the library open, and opens once they do", async () => {
    const { db, requests, factory } = fakeIdb(2, { masters: withMasters(), photos: new Store(), flatUses: new Store() });
    const library = new LibraryDb(() => factory);
    const notes: (string | null)[] = [];
    library.onNote((note) => notes.push(note));
    const opening = library.get();
    await requests[0].fire("blocked");
    expect(notes).toEqual([BLOCKED_NOTE]);
    await requests[0].fire("open");
    expect(await opening).toBe(db);
    expect(notes).toEqual([BLOCKED_NOTE, null]);
  });

  it("lets go of its connection when a newer version wants the library, and opens it again when next used", async () => {
    const { db, requests, factory } = fakeIdb(3, { masters: new Store(), photos: new Store(), summaries: new Store() });
    const library = new LibraryDb(() => factory);
    const first = library.get();
    await requests[0].fire("open");
    await first;
    db.onversionchange?.();
    expect(db.closed).toBe(true);
    const again = library.get();
    expect(requests).toHaveLength(2);
    await requests[1].fire("open");
    expect(await again).toBe(db);
  });

  it("is no library where IndexedDB isn't", async () => {
    expect(await new LibraryDb(() => undefined).get()).toBeNull();
  });
});
