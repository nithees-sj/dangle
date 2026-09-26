// The layer that holds every cord, just above the windows and below the panel.
//
// One Clutter.Timeline drives all cords at the display's refresh rate and is
// STOPPED whenever every cord is asleep and no gust or drag is running, so a
// still overlay costs nothing. It wakes only for a gust, the pointer, a drag,
// a settings change or "Shake them".

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {BatteryMonitor} from './battery.js';
import {CharmInput} from './input.js';
import {Cord} from './cord.js';
import {readCords} from '../settingsModel.js';
import {DEFAULTS, resolvedPhysics, timeProfileAt} from '../core/ropeStyles.js';
import {Breeze} from '../core/wind.js';

const DEBUG = GLib.getenv('DANGLE_DEBUG') === '1';

/** Pointer poll interval far from the cords, and near them. */
const POLL_SLOW_MS = 250;
const POLL_FAST_MS = 50;
/** "Near" means inside the cords' combined bounds plus this margin. */
const NEAR_MARGIN = 40;

const MODIFIER_MASKS = {
    'super': [Clutter.ModifierType.MOD4_MASK | Clutter.ModifierType.SUPER_MASK],
    'alt': [Clutter.ModifierType.MOD1_MASK],
    'ctrl-alt': [Clutter.ModifierType.CONTROL_MASK, Clutter.ModifierType.MOD1_MASK],
};

export class Overlay {
    constructor(extension, settings) {
        this._extension = extension;
        this._settings = settings;
        this._logger = extension.getLogger();
        this._cords = [];
        this._visible = false;
        this._pollId = 0;
        this._pollInterval = 0;
        this._pointer = {x: 0, y: 0, time: 0};
        this._gustId = 0;
        this._windOn = false;
        this._box = {};
        this._stats = DEBUG ? {frames: 0, physicsUs: 0, syncUs: 0, repaints: 0} : null;

        try {
            // Created hidden: _setVisible() is the only thing that shows it.
            this.actor = new Clutter.Actor({name: 'dangle-overlay', reactive: false, visible: false});
            Main.layoutManager.uiGroup.insert_child_above(this.actor, global.window_group);

            this._timeline = new Clutter.Timeline({actor: this.actor, duration: 1000, repeat_count: -1});
            this._timeline.connect('new-frame', () => this._onFrame());

            this._breeze = new Breeze();
            this._input = new CharmInput(() => this._wake());
            this._battery = new BatteryMonitor(() => this._syncBreeze());

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
        this._input?.destroy();
        this._input = null;
        this._battery?.destroy();
        this._battery = null;
        this._timeline?.stop();
        this._timeline = null;
        this._destroyCords();
        this.actor?.destroy();
        this.actor = null;
        this._breeze = null;
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
        St.Settings.get().connectObject('notify::enable-animations', () => this._syncMotion(), this);
    }

    _disconnectSignals() {
        this._settings?.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        Main.layoutManager.panelBox.disconnectObject(this);
        Main.overview.disconnectObject(this);
        global.display.disconnectObject(this);
        St.ThemeContext.get_for_stage(global.stage).disconnectObject(this);
        St.Settings.get().disconnectObject(this);
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
        case 'breeze-enabled':
        case 'breeze-on-battery':
        case 'breeze-strength':
            this._syncBreeze();
            break;
        case 'respect-reduced-motion':
            this._syncMotion();
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
        const made = new Cord({
            parent: this.actor,
            extensionDir: this._extension.dir,
            anchor: this._anchorFor(geometry, cord[0]),
            cord,
            look: this._look(),
            scale: geometry.scale,
            // A gentle hello: alternate cords swing in from alternate sides.
            // (The release angle follows the time of day.)
            angle: reduced ? 0 : resolvedPhysics(cord[2], this._timeProfile()).initialAngle * (index % 2 ? -0.8 : 1),
            reducedMotion: reduced,
            stats: this._stats,
            timeProfile: this._timeProfile(),
        });
        this._input.attach(made);
        return made;
    }

    _destroyCords() {
        this._input?.cancel();
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
            if (i < this._cords.length) {
                this._cords[i].update(this._anchorFor(geometry, cord[0]), cord);
                this._input.attach(this._cords[i]);
            } else {
                this._cords.push(this._makeCord(geometry, cord, i));
            }
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
        if (geometry.scale !== JSON.parse(this._geometryKey ?? '{}').scale) {
            this._rebuild();
            return;
        }
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
            this._startPoll(POLL_SLOW_MS);
            this._syncBreeze();
            this._wake();
        } else {
            // Hidden means no work at all: no frames, no polling, no gusts, no grabs.
            this._input?.cancel();
            this._input?.setArmed(false);
            this._stopPoll();
            this._syncBreeze();
            this._timeline?.stop();
            this.actor?.hide();
        }
    }

    // ── pointer: hover nudges and arming charms for grabbing ───────────────

    _startPoll(interval) {
        this._stopPoll();
        this._pollInterval = interval;
        this._pollId = GLib.timeout_add(GLib.PRIORITY_LOW, interval, () => this._poll());
    }

    _stopPoll() {
        if (this._pollId)
            GLib.Source.remove(this._pollId);
        this._pollId = 0;
        this._pointer.time = 0;
    }

    _poll() {
        const [x, y, mods] = global.get_pointer();
        const now = GLib.get_monotonic_time();
        const p = this._pointer;
        let vx = 0, vy = 0;
        if (p.time && now - p.time < 400000) {
            const dt = (now - p.time) / 1e6;
            vx = (x - p.x) / dt;
            vy = (y - p.y) / dt;
        }
        p.x = x;
        p.y = y;
        p.time = now;

        const near = this._isNear(x, y);
        const reaching = this._modifierHeld(mods);
        this._input.setArmed(near && (reaching || this._settings.get_boolean('grab-without-super')));

        // No nudges while the modifier is held: the user is reaching to grab, and
        // a charm that dodges the pointer would be impossible to catch.
        if (near && !reaching && !this._input.dragging && !this._reducedMotion()) {
            let nudged = false;
            for (const cord of this._cords) {
                if (cord.rope.nudge(x, y, vx, vy))
                    nudged = true;
            }
            if (nudged)
                this._wake();
        }

        const interval = near ? POLL_FAST_MS : POLL_SLOW_MS;
        if (interval !== this._pollInterval) {
            this._pollId = 0;
            this._startPoll(interval);
            return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
    }

    /** Whether (x, y) is inside the cords' combined bounds plus a margin. */
    _isNear(x, y) {
        const margin = NEAR_MARGIN * (this._geometry()?.scale ?? 1);
        for (const cord of this._cords) {
            const b = cord.bounds(this._box);
            if (x >= b.x1 - margin && x <= b.x2 + margin && y >= b.y1 - margin && y <= b.y2 + margin)
                return true;
        }
        return false;
    }

    /** Whether the configured grab modifier (Super by default) is held. */
    _modifierHeld(mods) {
        const masks = MODIFIER_MASKS[this._settings.get_string('grab-modifier')] ?? MODIFIER_MASKS.super;
        return masks.every(mask => (mods & mask) !== 0);
    }

    // ── breeze and reduced motion ──────────────────────────────────────────

    _breezeAllowed() {
        return this._visible &&
            this._settings.get_boolean('breeze-enabled') &&
            (!this._battery?.onBattery || this._settings.get_boolean('breeze-on-battery')) &&
            !this._reducedMotion();
    }

    _syncBreeze() {
        if (!this._settings)
            return;
        if (this._breezeAllowed()) {
            if (!this._gustId)
                this._scheduleGust();
            return;
        }
        if (this._gustId)
            GLib.Source.remove(this._gustId);
        this._gustId = 0;
        this._breeze?.stop();
    }

    _scheduleGust() {
        const delay = Math.round(this._breeze.nextDelay());
        this._gustId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, delay, () => {
            this._gustId = 0;
            this.gust();
            this._scheduleGust();
            return GLib.SOURCE_REMOVE;
        });
    }

    /** Starts a gust now. */
    gust() {
        this._breeze.start(this._settings.get_double('breeze-strength'));
        this._wake();
    }

    _syncMotion() {
        const reduced = this._reducedMotion();
        for (const cord of this._cords)
            cord.rope.setReducedMotion(reduced);
        this._syncBreeze();
    }

    // ── animation ──────────────────────────────────────────────────────────

    /** Morning, afternoon or night, from the local clock. */
    _timeProfile() {
        return timeProfileAt(GLib.DateTime.new_now_local().get_hour());
    }

    /** Called on every wake: cheap, and keeps the ropes in step with the time of day. */
    _syncTimeProfile() {
        const profile = this._timeProfile();
        if (profile === this._currentProfile)
            return;
        this._currentProfile = profile;
        for (const cord of this._cords)
            cord.setTimeProfile(profile);
    }

    _wake() {
        if (!this._visible || !this._timeline || this._timeline.is_playing())
            return;
        this._syncTimeProfile();
        if (DEBUG)
            this._logger.log('timeline start');
        this._timeline.start();
    }

    _onFrame() {
        const dt = Math.min(this._timeline.get_delta() / 1000, DEFAULTS.maxFrame);
        if (!(dt > 0))
            return;

        const breeze = this._breeze;
        if (breeze.active || this._windOn) {
            breeze.advance(dt);
            const scale = this._geometry()?.scale ?? 1;
            this._cords.forEach((cord, i) => cord.rope.setWind(breeze.forceX(i) * scale, 0));
            this._windOn = breeze.active;
        }

        let awake = this._input.dragging || breeze.active;
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
                `actor updates ${(s.syncUs / frames / 1000).toFixed(3)} ms/frame, ` +
                `${s.repaints} strip repaints`);
            s.frames = s.physicsUs = s.syncUs = s.repaints = 0;
        }
    }
}
