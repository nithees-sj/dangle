// Small widget helpers shared by the preferences pages.

import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

const CSS = `
.dangle-tile { padding: 6px; border-radius: 12px; }
.dangle-slot { padding: 8px; border-radius: 14px; border: 2px dashed alpha(currentColor, 0.25); }
.dangle-slot.selected { border: 2px solid @accent_color; background-color: alpha(@accent_color, 0.12); }
.dangle-slot.drop-target { background-color: alpha(@accent_color, 0.25); }
.dangle-caption { font-size: smaller; opacity: 0.8; }
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

/** A square, aspect-preserving preview of a charm file. */
export function charmPicture(file, size) {
    const picture = Gtk.Picture.new_for_file(file);
    picture.set_content_fit(Gtk.ContentFit.CONTAIN);
    picture.set_can_shrink(true);
    picture.set_size_request(size, size);
    return picture;
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
