// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// The Develop panel: each correction's switch, its master (automatic or a
// pick), what was matched or why nothing was, and the flat's blur and clip
// control. The library dialogue opens from here.

import { BLUR_LABELS, type Controller } from "./controller";
import { BLUR_TYPES, MAX_BLUR_RADIUS, type BlurType } from "./flat";
import { formatShutter, masterLabel, type MasterSummary } from "./library";
import { AUTO, DEFAULT_CHOICES, choicePatch, readChoices, type Choices } from "./params";
import type { Side } from "./resolve";
import { React, api } from "./rt";
import { openLibrary } from "./LibraryDialog";

const NOTE: React.CSSProperties = { fontSize: "10px", color: "var(--color-text-muted)", lineHeight: 1.4 };

export function useController(c: Controller): Controller {
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => c.subscribe(tick), [c]);
  return c;
}

function matchedText(side: Side): string | null {
  if (side.state === "off") return null;
  if (side.state === "none") return side.reason;
  const m = side.master;
  const what = m.kind === "dark" ? `ISO ${Math.round(m.shot.iso)}, ${formatShutter(m.shot.shutter)}` : `${m.shot.lens || "no lens recorded"}, f/${m.shot.aperture.toFixed(1)}, ${Math.round(m.shot.focal)} mm`;
  const frames = m.frames.length === 1 ? "1 frame" : `${m.frames.length} frames`;
  return `${side.auto ? "Matched" : "Using"}: ${what} (${frames}).`;
}

function masterOptions(kind: "dark" | "flat", masters: readonly MasterSummary[], side: Side) {
  const auto = side.state === "matched" && side.auto ? `Automatic (${masterLabel(side.master)})` : "Automatic";
  return [{ value: AUTO, label: auto }, ...masters.filter((m) => m.kind === kind).map((m) => ({ value: m.id, label: `${masterLabel(m)} · ${m.shot.model}` }))];
}

export function makePanel(controller: Controller) {
  return function FlatFieldDarkFramePanel() {
    const c = useController(controller);
    const { Slider } = api.components;
    const { Toggle, Select, Stack, Button, Field, Section } = api.ui;
    const scope = api.develop.useParamScope();
    const choices = readChoices(scope.getParam);
    const status = c.status;
    const commit = (label: string) => scope.commit(label);
    const write = (patch: Partial<Choices>, label?: string) => {
      scope.setParams(c.withMirrors(choicePatch(patch)));
      if (label) commit(label);
    };
    const note = (text: string | null) => (text ? <div style={NOTE}>{text}</div> : null);

    return (
      <Stack gap={8} style={{ padding: "6px 8px 8px" }}>
        {note(c.notice)}
        {note(status.blocked)}
        {status.reading ? note("Reading the photo's sensor details…") : null}
        <Section title="Dark frame" right={<Toggle checked={choices.dark} ariaLabel="Dark frame" onChange={(dark) => write({ dark }, dark ? "Dark frame on" : "Dark frame off")} />}>
          <Stack gap={6}>
            <Select
              value={choices.darkPick}
              ariaLabel="Dark frame master"
              options={masterOptions("dark", c.masters, status.dark)}
              onChange={(darkPick) => write({ darkPick }, "Dark frame master")}
            />
            {note(matchedText(status.dark))}
          </Stack>
        </Section>
        <Section title="Flat field" right={<Toggle checked={choices.flat} ariaLabel="Flat field" onChange={(flat) => write({ flat }, flat ? "Flat field on" : "Flat field off")} />}>
          <Stack gap={6}>
            <Select
              value={choices.flatPick}
              ariaLabel="Flat field master"
              options={masterOptions("flat", c.masters, status.flat)}
              onChange={(flatPick) => write({ flatPick }, "Flat field master")}
            />
            {note(matchedText(status.flat))}
            <Field label="Blur">
              <Select
                value={choices.blur}
                ariaLabel="Blur type"
                options={BLUR_TYPES.map((t) => ({ value: t, label: BLUR_LABELS[t] }))}
                onChange={(blur) => write({ blur: blur as BlurType }, "Flat field blur")}
              />
            </Field>
            <Slider
              label="Blur radius"
              value={choices.radius}
              min={0}
              max={MAX_BLUR_RADIUS}
              step={1}
              defaultValue={DEFAULT_CHOICES.radius}
              onChange={(radius) => write({ radius: Math.round(radius) })}
              onCommit={() => commit("Flat field blur radius")}
            />
            <Slider
              label="Clip control"
              value={Math.round(choices.clip * 100)}
              min={0}
              max={100}
              step={1}
              defaultValue={0}
              onChange={(v) => write({ clip: Math.min(100, Math.max(0, v)) / 100 })}
              onCommit={() => commit("Flat field clip control")}
            />
            {note("A small radius also takes out dust spots; a large one corrects only the falloff. Clip control keeps the flat from lifting highlights past white.")}
          </Stack>
        </Section>
        <Button size="sm" onClick={openLibrary}>
          Calibration library…
        </Button>
      </Stack>
    );
  };
}
