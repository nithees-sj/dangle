// Dangle — physics-simulated charms hanging from the top bar.
// Wiring only: everything created here is torn down in disable().

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Overlay} from './overlay/overlay.js';
import {DangleIndicator} from './quickSettings.js';

export default class DangleExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        const logger = this.getLogger();

        try {
            this._overlay = new Overlay(this, this._settings);
        } catch (e) {
            logger.error(`Could not create the charm overlay: ${e}\n${e.stack}`);
            this._overlay = null;
        }

        try {
            this._indicator = new DangleIndicator(this, this._settings, {
                shake: () => this._overlay?.shake(),
                openPreferences: () => this._openPreferences(),
            });
            Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
        } catch (e) {
            logger.error(`Could not add the Quick Settings toggle: ${e}\n${e.stack}`);
            this._indicator?.destroy();
            this._indicator = null;
        }
    }

    /**
     * Opens the preferences window. The Shell records whether an extension has
     * preferences once, when it first scans it, and refuses to open them if the
     * record says no — which stays wrong until the next login if Dangle was
     * installed or updated while the session was running. In that case ask
     * GNOME's preferences service directly (the same call the Shell makes).
     */
    _openPreferences() {
        if (Main.extensionManager.lookup(this.uuid)?.hasPrefs) {
            this.openPreferences();
            return;
        }
        Gio.DBus.session.call(
            'org.gnome.Shell.Extensions',
            '/org/gnome/Shell/Extensions',
            'org.gnome.Shell.Extensions',
            'OpenExtensionPrefs',
            new GLib.Variant('(ssa{sv})', [this.uuid, '', {}]),
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (connection, result) => {
                try {
                    connection.call_finish(result);
                } catch (e) {
                    this.getLogger().error(`Could not open the preferences: ${e.message}`);
                }
            });
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
        this._overlay?.destroy();
        this._overlay = null;
        this._settings = null;
    }
}
