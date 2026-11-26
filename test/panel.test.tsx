// The Develop panel against the fake API, and the GPU cost of the stage.

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HELPERS, INLINE_GLSL, PASS_GLSL } from "../src/glsl";
import { makePanel } from "../src/Panel";
import { onMainThread, type FlatMaker } from "../src/flat-maker";
import { CHOICE_KEYS, UNIFORM_KEYS, VARIANT_KEYS } from "../src/params";
import { flatVariant } from "../src/resolve";
import { initRuntime } from "../src/rt";
import { correctionStage } from "../src/stage";
import { fetches } from "./fetch-budget";
import { fakeApi, memoryStore, photo } from "./support/fake-api";
import { controllerOn, file, io, settle, withFile } from "./support/calibration";

async function mounted(bag: Record<string, unknown> = {}, photos = [photo()]) {
  const rig = fakeApi(bag, photos);
  initRuntime(rig.api);
  const c = controllerOn(rig.api, { io: { info: async () => Promise.reject(new Error("no file")), frames: () => ({ read: () => Promise.reject(new Error("no")), dispose: () => undefined }) } });
  await c.start();
  const Panel = makePanel(c);
  const view = render(<Panel />);
  return { rig, c, view };
}

afterEach(cleanup);

describe("panel", () => {
  it("turns each correction on as one undo step", async () => {
    const { rig, view } = await mounted();
    await act(async () => void fireEvent.click(view.getByLabelText("Dark frame")));
    expect(rig.develop.getState().paramBag[UNIFORM_KEYS.darkOn]).toBe(1);
    await act(async () => void fireEvent.click(view.getByLabelText("Flat field")));
    expect(rig.develop.getState().paramBag[UNIFORM_KEYS.flatOn]).toBe(1);
    expect(rig.commits).toEqual(["Dark frame on", "Flat field on"]);
  });

  it("explains the blur radius and the clip control in tooltips, not panel text", async () => {
    const { view } = await mounted({ [UNIFORM_KEYS.flatOn]: 1 });
    expect(view.container.textContent).not.toMatch(/dust spots/);
    expect(view.getByText(/^Blur radius/).parentElement?.getAttribute("title")).toMatch(/takes out dust spots/);
    expect(view.getByText(/^Clip control/).parentElement?.getAttribute("title")).toMatch(/past white/);
  });

  it("says why a photo can't be corrected", async () => {
    const { view } = await mounted({ [UNIFORM_KEYS.darkOn]: 1 }, [photo({ mimeType: "image/jpeg" })]);
    expect(view.container.textContent).toMatch(/RAW photos only/);
  });

  it("sets the blur and commits a radius drag when it ends", async () => {
    const { rig, view } = await mounted({ [UNIFORM_KEYS.flatOn]: 1 });
    await act(async () => void fireEvent.change(view.getByLabelText("Blur type"), { target: { value: "vertical" } }));
    expect(rig.develop.getState().paramBag[CHOICE_KEYS.blur]).toBe("vertical");
    const radius = rig.sliders(view.container).find((s) => s.label === "Blur radius");
    act(() => radius?.onChange(17.4));
    expect(rig.develop.getState().paramBag[CHOICE_KEYS.radius]).toBe(17);
    await act(async () => radius?.onCommit?.());
    expect(rig.commits.at(-1)).toBe("Flat field blur radius");
  });

  it("commits a blur radius drag at once, the edit naming the variant the radius makes while it is still being made", async () => {
    const rig = fakeApi({ [UNIFORM_KEYS.flatOn]: 1 }, [withFile()]);
    initRuntime(rig.api);
    const c = controllerOn(rig.api, { io: io("flat"), store: memoryStore() });
    await c.start();
    await c.addMaster("flat", [file("f.nef")]);
    await settle();
    const view = render(React.createElement(makePanel(c)));
    const radius = rig.sliders(view.container).find((s) => s.label === "Blur radius");
    act(() => radius?.onChange(40));
    const bag = rig.develop.getState().paramBag;
    expect(bag[CHOICE_KEYS.radius]).toBe(40);
    expect(bag[VARIANT_KEYS.flat]).toBe(flatVariant(c.masters[0].id, "area", 40));
    act(() => radius?.onCommit?.());
    expect(rig.commits).toEqual(["Flat field blur radius"]);
  });

  it("says why the photo can't be corrected with these settings when their texture can't be made", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rig = fakeApi({ [UNIFORM_KEYS.flatOn]: 1 }, [withFile()]);
    initRuntime(rig.api);
    const flats: FlatMaker = {
      ...onMainThread,
      make: async (need, load) => {
        if (need.blur === "vertical") throw new Error("the worker ran out of memory");
        return onMainThread.make(need, load);
      },
    };
    const c = controllerOn(rig.api, { io: io("flat"), flats, store: memoryStore() });
    await c.start();
    await c.addMaster("flat", [file("f.nef")]);
    await settle();
    const view = render(React.createElement(makePanel(c)));
    await act(async () => {
      fireEvent.change(view.getByLabelText("Blur type"), { target: { value: "vertical" } });
      await settle();
    });
    expect(view.container.textContent).toMatch(/flat field for these settings couldn't be made \(the worker ran out of memory\)/);
    vi.restoreAllMocks();
  });

  it("keeps clip control a fraction of 0 to 1", async () => {
    const { rig, view } = await mounted({ [UNIFORM_KEYS.flatOn]: 1 });
    act(() => rig.sliders(view.container).find((s) => s.label === "Clip control")?.onChange(40));
    expect(rig.develop.getState().paramBag[UNIFORM_KEYS.clip]).toBeCloseTo(0.4, 12);
  });
});

describe("GPU cost", () => {
  it("keeps the inline under 25 texture reads a pixel, hot pixel loop included", () => {
    const n = fetches(INLINE_GLSL, HELPERS, 1);
    expect(n).toBeLessThanOrEqual(25);
    expect(n).toBeGreaterThanOrEqual(20);
  });

  it("keeps the pass to its eight ring taps", () => {
    expect(fetches(PASS_GLSL, HELPERS, 1)).toBe(9);
  });

  it("draws its one pass only while a correction is on", () => {
    const pass = correctionStage().passes?.[0];
    expect(pass?.iterations).toEqual({ key: "pass", max: 1 });
  });
});
