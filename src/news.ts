// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// What one app window tells the others about the calibration library they
// share: a master added or removed, so their library lists follow and their
// renderers let go of a removed master's textures. A photo's textures need no
// news: Safelight asks each window for them when a frame there needs them, and
// every window reads the masters from the same store.

import { EXT_ID } from "./params";

export type LibraryNews = { kind: "master-added"; id: string } | { kind: "master-removed"; id: string };

export interface NewsLine {
  post(news: LibraryNews): void;
  close(): void;
}

/** Opens this window's line to the others, which hands what they post to
 *  `hear`; null where there is none. */
export type OpenNews = (hear: (news: LibraryNews) => void) => NewsLine | null;

export const NEWS_CHANNEL = `${EXT_ID}.library`;

/** A message off the channel as news, or null for anything else. */
export function readNews(data: unknown): LibraryNews | null {
  if (typeof data !== "object" || data === null) return null;
  const m: Partial<Record<string, unknown>> = data;
  if ((m.kind === "master-added" || m.kind === "master-removed") && typeof m.id === "string") return { kind: m.kind, id: m.id };
  return null;
}

/** The app's windows share an origin, so a BroadcastChannel reaches every
 *  other window that has the extension running. */
export const broadcastNews: OpenNews = (hear) => {
  if (typeof BroadcastChannel !== "function") return null;
  const channel = new BroadcastChannel(NEWS_CHANNEL);
  channel.onmessage = (e: MessageEvent<unknown>) => {
    const news = readNews(e.data);
    if (news) hear(news);
  };
  return { post: (news) => channel.postMessage(news), close: () => channel.close() };
};
