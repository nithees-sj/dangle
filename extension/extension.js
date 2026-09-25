// Dangle — physics-simulated charms hanging from the top bar.
// Wiring only: everything created here is torn down in disable().

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
                openPreferences: () => this.openPreferences(),
            });
            Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
        } catch (e) {
            logger.error(`Could not add the Quick Settings toggle: ${e}\n${e.stack}`);
            this._indicator?.destroy();
            this._indicator = null;
        }
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
        this._overlay?.destroy();
        this._overlay = null;
        this._settings = null;
    }
}
