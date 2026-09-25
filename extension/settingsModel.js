// Typed access to the `cords` settings, shared by the overlay, the Quick
// Settings menu and the preferences window (Gio/GLib only).

import GLib from 'gi://GLib';

import {normalizeCords, cordsEqual} from './core/cords.js';
import {presetCords} from './core/presets.js';

const CORDS_TYPE = 'a(ddsas)';

/** @returns {Array} normalized cords from `key` ('cords' or 'custom-cords') */
export function readCords(settings, key = 'cords') {
    return normalizeCords(settings.get_value(key).deepUnpack());
}

function writeKey(settings, key, cords) {
    const clean = normalizeCords(cords);
    if (!cordsEqual(clean, readCords(settings, key)))
        settings.set_value(key, new GLib.Variant(CORDS_TYPE, clean));
    return clean;
}

/**
 * Saves a user edit: the live layout becomes the Custom preset, and is
 * remembered so choosing Custom again brings it back.
 */
export function writeCustomCords(settings, cords) {
    settings.delay();
    try {
        const clean = writeKey(settings, 'cords', cords);
        writeKey(settings, 'custom-cords', clean);
        if (settings.get_string('preset') !== 'custom')
            settings.set_string('preset', 'custom');
    } finally {
        settings.apply();
    }
}

/** Switches to a preset, loading its layout (or the remembered custom one). */
export function applyPreset(settings, id) {
    const cords = presetCords(id) ?? readCords(settings, 'custom-cords');
    settings.delay();
    try {
        settings.set_string('preset', id);
        writeKey(settings, 'cords', cords);
    } finally {
        settings.apply();
    }
}
