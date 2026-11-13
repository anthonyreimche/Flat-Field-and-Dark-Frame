// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
//
// Dark frame subtraction and flat-field correction for RAW photos, from
// calibration frames kept in a library and matched to each photo. The
// behaviour follows RawTherapee's dark frame and flat field tools
// (© the RawTherapee developers, GPL-3.0-or-later).

import { Controller } from "./controller";
import { makeLibraryDialog } from "./LibraryDialog";
import { makePanel } from "./Panel";
import { ALL_KEYS, EXT_ID, PANEL_ID } from "./params";
import { React, initRuntime } from "./rt";
import type { SafelightAPI } from "./safelight";

export const MENU_ID = `${EXT_ID}.match`;

let controller: Controller | null = null;

export function matchedMessage(applied: number, skipped: number): string {
  const done = `${applied === 1 ? "1 photo now uses" : `${applied} photos now use`} the best matching dark frame and flat field.`;
  if (!skipped) return done;
  return `${done} ${skipped === 1 ? "1 photo was" : `${skipped} photos were`} left alone: not a RAW, no matching frame, or never opened in Develop.`;
}

export function activate(host: SafelightAPI): void {
  initRuntime(host);
  const active = new Controller(host);
  controller = active;
  void active.start();
  const Panel = makePanel(active);
  const Library = makeLibraryDialog(active);
  host.registerPanel({
    id: PANEL_ID,
    title: "Flat Field & Dark Frame",
    component: () => (
      <>
        <Panel />
        <Library />
      </>
    ),
    defaultDock: { module: "develop", direction: "right", width: 268 },
    onReset: () => {
      const develop = host.stores.useDevelopStore.getState();
      develop.setDynParams(Object.fromEntries(ALL_KEYS.map((k) => [k, undefined])));
      void develop.commitEdit("Flat field and dark frame reset");
    },
  });
  host.registerGridMenuItem({
    id: MENU_ID,
    label: (ids) => (ids.length > 1 ? `Match calibration frames (${ids.length})` : "Match calibration frames"),
    onClick: (ids) => {
      void active.applyTo(ids).then(({ applied, skipped }) =>
        host.ui.alertDialog({ title: "Match calibration frames", message: matchedMessage(applied, skipped) }),
      );
    },
  });
}

export function deactivate(): void {
  controller?.stop();
  controller = null;
}
