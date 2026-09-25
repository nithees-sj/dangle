# Dangle — project rules

GNOME Shell 50 extension (`dangle@nithees`, display name **Dangle**) that hangs
physics-simulated charms on ropes from the bottom edge of the top bar, controlled
from a Quick Settings toggle. Target: Garuda/Arch, Wayland, Mutter 50, Iris Xe, 1080p.
User shell is **fish** — write any commands for fish.

## Reference material
- `reference-hangly/` is a sparse clone of Hangly-Windows (MIT code). Port **ideas
  and numeric values** only; credit close ports in `NOTICE.md`.
- NEVER copy, trace or convert any image/SVG/icon from it. NEVER use the name
  "Hangly" in UI, metadata or package. It is git-ignored.

## Layout
- `core/` — PURE JS (no `gi://`, no `resource://`, no GJS/node globals). Shared by
  node tests and the extension. `make sync` copies it to `extension/core/`
  (git-ignored) at install/pack time.
- `tests/` — `node --test tests/`; covers all of `core/`, including a physics bench.
- `extension/` — the extension. `extension.js` is wiring only (enable/disable).

## Physics (core/rope.js)
- Verlet, 20 segments, fixed 1/240 s substeps, dt capped at 50 ms.
- Relaxation (12–20, in forward+backward pairs) and stretch passes (8–10) per
  style, capped at 48, early exit at 0.1 px, plus an O(n) follow-the-leader
  guard: links never exceed 1.02× rest length.
- Ceiling constraint: no node rises above the anchor (panel bottom).
- Every style sleeps within 5 s after a push: damping ramps to critical (per
  rope length) 1–2 s after the last disturbance; sleep = <0.35 px drift in
  0.25 s while hanging plumb.
- Hot loop uses Float64Arrays; no allocation per step.
- Bench: 5 cords × 3 charms must average ≤ 1 ms/frame in node.

## Performance rules (non-negotiable)
- Animate with one `Clutter.Timeline` tied to the overlay actor. STOP it when every
  cord sleeps and no gust/drag is active (0% CPU idle). Wake only on breeze,
  hover/grab, settings change, "Shake them".
- Pointer poll `GLib.PRIORITY_LOW`: 250 ms, 50 ms only while the pointer is inside
  the cords' bounds + 40 px. Only while the overlay is visible.
- Ropes are 20 thin rounded `St.Widget` links moved only with translation and
  rotation (overlay/segments.js); the shadow is a darkened `Clutter.Clone`. No
  CPU repaint, no relayout, no canvases. (A Cairo `St.DrawingArea` measured
  ~1.8 ms/frame in the Shell and was replaced, per the repaint > 1 ms rule.)
- Hide + stop on: toggle off, overview, fullscreen on primary, lock (disable()).
  Respect `St.Settings.get().enable_animations`.
- Breeze interval 45–120 s; off on battery (UPower `OnBattery`) unless
  `breeze-on-battery`.
- No sync file I/O in the frame path. `DANGLE_DEBUG=1` logs physics and actor
  update time separately; target < 2 ms/frame total (5×3 shaking: ~1.5 ms).

## Input rules
- Charms are NOT reactive by default; ropes and overlay never are. Charms become
  reactive only while the `grab-modifier` (default Super) is held, or always if
  `grab-without-super` is set. Hover nudges are poll-based and always work.
- Drag via `global.stage.grab()`; always dismiss on release, charm removal, hide
  and `disable()`.
- While (and only while) armed, a stage `captured-event` watcher starts drags via
  a fresh pick, and arming queues a relayout so Clutter re-picks: otherwise a
  resting pointer's press goes to the window below (mutter's Super-drag).
- Overlay sits in `uiGroup` directly above `global.window_group`: below panel,
  menus, notifications, dialogs. A charm must never cover the top bar.

## Quality rules (extensions.gnome.org review)
- Everything created in `enable()` is destroyed in `disable()`: actors, signals,
  sources, grabs, GSettings, D-Bus proxies, QS items. Null the references.
- No work in constructors; nothing stateful at module top level.
- try/catch around setup; log via `this.getLogger()` / `console.error`. Never crash
  the Shell.
- `make lint` (ESLint, GNOME Shell style) and `make test` clean on every commit.

## Workflow
Phased build; after each phase: `make test`, `make lint`, commit, then tell the user
what to check in `make nested` and WAIT for their OK. Commits end with the
Co-Authored-By trailer.

## Commands
`make test | lint | sync | install | uninstall | nested | pack | logs | headless-test`
Nested shell needs `sudo pacman -S mutter-devkit`. `make headless-test` runs the
extension in a throwaway headless GNOME Shell (tools/) and must pass too.

## Gotchas learned the hard way
- Never `Gio.Settings.delay()` the shared settings object: it stays in
  delay-apply mode and later writes never reach dconf.
- Destroy a QuickMenuToggle's `menu` yourself; Quick Settings never does.
- Never rebuild an `Adw.ComboRow`'s model from inside its own change handler
  (libadwaita segfaults).
