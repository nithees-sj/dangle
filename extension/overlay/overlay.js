// The layer that holds every cord, just above the windows and below the panel.
//
// One Clutter.Timeline drives all cords at the display's refresh rate and is
// STOPPED whenever every cord is asleep, so a still overlay costs nothing.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Cord} from './cord.js';
import {readCords} from '../settingsModel.js';
import {DEFAULTS} from '../core/ropeStyles.js';

const DEBUG = GLib.getenv('DANGLE_DEBUG') === '1';

export class Overlay {
    constructor(extension, settings) {
        this._extension = extension;
        this._settings = settings;
        this._logger = extension.getLogger();
        this._cords = [];
        this._visible = false;
        this._stats = DEBUG ? {frames: 0, physicsUs: 0, syncUs: 0, repaintUs: 0, repaints: 0} : null;

        try {
            // Created hidden: _setVisible() is the only thing that shows it.
            this.actor = new Clutter.Actor({name: 'dangle-overlay', reactive: false, visible: false});
            Main.layoutManager.uiGroup.insert_child_above(this.actor, global.window_group);

            this._timeline = new Clutter.Timeline({actor: this.actor, duration: 1000, repeat_count: -1});
            this._timeline.connect('new-frame', () => this._onFrame());

            this._connectSignals();
            this._rebuild();
            this._syncVisibility();
        } catch (e) {
            // Leave nothing behind if setup fails half way.
            this.destroy();
            throw e;
        }
    }

    destroy() {
        this._setVisible(false);
        this._disconnectSignals();
        this._timeline?.stop();
        this._timeline = null;
        this._destroyCords();
        this.actor?.destroy();
        this.actor = null;
        this._settings = null;
        this._extension = null;
    }

    /** Gives every cord a push ("Shake them"). */
    shake() {
        this._cords.forEach((cord, i) => cord.rope.push(i % 2 ? -1 : 1));
        this._wake();
    }

    // ── signals ────────────────────────────────────────────────────────────

    _connectSignals() {
        this._settings.connectObject('changed', (_s, key) => this._onSettingChanged(key), this);
        Main.layoutManager.connectObject('monitors-changed', () => this._rebuild(), this);
        Main.layoutManager.panelBox.connectObject('notify::allocation', () => this._reanchor(), this);
        // The overview's `visible` is already true when 'showing' fires (and during
        // the startup animation), and stays true until 'hidden'.
        Main.overview.connectObject(
            'showing', () => this._syncVisibility(),
            'hidden', () => this._syncVisibility(), this);
        global.display.connectObject('in-fullscreen-changed', () => this._syncVisibility(), this);
        St.ThemeContext.get_for_stage(global.stage).connectObject('notify::scale-factor', () => this._rebuild(), this);
    }

    _disconnectSignals() {
        this._settings?.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        Main.layoutManager.panelBox.disconnectObject(this);
        Main.overview.disconnectObject(this);
        global.display.disconnectObject(this);
        St.ThemeContext.get_for_stage(global.stage).disconnectObject(this);
    }

    _onSettingChanged(key) {
        switch (key) {
        case 'enabled':
            this._syncVisibility();
            break;
        case 'cords':
            this._applyCords();
            break;
        case 'charm-size':
        case 'rope-thickness':
        case 'shadow':
            this._applyLook();
            break;
        }
    }

    // ── geometry ───────────────────────────────────────────────────────────

    /** Where cords hang: along the bottom edge of the panel on the primary monitor. */
    _geometry() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return null;
        const panel = Main.layoutManager.panelBox;
        return {
            x: monitor.x,
            width: monitor.width,
            bottom: Math.max(monitor.y, panel.y + panel.height),
            scale: St.ThemeContext.get_for_stage(global.stage).scale_factor,
        };
    }

    _anchorFor(geometry, position) {
        return [Math.round(geometry.x + position * geometry.width), geometry.bottom];
    }

    _look() {
        return {
            charmSize: this._settings.get_int('charm-size'),
            thickness: this._settings.get_double('rope-thickness'),
            shadow: this._settings.get_boolean('shadow'),
        };
    }

    _reducedMotion() {
        return this._settings.get_boolean('respect-reduced-motion') &&
            !St.Settings.get().enable_animations;
    }

    // ── cords ──────────────────────────────────────────────────────────────

    _makeCord(geometry, cord, index) {
        const reduced = this._reducedMotion();
        return new Cord({
            parent: this.actor,
            extensionDir: this._extension.dir,
            anchor: this._anchorFor(geometry, cord[0]),
            cord,
            look: this._look(),
            scale: geometry.scale,
            // A gentle hello: alternate cords swing in from alternate sides.
            angle: reduced ? 0 : DEFAULTS.initialAngle * (index % 2 ? -0.8 : 1),
            reducedMotion: reduced,
            stats: this._stats,
        });
    }

    _destroyCords() {
        for (const cord of this._cords)
            cord.destroy();
        this._cords = [];
    }

    _rebuild() {
        this._destroyCords();
        const geometry = this._geometry();
        if (geometry) {
            this._geometryKey = JSON.stringify(geometry);
            this._cords = readCords(this._settings).map((c, i) => this._makeCord(geometry, c, i));
        }
        this._wake();
    }

    /** Applies a changed cord list, keeping every surviving cord's motion. */
    _applyCords() {
        const geometry = this._geometry();
        if (!geometry)
            return;
        const cords = readCords(this._settings);
        while (this._cords.length > cords.length)
            this._cords.pop().destroy();
        cords.forEach((cord, i) => {
            if (i < this._cords.length)
                this._cords[i].update(this._anchorFor(geometry, cord[0]), cord);
            else
                this._cords.push(this._makeCord(geometry, cord, i));
        });
        this._wake();
    }

    _applyLook() {
        const look = this._look();
        for (const cord of this._cords)
            cord.setLook(look);
        this._wake();
    }

    /** The panel moved or changed height: carry the cords along. */
    _reanchor() {
        const geometry = this._geometry();
        if (!geometry)
            return;
        const key = JSON.stringify(geometry);
        if (key === this._geometryKey)
            return;
        this._geometryKey = key;
        const cords = readCords(this._settings);
        this._cords.forEach((cord, i) => cord.setAnchor(this._anchorFor(geometry, cords[i]?.[0] ?? 0.5)));
        this._wake();
    }

    // ── visibility ─────────────────────────────────────────────────────────

    _shouldShow() {
        const primary = Main.layoutManager.primaryIndex;
        return this._settings.get_boolean('enabled') &&
            !Main.overview.visible &&
            primary >= 0 &&
            !global.display.get_monitor_in_fullscreen(primary);
    }

    _syncVisibility() {
        this._setVisible(this._shouldShow());
    }

    _setVisible(visible) {
        if (visible === this._visible)
            return;
        this._visible = visible;
        if (visible) {
            this.actor.show();
            for (const cord of this._cords)
                cord.sync();
            this._wake();
        } else {
            this._timeline?.stop();
            this.actor?.hide();
        }
    }

    // ── animation ──────────────────────────────────────────────────────────

    _wake() {
        if (!this._visible || !this._timeline || this._timeline.is_playing())
            return;
        if (DEBUG)
            this._logger.log('timeline start');
        this._timeline.start();
    }

    _onFrame() {
        const dt = Math.min(this._timeline.get_delta() / 1000, DEFAULTS.maxFrame);
        if (!(dt > 0))
            return;

        let awake = false;
        for (const cord of this._cords) {
            if (cord.step(dt))
                awake = true;
        }
        if (DEBUG)
            this._stats.frames++;

        if (!awake)
            this._sleep();
    }

    _sleep() {
        this._timeline.stop();
        if (DEBUG) {
            const s = this._stats;
            const frames = Math.max(1, s.frames);
            this._logger.log(`timeline stop after ${s.frames} frames: ` +
                `physics ${(s.physicsUs / frames / 1000).toFixed(3)} ms/frame, ` +
                `actor sync ${(s.syncUs / frames / 1000).toFixed(3)} ms/frame, ` +
                `repaint ${(s.repaintUs / frames / 1000).toFixed(3)} ms/frame ` +
                `(${s.repaints} repaints)`);
            s.frames = s.physicsUs = s.syncUs = s.repaintUs = s.repaints = 0;
        }
    }
}
