// Resolves charm ids to files. Shared by the Shell side and the preferences
// window, so it may only use Gio/GLib (no Shell or GTK imports).

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {parseCharmId, DEFAULT_CHARM} from './core/charms.js';

/** ~/.local/share/dangle/charms — where imported charms live. */
export function customCharmDir() {
    return Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), 'dangle', 'charms']));
}

/**
 * The file for a charm id. Unknown or malformed ids fall back to the default
 * built-in charm, so a stale setting can never point outside our directories.
 * @param {Gio.File} extensionDir the extension's install directory
 * @param {string} id
 * @returns {Gio.File}
 */
export function charmFile(extensionDir, id) {
    const parsed = parseCharmId(id) ?? parseCharmId(DEFAULT_CHARM);
    if (parsed.kind === 'custom')
        return customCharmDir().get_child(parsed.name);
    return extensionDir.get_child('charms').get_child(`${parsed.name}.svg`);
}
