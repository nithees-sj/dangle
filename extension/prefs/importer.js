// Turns a user's picture into a charm: PNG, JPG or SVG in, a 256 × 256
// transparent PNG out, saved to ~/.local/share/dangle/charms/.
//
// SVGs are rasterized here, in the preferences process, so the Shell only ever
// loads plain PNGs from that folder.

import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';

import {customFileNameFor, parseCharmId} from '../core/charms.js';
import {customCharmDir} from '../charmRegistry.js';

export const CHARM_PIXELS = 256;
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
/** Room left above the picture: the rope's knot sits just inside the top edge. */
const TOP_MARGIN = 8;

/**
 * Imports `file` and returns the new charm id ("custom:<name>.png").
 * @param {Gio.File} file
 * @returns {string}
 */
export function importCharm(file) {
    const info = file.query_info('standard::size,standard::display-name', Gio.FileQueryInfoFlags.NONE, null);
    if (info.get_size() > MAX_SOURCE_BYTES)
        throw new Error('That picture is larger than 20 MB.');

    const path = file.get_path();
    if (!path)
        throw new Error('Only local files can be imported.');

    let scaled;
    try {
        scaled = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, CHARM_PIXELS, CHARM_PIXELS - TOP_MARGIN, true);
    } catch (e) {
        throw new Error(`Could not read that picture: ${e.message}`, {cause: e});
    }

    // Centre it horizontally and hang it from the top, so the rope ties onto
    // the top of the picture rather than onto empty space above it.
    const canvas = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, true, 8, CHARM_PIXELS, CHARM_PIXELS);
    canvas.fill(0x00000000);
    const width = scaled.get_width(), height = scaled.get_height();
    const x = Math.floor((CHARM_PIXELS - width) / 2);
    const y = height >= CHARM_PIXELS - 2 * TOP_MARGIN ? Math.floor((CHARM_PIXELS - height) / 2) : TOP_MARGIN;
    scaled.composite(canvas, x, y, width, height, x, y, 1, 1, GdkPixbuf.InterpType.BILINEAR, 255);

    const dir = customCharmDir();
    try {
        dir.make_directory_with_parents(null);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
            throw e;
    }
    const name = customFileNameFor(info.get_display_name(), Date.now().toString(36));
    canvas.savev(dir.get_child(name).get_path(), 'png', [], []);
    return `custom:${name}`;
}

/** Deletes an imported charm's file (only ever a valid custom charm). */
export function deleteCharmFile(id) {
    const parsed = parseCharmId(id);
    if (parsed?.kind !== 'custom')
        throw new Error(`Not an imported charm: ${id}`);
    customCharmDir().get_child(parsed.name).delete(null);
}
