// One cord: a Rope, the actors that draw it, and its charm actors.
//
// The rope is a chain of link strips (see ropeStrips.js) painted once with the
// reference recipe; the charms are St.Icons. While the rope moves the only
// per-frame work is the physics and a few transform updates: nothing is
// repainted and nothing triggers a relayout.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Rope} from '../core/rope.js';
import {DEFAULTS, appearanceOf, ropeWidth} from '../core/ropeStyles.js';
import {charmFile} from '../charmRegistry.js';
import {RopeStrips} from './ropeStrips.js';

const RAD_TO_DEG = 180 / Math.PI;

export class Cord {
    /**
     * @param {object} params
     * @param {Clutter.Actor} params.parent the overlay actor
     * @param {Gio.File} params.extensionDir
     * @param {number[]} params.anchor [x, y] in stage pixels
     * @param {Array} params.cord [position, length, style, charms]
     * @param {object} params.look {charmSize, thickness, shadow}
     * @param {number} params.scale St theme scale factor
     * @param {number} params.angle release angle
     * @param {boolean} params.reducedMotion
     * @param {object|null} params.stats debug timing accumulator
     * @param {string} params.timeProfile 'morning' | 'afternoon' | 'night'
     */
    constructor({parent, extensionDir, anchor, cord, look, scale, angle, reducedMotion, stats, timeProfile}) {
        const [, length, style, charms] = cord;
        this._dir = extensionDir;
        this._scale = scale;
        this._look = {...look};
        this._stats = stats;
        this._charmIds = [...charms];
        this._pose = {};
        this._end = {};
        this.charmActors = [];

        this.rope = new Rope({
            anchorX: anchor[0],
            anchorY: anchor[1],
            length: length * scale,
            style,
            charmCount: charms.length,
            charmSize: look.charmSize * scale,
            angle,
            reducedMotion,
            timeProfile,
        });

        // One group per cord keeps its rope and charms together.
        this.actor = new Clutter.Actor({reactive: false});
        parent.add_child(this.actor);
        this._strips = new RopeStrips(this.actor, DEFAULTS.segmentCount, stats);
        this._charmLayer = new Clutter.Actor({reactive: false});
        this.actor.add_child(this._charmLayer);

        this._createCharms();
        this._restyle();
        this.sync();
    }

    get charmIds() {
        return this._charmIds;
    }

    /** Current bounds including charms, in stage pixels. */
    bounds(out) {
        return this.rope.bounds(true, out);
    }

    /**
     * Advances the physics.
     * @returns {boolean} whether the cord still needs frames
     */
    step(dt) {
        if (this.rope.isSleeping)
            return false;
        const stats = this._stats;
        const start = stats ? GLib.get_monotonic_time() : 0;
        const steps = this.rope.step(dt);
        if (stats)
            stats.physicsUs += GLib.get_monotonic_time() - start;
        if (steps > 0) {
            const syncStart = stats ? GLib.get_monotonic_time() : 0;
            this.sync();
            if (stats)
                stats.syncUs += GLib.get_monotonic_time() - syncStart;
        }
        return !this.rope.isSleeping;
    }

    /** Applies a changed settings tuple without resetting the motion. */
    update(anchor, [, length, style, charms]) {
        this.rope.setAnchor(anchor[0], anchor[1]);
        this.rope.setStyle(style);
        this.rope.setLength(length * this._scale);
        if (charms.length !== this._charmIds.length || charms.some((id, i) => id !== this._charmIds[i]))
            this._setCharms(charms);
        this._resizeCharms();
        this._restyle();
        this.sync();
    }

    setAnchor(anchor) {
        this.rope.setAnchor(anchor[0], anchor[1]);
        this.sync();
    }

    setLook(look) {
        const sizeChanged = look.charmSize !== this._look.charmSize;
        this._look = {...look};
        if (sizeChanged) {
            this.rope.setCharms(this._charmIds.length, look.charmSize * this._scale);
            this._resizeCharms();
        }
        this._restyle();
        this.sync();
    }

    /** Moves every actor to where the rope is now. */
    sync() {
        const rope = this.rope;
        const end = rope.cordEnd(this._end);
        // A stretched (or recoiling) rope has longer links: the strips are scaled
        // to match, never repainted.
        this._strips.update(rope.x, rope.y, end.segment - 1, end.x, end.y, rope.segmentLength * rope.elastic);

        for (let i = 0; i < this.charmActors.length; i++) {
            const actor = this.charmActors[i];
            const pose = rope.charmPose(i, this._pose);
            const half = actor._dangleSize / 2;
            actor.set_translation(pose.x - half, pose.y - half, 0);
            actor.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, pose.angle * RAD_TO_DEG);
        }
    }

    /** Follows the time of day ('morning' | 'afternoon' | 'night'). */
    setTimeProfile(profile) {
        this.rope.setTimeProfile(profile);
    }

    destroy() {
        this._strips?.destroy();
        this._strips = null;
        this.charmActors = [];
        this.actor?.destroy();
        this.actor = null;
        this.rope = null;
    }

    // ── rope appearance ────────────────────────────────────────────────────

    _restyle() {
        const style = this.rope.style;
        const bottom = this.rope.slots.at(-1)?.radius ?? 20;
        // Width in points from the style (widthScale × charm radius, never under
        // minWidth), times the user's thickness; then into stage pixels.
        const widthPoints = ropeWidth(style, bottom / this._scale, this._look.thickness);
        const rest = this.rope.segmentLength;
        const key = `${style}|${widthPoints}|${rest}|${bottom}|${this._look.shadow}`;
        if (key === this._styleKey)
            return;
        this._styleKey = key;
        this._strips.setLook({
            appearance: appearanceOf(style),
            width: widthPoints * this._scale,
            widthPoints,
            charmRadius: bottom,
            rest,
            shadow: this._look.shadow,
        });
    }

    // ── charms ─────────────────────────────────────────────────────────────

    _createCharms() {
        for (let i = 0; i < this._charmIds.length; i++) {
            const icon = new St.Icon({
                gicon: new Gio.FileIcon({file: charmFile(this._dir, this._charmIds[i])}),
                style_class: 'dangle-charm',
                reactive: false,
            });
            icon.set_pivot_point(0.5, 0.5);
            icon._dangleCord = this;
            icon._dangleSlot = i;
            this._charmLayer.add_child(icon);
            this.charmActors.push(icon);
        }
        this._resizeCharms();
    }

    _setCharms(charms) {
        this.rope.setCharms(charms.length, this._look.charmSize * this._scale);
        if (charms.length === this._charmIds.length) {
            charms.forEach((id, i) => {
                if (id !== this._charmIds[i])
                    this.charmActors[i].gicon = new Gio.FileIcon({file: charmFile(this._dir, id)});
            });
            this._charmIds = [...charms];
            return;
        }
        for (const actor of this.charmActors)
            actor.destroy();
        this.charmActors = [];
        this._charmIds = [...charms];
        this._createCharms();
    }

    /** St.Icon sizes are logical pixels; the rope works in stage pixels. */
    _resizeCharms() {
        this.charmActors.forEach((actor, i) => {
            const radius = this.rope.slots[i]?.radius ?? 0;
            const size = Math.max(8, Math.round(2 * radius / this._scale));
            if (actor.icon_size !== size)
                actor.icon_size = size;
            actor._dangleSize = size * this._scale;
        });
    }
}
