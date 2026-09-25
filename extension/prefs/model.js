// Shared state for the preferences pages: the settings, the charm catalogue
// (built-in and imported) and change notifications.
//
// Every edit writes GSettings, which the running overlay applies live. Edits
// made here are flagged "own" so a page does not rebuild itself (and steal
// focus) in response to the value the user is typing.

import Gio from 'gi://Gio';

import {BUILTIN_CHARMS, charmName, isCustomFileName} from '../core/charms.js';
import {charmFile, customCharmDir} from '../charmRegistry.js';
import {readCords, writeCustomCords} from '../settingsModel.js';

export class PrefsModel {
    constructor(extension, settings) {
        this.extension = extension;
        this.settings = settings;
        this._writing = false;
        this._listeners = [];
        this._settingsIds = ['cords', 'preset', 'active-cord'].map(key =>
            settings.connect(`changed::${key}`, () => this._emit(key)));
        this._charmsChanged = [];
        this._monitor = null;
    }

    get cords() {
        return readCords(this.settings);
    }

    get activeCord() {
        return Math.min(this.settings.get_int('active-cord'), Math.max(0, this.cords.length - 1));
    }

    set activeCord(index) {
        if (index === this.settings.get_int('active-cord'))
            return;
        // Flagged as our own change: the combo row that set it must not be
        // rebuilt from inside its own handler (libadwaita crashes on that).
        this._writing = true;
        try {
            this.settings.set_int('active-cord', index);
        } finally {
            this._writing = false;
        }
    }

    /** Applies `change(cords) → cords` as a user edit (becomes the Custom preset). */
    edit(change) {
        this._writing = true;
        try {
            writeCustomCords(this.settings, change(this.cords));
        } finally {
            this._writing = false;
        }
    }

    /** Connects to one settings key for the life of the window. */
    watch(key, callback) {
        this._settingsIds.push(this.settings.connect(`changed::${key}`, callback));
    }

    /** @param {(key: string, own: boolean) => void} callback */
    onChange(callback) {
        this._listeners.push(callback);
    }

    _emit(key) {
        for (const callback of this._listeners)
            callback(key, this._writing);
    }

    fileFor(id) {
        return charmFile(this.extension.dir, id);
    }

    nameOf(id) {
        return charmName(id);
    }

    /** Every charm: built-ins first, then imported ones (newest last). */
    allCharms() {
        return [...BUILTIN_CHARMS.map(c => c.id), ...this.customCharms()];
    }

    customCharms() {
        const dir = customCharmDir();
        const found = [];
        try {
            const children = dir.enumerate_children('standard::name,time::modified', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = children.next_file(null))) {
                const name = info.get_name();
                if (isCustomFileName(name))
                    found.push({id: `custom:${name}`, time: info.get_modification_date_time()?.to_unix() ?? 0});
            }
            children.close(null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                console.warn(`Dangle: could not list imported charms: ${e.message}`);
        }
        return found.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id)).map(c => c.id);
    }

    /** Calls back whenever imported charms are added or removed. */
    onCharmsChanged(callback) {
        this._charmsChanged.push(callback);
        if (this._monitor)
            return;
        const dir = customCharmDir();
        try {
            dir.make_directory_with_parents(null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                console.warn(`Dangle: ${e.message}`);
        }
        this._monitor = dir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect('changed', () => this.notifyCharmsChanged());
    }

    notifyCharmsChanged() {
        for (const callback of this._charmsChanged)
            callback();
    }

    destroy() {
        for (const id of this._settingsIds)
            this.settings.disconnect(id);
        this._settingsIds = [];
        this._monitor?.cancel();
        this._monitor = null;
        this._listeners = [];
        this._charmsChanged = [];
    }
}
