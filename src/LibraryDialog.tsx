// Flat Field and Dark Frame, a Safelight extension (GPL-3.0-or-later).
// The calibration library: build a master from dark or flat frames, see what
// each master was made from, delete one. A dialogue over the app, mounted once
// through an empty slot and opened from the Develop panel.

import type { Controller } from "./controller";
import { formatShutter, masterLabel, type MasterKind, type MasterSummary } from "./library";
import { useController } from "./Panel";
import { React, api } from "./rt";

type Listener = (open: boolean) => void;
let isOpen = false;
const listeners = new Set<Listener>();

export function openLibrary(): void {
  isOpen = true;
  for (const l of listeners) l(true);
}

export function closeLibrary(): void {
  isOpen = false;
  for (const l of listeners) l(false);
}

function useOpen(): boolean {
  const [open, setOpen] = React.useState(isOpen);
  React.useEffect(() => {
    listeners.add(setOpen);
    return () => void listeners.delete(setOpen);
  }, []);
  return open;
}

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

export function makeLibraryDialog(controller: Controller) {
  return function LibraryDialog() {
    const c = useController(controller);
    const open = useOpen();
    const { Button, Stack, Row, ProgressBar, Card, tokens, alertDialog, confirmDialog } = api.ui;
    const input = React.useRef<HTMLInputElement>(null);
    const [kind, setKind] = React.useState<MasterKind>("dark");

    React.useEffect(() => {
      if (!open) return;
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeLibrary();
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    if (!open) return null;

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

    return api.reactDom.createPortal(
      <div
        role="presentation"
        onMouseDown={(e) => e.target === e.currentTarget && closeLibrary()}
        style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0, 0, 0, 0.5)" }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Calibration library"
          style={{ width: 460, maxHeight: "80vh", overflowY: "auto", padding: 16, borderRadius: 8, background: tokens.surface2, border: `1px solid ${tokens.border}`, color: tokens.textPrimary }}
        >
          <Stack gap={12}>
            <div style={{ fontWeight: 600 }}>Calibration library</div>
            <div style={{ fontSize: 11, color: tokens.textMuted }}>
              Dark frames: RAW files shot with the lens cap on, at the ISO, exposure time and temperature of your photos. Flat frames: an evenly lit, featureless target shot with the lens, aperture and focal length of your photos. Several frames of each make a cleaner master.
            </div>
            <Row gap={8}>
              <Button size="sm" disabled={!!c.progress} onClick={() => pick("dark")}>
                Add dark frames…
              </Button>
              <Button size="sm" disabled={!!c.progress} onClick={() => pick("flat")}>
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
            <Row justify="flex-end">
              <Button variant="ghost" onClick={closeLibrary}>
                Close
              </Button>
            </Row>
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
      </div>,
      document.body,
    );
  };
}
