// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// The calibration library: build a master from dark or flat frames, see what
// each master was made from, delete one. A window of core's (api.registerWindow),
// opened from the Develop panel.

import type { Controller } from "./controller";
import { formatShutter, masterLabel, type MasterKind, type MasterSummary } from "./library";
import { useController } from "./Panel";
import { React, api } from "./rt";

/** What the file pickers take: Safelight's RAW extensions. */
export const RAW_ACCEPT = [
  "3fr", "ari", "arw", "bay", "cr2", "cr3", "crw", "dcr", "dng", "erf", "fff", "iiq", "k25", "kdc", "mef", "mos", "mrw",
  "nef", "nrw", "orf", "pef", "raf", "raw", "rw2", "rwl", "sr2", "srf", "srw", "x3f",
].map((e) => `.${e}`).join(",");

function details(m: MasterSummary): string[] {
  const s = m.shot;
  const lines = [`${s.make} ${s.model}, ${s.width} × ${s.height}`];
  if (m.kind === "flat") lines.push(`${s.lens || "No lens recorded"}, f/${s.aperture.toFixed(1)}, ${Math.round(s.focal)} mm`);
  lines.push(`ISO ${Math.round(s.iso)}, ${formatShutter(s.shutter)}${s.temperature !== null ? `, ${s.temperature.toFixed(0)} °C` : ""}`);
  const when = s.timestamp ? new Date(s.timestamp).toLocaleDateString() : "date not recorded";
  lines.push(`${m.frames.length === 1 ? "1 frame" : `${m.frames.length} frames`}, ${when}`);
  if (m.kind === "dark" && m.hot !== undefined) lines.push(`${m.hot} hot pixel${m.hot === 1 ? "" : "s"} repaired`);
  if (m.kind === "flat" && m.strongest !== undefined) lines.push(`Corners lifted up to ×${m.strongest.toFixed(2)}`);
  const black = m.blackSource === "masked" ? "from the masked border" : m.blackSource === "frame" ? "from the frames themselves" : "from the file";
  lines.push(`Black level ${Math.round(m.black[1])} (${black}), white ${Math.round(m.white)}`);
  return [...lines, ...m.notes];
}

const DARK_TIP = "RAW files shot with the lens cap on, at the ISO, exposure time and temperature of your photos. Several frames make a cleaner master.";
const FLAT_TIP = "RAW files of an evenly lit, featureless target, shot with the lens, aperture and focal length of your photos. Several frames make a cleaner master.";

export function makeLibraryWindow(controller: Controller) {
  return function LibraryWindow() {
    const c = useController(controller);
    const { Button, Stack, Row, ProgressBar, Card, tokens, alertDialog, confirmDialog } = api.ui;
    const input = React.useRef<HTMLInputElement>(null);
    const [kind, setKind] = React.useState<MasterKind>("dark");

    const pick = (k: MasterKind) => {
      setKind(k);
      input.current?.click();
    };
    const build = async (files: File[]) => {
      if (files.length === 0) return;
      const failure = await c.addMaster(kind, files);
      if (failure) await alertDialog({ title: kind === "dark" ? "Dark frames" : "Flat frames", message: failure });
    };
    const remove = async (m: MasterSummary) => {
      const ok = await confirmDialog({ title: "Delete master", message: `Delete ${masterLabel(m)}? Photos using it are no longer corrected.`, confirmLabel: "Delete", variant: "danger" });
      if (ok) await c.removeMaster(m.id);
    };
    const list = (k: MasterKind, title: string) => {
      const items = c.masters.filter((m) => m.kind === k);
      return (
        <Stack gap={6}>
          <div style={{ fontWeight: 600 }}>{title}</div>
          {items.length === 0 ? <div style={{ color: tokens.textMuted, fontSize: 11 }}>None yet.</div> : null}
          {items.map((m) => (
            <Card key={m.id}>
              <Row justify="space-between" align="flex-start">
                <Stack gap={2}>
                  <div style={{ fontWeight: 600 }}>{masterLabel(m)}</div>
                  {details(m).map((line) => (
                    <div key={line} style={{ fontSize: 11, color: tokens.textSecondary }}>{line}</div>
                  ))}
                </Stack>
                <Button size="sm" variant="danger" onClick={() => void remove(m)}>
                  Delete
                </Button>
              </Row>
            </Card>
          ))}
        </Stack>
      );
    };

    return (
      <div style={{ padding: 16, color: tokens.textPrimary }}>
        <Stack gap={12}>
          <Row gap={8}>
            <Button size="sm" title={DARK_TIP} disabled={!!c.progress} onClick={() => pick("dark")}>
              Add dark frames…
            </Button>
            <Button size="sm" title={FLAT_TIP} disabled={!!c.progress} onClick={() => pick("flat")}>
              Add flat frames…
            </Button>
          </Row>
          {c.progress ? (
            <Stack gap={4}>
              <div style={{ fontSize: 11 }}>
                Reading {c.progress.kind} frame {Math.min(c.progress.done + 1, c.progress.total)} of {c.progress.total}…
              </div>
              <ProgressBar value={c.progress.done / Math.max(1, c.progress.total)} />
            </Stack>
          ) : null}
          {list("dark", "Dark frames")}
          {list("flat", "Flat fields")}
        </Stack>
        <input
          ref={input}
          type="file"
          multiple
          accept={RAW_ACCEPT}
          aria-label="Calibration frames"
          style={{ display: "none" }}
          onChange={(e) => {
            const files = [...(e.currentTarget.files ?? [])];
            e.currentTarget.value = "";
            void build(files);
          }}
        />
      </div>
    );
  };
}
