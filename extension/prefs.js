// Dangle preferences (GTK 4 + libadwaita). Every change is written to
// GSettings, which the running overlay applies live.

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {PrefsModel} from './prefs/model.js';
import {installCss} from './prefs/widgets.js';
import {libraryPage} from './prefs/library.js';
import {cordsPage} from './prefs/cords.js';
import {appearancePage} from './prefs/appearance.js';
import {aboutPage} from './prefs/about.js';

export default class DanglePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        installCss();
        const settings = this.getSettings();
        const model = new PrefsModel(this, settings);

        window.set_default_size(720, 860);
        window.search_enabled = true;
        window.add(libraryPage(model));
        window.add(cordsPage(model));
        window.add(appearancePage(model));
        window.add(aboutPage(this));

        // Keep the settings alive with the window, and let go of them after.
        window._dangleModel = model;
        window.connect('close-request', () => {
            model.destroy();
            window._dangleModel = null;
            return false;
        });
    }
}
