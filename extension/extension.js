// Dangle — physics-simulated charms hanging from the top bar.
// Wiring only: everything created here is torn down in disable().

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class DangleExtension extends Extension {
    enable() {
        try {
            this._settings = this.getSettings();
            this.getLogger().log('enabled (scaffold)');
        } catch (e) {
            this.getLogger().error(`enable failed: ${e.message}`);
            this.disable();
        }
    }

    disable() {
        this._settings = null;
    }
}
