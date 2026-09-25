// Quick Settings: the "Dangle" toggle with its menu, and the small top-bar
// indicator shown while the charms are on.

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {QuickMenuToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

import {PRESET_IDS, presetName} from './core/presets.js';
import {STYLES, styleName} from './core/ropeStyles.js';
import {MAX_CORDS, addCord, removeCord, setAllStyles, commonStyle} from './core/cords.js';
import {readCords, writeCustomCords, applyPreset} from './settingsModel.js';

const MODIFIER_NAMES = {'super': 'Super', 'alt': 'Alt', 'ctrl-alt': 'Ctrl+Alt'};

function dangleIcon(extension) {
    return Gio.FileIcon.new(extension.dir.get_child('icons').get_child('dangle-symbolic.svg'));
}

const DangleToggle = GObject.registerClass(
class DangleToggle extends QuickMenuToggle {
    /**
     * @param {Extension} extension
     * @param {Gio.Settings} settings
     * @param {{shake: Function, openPreferences: Function}} actions
     */
    _init(extension, settings, actions) {
        const gicon = dangleIcon(extension);
        super._init({title: 'Dangle', gicon, toggleMode: true});
        this._gicon = gicon;
        this._settings = settings;
        this._actions = actions;

        // Clicking the toggle shows or hides every charm (and stops all work).
        settings.bind('enabled', this, 'checked', Gio.SettingsBindFlags.DEFAULT);

        this._buildMenu();
        settings.connectObject('changed', () => this._sync(), this);
        this._sync();
    }

    _buildMenu() {
        const settings = this._settings;
        const edit = change => writeCustomCords(settings, change(readCords(settings)));

        this._presetItems = new Map();
        for (const id of PRESET_IDS) {
            const item = new PopupMenu.PopupMenuItem(presetName(id));
            item.connect('activate', () => applyPreset(settings, id));
            this.menu.addMenuItem(item);
            this._presetItems.set(id, item);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._styleMenu = new PopupMenu.PopupSubMenuMenuItem('Rope style', false);
        this._styleItems = new Map();
        for (const style of STYLES) {
            const item = new PopupMenu.PopupMenuItem(style.name);
            item.connect('activate', () => edit(cords => setAllStyles(cords, style.id)));
            this._styleMenu.menu.addMenuItem(item);
            this._styleItems.set(style.id, item);
        }
        this.menu.addMenuItem(this._styleMenu);

        const shake = new PopupMenu.PopupMenuItem('Shake them');
        shake.connect('activate', () => this._actions.shake());
        this.menu.addMenuItem(shake);

        this._breezeItem = new PopupMenu.PopupSwitchMenuItem('Breeze', settings.get_boolean('breeze-enabled'));
        this._breezeItem.connect('toggled', (_item, state) => settings.set_boolean('breeze-enabled', state));
        this.menu.addMenuItem(this._breezeItem);

        this._grabItem = new PopupMenu.PopupSwitchMenuItem('', settings.get_boolean('grab-without-super'));
        this._grabItem.connect('toggled', (_item, state) => settings.set_boolean('grab-without-super', state));
        this.menu.addMenuItem(this._grabItem);

        this._addItem = new PopupMenu.PopupMenuItem('Add cord');
        this._addItem.connect('activate', () => edit(addCord));
        this.menu.addMenuItem(this._addItem);

        this._removeItem = new PopupMenu.PopupMenuItem('Remove cord');
        this._removeItem.connect('activate', () => edit(removeCord));
        this.menu.addMenuItem(this._removeItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const prefs = new PopupMenu.PopupMenuItem('Open settings…');
        prefs.connect('activate', () => this._actions.openPreferences());
        this.menu.addMenuItem(prefs);
    }

    _sync() {
        const settings = this._settings;
        const preset = settings.get_string('preset');
        this.subtitle = presetName(preset);
        this.menu.setHeader(this._gicon, 'Dangle', this.subtitle);

        for (const [id, item] of this._presetItems)
            item.setOrnament(id === preset ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NO_DOT);

        const cords = readCords(settings);
        const style = commonStyle(cords);
        for (const [id, item] of this._styleItems)
            item.setOrnament(id === style ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
        this._styleMenu.label.text = `Rope style: ${style ? styleName(style) : 'Mixed'}`;

        this._breezeItem.setToggleState(settings.get_boolean('breeze-enabled'));
        const modifier = MODIFIER_NAMES[settings.get_string('grab-modifier')] ?? 'Super';
        this._grabItem.label.text = `Grab without ${modifier}`;
        this._grabItem.setToggleState(settings.get_boolean('grab-without-super'));

        this._addItem.setSensitive(cords.length < MAX_CORDS);
        this._removeItem.setSensitive(cords.length > 1);
    }

    destroy() {
        this._settings?.disconnectObject(this);
        Gio.Settings.unbind(this, 'checked');
        this._settings = null;
        this._actions = null;
        // Quick Settings parents the menu outside the toggle and never destroys
        // it with the item; without this every disable would leak the menu.
        this.menu?.destroy();
        super.destroy();
    }
});

export const DangleIndicator = GObject.registerClass(
class DangleIndicator extends SystemIndicator {
    _init(extension, settings, actions) {
        super._init();

        // The little top-bar icon, shown while the charms are on.
        this._indicator = this._addIndicator();
        this._indicator.gicon = dangleIcon(extension);
        settings.bind('enabled', this._indicator, 'visible', Gio.SettingsBindFlags.GET);

        this.quickSettingsItems.push(new DangleToggle(extension, settings, actions));
    }

    destroy() {
        Gio.Settings.unbind(this._indicator, 'visible');
        this.quickSettingsItems.forEach(item => item.destroy());
        this.quickSettingsItems = [];
        super.destroy();
    }
});
