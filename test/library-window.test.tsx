// The calibration library, drawn in a window of core's (api.registerWindow) and
// opened from the panel, and the bundled LibRaw worker's URL.

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeLibraryWindow } from "../src/LibraryWindow";
import { LibRawWorker } from "../src/libraw";
import { makePanel } from "../src/Panel";
import { LIBRARY_ID } from "../src/params";
import { initRuntime } from "../src/rt";
import { fakeApi, memoryStore } from "./support/fake-api";
import { controllerOn, file, io, settle } from "./support/calibration";

async function rigged() {
  const rig = fakeApi();
  initRuntime(rig.api);
  const c = controllerOn(rig.api, { io: io("dark"), store: memoryStore() });
  await c.start();
  return { rig, c };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the calibration library window", () => {
  it("opens from the panel's button", async () => {
    const { rig, c } = await rigged();
    const view = render(React.createElement(makePanel(c)));
    fireEvent.click(view.getByText("Calibration library…"));
    expect(rig.opened).toEqual([LIBRARY_ID]);
  });

  it("draws only its content: core's window gives it the title, the backdrop, the close button and Escape", async () => {
    const { c } = await rigged();
    const view = render(React.createElement(makeLibraryWindow(c)));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(view.queryByText("Close")).toBeNull();
    expect(view.queryByText("Calibration library")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(view.getByText("Add dark frames…")).toBeTruthy();
  });

  it("says what to shoot in the add buttons' tooltips, not in text", async () => {
    const { c } = await rigged();
    const view = render(React.createElement(makeLibraryWindow(c)));
    expect(view.getByText("Add dark frames…").getAttribute("title")).toMatch(/lens cap on/);
    expect(view.getByText("Add flat frames…").getAttribute("title")).toMatch(/evenly lit/);
    expect(view.container.textContent).not.toMatch(/lens cap/);
  });

  it("lists a master built from the frames picked", async () => {
    const { c } = await rigged();
    const view = render(React.createElement(makeLibraryWindow(c)));
    fireEvent.click(view.getByText("Add dark frames…"));
    await act(async () => {
      fireEvent.change(view.getByLabelText("Calibration frames"), { target: { files: [file("d1.nef")] } });
      await settle();
    });
    expect(c.masters).toHaveLength(1);
    expect(view.getAllByText("Delete")).toHaveLength(1);
  });
});

describe("the bundled LibRaw", () => {
  it("starts its worker as a module from the extension's asset URL", async () => {
    const { rig } = await rigged();
    const made: { url: string; options: WorkerOptions }[] = [];
    vi.stubGlobal(
      "Worker",
      class {
        constructor(url: string, options: WorkerOptions) {
          made.push({ url, options });
        }
        terminate(): void {}
      },
    );
    new LibRawWorker().dispose();
    expect(made).toEqual([{ url: rig.api.assetUrl("dist/libraw/worker.js"), options: { type: "module" } }]);
  });
});
