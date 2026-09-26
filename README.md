# Dangle

Little physics-simulated charms hanging on ropes from the bottom of the GNOME
top bar. They sway in an occasional breeze, get nudged when your pointer brushes
past, and can be grabbed and flicked while you hold <kbd>Super</kbd>. Everything
is controlled from Quick Settings.

- GNOME Shell 50, Wayland · UUID `dangle@nithees`
- 0% CPU when still: animation stops completely once every charm settles
- Clicks always reach your windows: charms only catch clicks while the grab
  modifier is held, and the ropes never do

## Screenshots

| Festive | Temple (Vel and Aruval) |
|---|---|
| ![Festive](docs/screenshots/preset-festive.png) | ![Temple](docs/screenshots/preset-temple.png) |
| **Spooky** | **Minimal (default)** |
| ![Spooky](docs/screenshots/preset-spooky.png) | ![Minimal](docs/screenshots/preset-minimal.png) |

An elastic pull: the star's cord stretched well past its length, next to the
crescent hanging at rest:

![Elastic pull](docs/screenshots/elastic-pull.png)

The nine rope styles — Thread, Leather, Gold Chain, Silver Chain, Neon, Spider
Thread, Midnight Cord, Temple Thread, Silver Cord:

![Rope styles](docs/screenshots/rope-styles.png)

| Quick Settings | Library | Cords | Appearance | Import |
|---|---|---|---|---|
| ![Quick Settings](docs/screenshots/quick-settings.png) | ![Library](docs/screenshots/prefs-library.png) | ![Cords](docs/screenshots/prefs-cords.png) | ![Appearance](docs/screenshots/prefs-appearance.png) | ![Import](docs/screenshots/prefs-import.png) |

## Using it

- **Quick Settings** (the Wi-Fi/volume/battery menu): the **Dangle** toggle shows
  or hides every charm. Its arrow opens the menu: presets (Festive, Temple,
  Minimal, Spooky, Custom), rope style, *Shake them*, Breeze, *Grab without Super*,
  Add/Remove cord and *Open settings…*
- **Grab and flick**: hold <kbd>Super</kbd>, press on a charm, pull and let go.
  Ropes are elastic while you hold them: pull a charm down and the rope stretches
  (up to 1.6×); let go and it springs back to its own length. The modifier can be
  Alt or Ctrl+Alt instead (Settings → Appearance).
- **Hover**: brushing the pointer past a charm nudges it.
- **Breeze**: a gentle gust every 45–120 seconds; it pauses on battery unless
  *Breeze on battery* is on, and stops entirely when system animations are off.
- **Settings**: Library (hang any charm on any cord, drag to reorder), Cords
  (position, length, charms, rope style), Appearance, Import (your own PNG, JPG
  or SVG pictures) and About. Every number is a slider: drag right to increase,
  left to decrease, and the charms follow live.
- **Your own charms**: imported pictures are fitted into 256 × 256 and saved as
  PNG in `~/.local/share/dangle/charms/` (SVGs are converted, so the Shell only
  ever loads PNGs). The original file is left untouched; delete imported charms
  from the Import page.
- **Charms**: fourteen original drawings, including Lord Murugan's Vel and
  Karuppasamy's Aruval (both on the Temple preset).

Charms hide in the Activities overview, while a window is fullscreen on the
primary monitor, and on the lock screen.

## Install (fish)

```fish
cd ~/Desktop/hangly-linux
make install                                            # build and copy to ~/.local/share/gnome-shell/extensions/
gsettings set org.gnome.shell disable-user-extensions false
gnome-extensions enable dangle@nithees
```

Then **log out and back in once** (Wayland cannot load new extension code into a
running session). That is all it takes to keep Dangle across reboots: the
extension lives in your home folder, the "enabled" state and all your choices
(cords, charms, preset) are stored in GNOME's settings, and imported charms stay
in `~/.local/share/dangle/charms/`.

Check it after a reboot:

```fish
gnome-extensions info dangle@nithees      # Enabled: Yes · State: ACTIVE
```

- **Update** after pulling or editing the code: `make install`, then log out and
  back in.
- **Remove** completely: `make uninstall` (imported charms in
  `~/.local/share/dangle/` are kept; delete that folder too if you want them gone).
- **Package** for extensions.gnome.org: `make pack` →
  `dist/dangle@nithees.shell-extension.zip` (installable with
  `gnome-extensions install --force dist/dangle@nithees.shell-extension.zip`).

## Try it in a nested shell first

```fish
sudo pacman -S mutter-devkit     # once
make install
make nested                      # a GNOME Shell 50 session in a window
```

In the nested session open Console and run `gnome-extensions enable dangle@nithees`.
Its log appears in the terminal you ran `make nested` from. For per-frame timing
(physics and actor updates, logged each time the animation stops):

```fish
env DANGLE_DEBUG=1 make nested
```

`tools/cycle.fish`, run inside the nested session, disables and enables Dangle
20 times; the nested terminal should show no errors.

## Development

| Command | What it does |
|---|---|
| `make test` | `node --test tests/` (121 tests): rope physics incl. the elastic pull, styles, charm layout, wind, cords, presets, artwork, and a 5 cords × 3 charms bench (≤ 1 ms/frame) |
| `make lint` | ESLint with GNOME Shell's style rules |
| `make headless-test` | Runs Dangle inside a throwaway headless GNOME Shell 50 (isolated settings, never touches your session) and checks it for real — 175 checks: stacking, click-through with real windows, Super+click grab, the elastic pull, Quick Settings, "Open settings…", the preferences window and its sliders, import, fullscreen, two monitors, idle cost, 20 enable/disable cycles |
| `make pack` | `dist/dangle@nithees.shell-extension.zip` for extensions.gnome.org |
| `make logs` | Follow GNOME Shell's journal |

Layout: `core/` is pure JavaScript shared by node and the Shell (copied into
`extension/core/` by `make sync`); `extension/` is the extension itself;
`tools/` holds the headless test driver.

### How it stays cheap

- The rope is a 20-link Verlet chain stepped at a fixed 240 Hz with a capped
  solver; ropes are drawn as thin GPU-transformed widgets, so a moving rope never
  repaints anything on the CPU.
- A single `Clutter.Timeline` drives every cord and stops as soon as all of them
  are still; the pointer is polled at 4 Hz (20 Hz only near the cords), and not
  at all while the charms are hidden.
- Measured in GNOME Shell: ~1.5 ms per frame with five cords of three charms all
  swinging; zero repaints once they settle, and idle CPU within measurement noise of
  having Dangle disabled.

## Troubleshooting

| Problem | Fix |
|---|---|
| New features don't appear after `make install` | Log out and back in: Wayland keeps the old code loaded until then. |
| "Open settings…" does nothing / `gnome-extensions prefs` says the extension "doesn't have preferences" | GNOME Shell decided that when it first scanned an older copy. Current Dangle opens its settings anyway; logging out and back in also resets the Shell's record. |
| Dangle stopped after a GNOME upgrade | The extension declares support for GNOME Shell 50 only; add the new version to `shell-version` in `extension/metadata.json`, test, and `make install`. |
| Clicking a charm does nothing | By design: hold <kbd>Super</kbd> (or your chosen modifier) to grab, or turn on *Grab without Super*. |
| No breeze | It pauses on battery (see *Breeze on battery*) and when system animations are off. |
| Logs | `make logs`, or `journalctl -f -o cat /usr/bin/gnome-shell`. |

## License

GPL-2.0-or-later (see `LICENSE`). The rope solver ports ideas and numeric values
from an MIT-licensed project; see `NOTICE.md`. All charms and icons are original.
