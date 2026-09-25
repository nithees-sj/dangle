// Small widget helpers shared by the preferences pages.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

const CSS = `
.dangle-tile { padding: 6px; border-radius: 12px; }
.dangle-slot { padding: 8px; border-radius: 14px; border: 2px dashed alpha(currentColor, 0.25); }
.dangle-slot.selected { border: 2px solid @accent_color; background-color: alpha(@accent_color, 0.12); }
.dangle-slot.drop-target { background-color: alpha(@accent_color, 0.25); }
.dangle-caption { font-size: smaller; opacity: 0.8; }
.dangle-slider-value { min-width: 4.5em; }
`;

let cssInstalled = false;

/** Installs the page CSS once per display. */
export function installCss() {
    if (cssInstalled)
        return;
    const provider = new Gtk.CssProvider();
    provider.load_from_string(CSS);
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider,
                                              Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    cssInstalled = true;
}

/** A fixed-size, aspect-preserving preview of a charm file. */
export function charmPicture(file, size) {
    // Gtk.Image has a real fixed size; Gtk.Picture treats size requests as minimums.
    return new Gtk.Image({gicon: new Gio.FileIcon({file}), pixel_size: size});
}

/** A labelled charm tile: picture above a caption. */
export function charmTile(file, caption, size) {
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 4, halign: Gtk.Align.CENTER});
    box.append(charmPicture(file, size));
    box.append(new Gtk.Label({
        label: caption,
        css_classes: ['dangle-caption'],
        ellipsize: 3, // Pango.EllipsizeMode.END
        max_width_chars: 12,
    }));
    return box;
}

/** Removes every child of a Gtk.Box / Gtk.FlowBox. */
export function clearChildren(container) {
    let child = container.get_first_child();
    while (child) {
        const next = child.get_next_sibling();
        container.remove(child);
        child = next;
    }
}

/** Replaces an Adw.ComboRow's choices without firing its change handler. */
export function setComboChoices(row, labels, selected, guard) {
    guard.updating = true;
    try {
        row.model = Gtk.StringList.new(labels);
        row.selected = Math.max(0, Math.min(selected, labels.length - 1));
    } finally {
        guard.updating = false;
    }
}

/** While dragging, settings are written at most this often (ms). */
const SLIDER_WRITE_MS = 40;

/**
 * A preferences row with a slider: drag right to increase, left to decrease.
 * The value snaps to `step` and is shown beside the slider via `format`.
 * `onChange(value)` runs while dragging (coalesced) so changes apply live.
 * `row.setValue(v)` moves the slider for outside changes without echoing back.
 */
export function sliderRow({title, subtitle = null, lower, upper, step, value, format = String, onChange, marks = []}) {
    const snap = v => Number((Math.round(v / step) * step).toFixed(6));
    const row = new Adw.ActionRow({title, subtitle});
    const adjustment = new Gtk.Adjustment({lower, upper, step_increment: step, page_increment: step * 5, value});
    const scale = new Gtk.Scale({
        adjustment,
        draw_value: false,
        hexpand: true,
        valign: Gtk.Align.CENTER,
        width_request: 220,
    });
    for (const mark of marks)
        scale.add_mark(mark, Gtk.PositionType.BOTTOM, null);
    const label = new Gtk.Label({xalign: 1, css_classes: ['numeric', 'dim-label', 'dangle-slider-value']});
    row.add_suffix(scale);
    row.add_suffix(label);

    let current = snap(value);
    let echo = false;
    let pending = 0;
    label.label = format(current);

    adjustment.connect('value-changed', () => {
        const next = snap(adjustment.value);
        label.label = format(next);
        if (next === current || echo) {
            current = next;
            return;
        }
        current = next;
        if (!pending) {
            pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SLIDER_WRITE_MS, () => {
                pending = 0;
                onChange(current);
                return GLib.SOURCE_REMOVE;
            });
        }
    });

    row.setValue = v => {
        if (snap(v) === current)
            return;
        echo = true;
        adjustment.value = v;
        echo = false;
    };
    row._dangleScale = scale;
    return row;
}
