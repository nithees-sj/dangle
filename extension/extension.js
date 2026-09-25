// Dangle — physics-simulated charms hanging from the top bar.
// Wiring only: everything created here is torn down in disable().

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Overlay} from './overlay/overlay.js';

export default class DangleExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        try {
            this._overlay = new Overlay(this, this._settings);
        } catch (e) {
            this.getLogger().error(`Could not create the charm overlay: ${e}\n${e.stack}`);
            this._overlay?.destroy();
            this._overlay = null;
        }
    }

    disable() {
        this._overlay?.destroy();
        this._overlay = null;
        this._settings = null;
    }
}
