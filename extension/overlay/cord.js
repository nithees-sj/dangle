// One cord: a Rope, the actors that draw it, and its charm actors.
//
// Everything here is moved with translation and rotation only: the rope is a
// chain of thin rounded St.Widgets (see segments.js) and the charms are
// St.Icons. Their textures are rendered once, so while the rope moves the
// only per-frame work is the physics and a few transform updates, and nothing
// ever triggers a relayout or CPU drawing.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Rope} from '../core/rope.js';
import {DEFAULTS, appearanceOf, ropeWidth} from '../core/ropeStyles.js';
import {charmFile} from '../charmRegistry.js';
import {SegmentLayer, rgba} from './segments.js';

const SHADOW_DX = 1;
const SHADOW_DY = 2;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Ropes are drawn a little bolder than the style's nominal width, which is
 * measured against a charm the size of Hangly's; ours are smaller.
 */
const WIDTH_BOOST = 1.4;

/**
 * Link colours for each texture. Links are ~7 px long, so alternating colours
 * read as twist, braid or chain; no borders, which would swamp a 2–3 px rope
 * (the cloned shadow keeps it visible on light backgrounds).
 */
function bodyCss({palette: p, texture}) {
    const bg = (color, alpha = 1) => `background-color: ${rgba(color, alpha)};`;
    switch (texture.kind) {
    case 'twist':
        return i => bg(i % 2 ? p.shade : p.base);
    case 'braid':
        return i => bg([p.base, p.shade, p.light][i % 3], i % 3 === 2 ? 0.85 : 1);
    case 'links':
        return i => bg(i % 2 ? p.shade : p.light);
    case 'web':
        return i => bg(i % 3 ? p.base : p.light);
    default:
        return () => bg(p.base);
    }
}

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
     */
    constructor({parent, extensionDir, anchor, cord, look, scale, angle, reducedMotion, stats}) {
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
        });

        // One group per cord keeps its shadow, glow, rope and charms together.
        this.actor = new Clutter.Actor({reactive: false});
        parent.add_child(this.actor);
        const links = DEFAULTS.segmentCount;
        this._ropeGroup = new Clutter.Actor({reactive: false});
        // The shadow is the rope itself, cloned, offset and darkened on the GPU,
        // so it costs no per-frame work at all.
        this._shadow = new Clutter.Clone({source: this._ropeGroup, reactive: false, opacity: 64});
        this._shadow.set_translation(SHADOW_DX, SHADOW_DY, 0);
        const darken = new Clutter.BrightnessContrastEffect();
        darken.set_brightness(-1);
        this._shadow.add_effect(darken);
        this.actor.add_child(this._shadow);
        this.actor.add_child(this._ropeGroup);
        this._glow = new SegmentLayer(this._ropeGroup, links);
        this._body = new SegmentLayer(this._ropeGroup, links);
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
        // A stretched (or recoiling) rope has longer links: resize them when the
        // change is visible, so a pulled rope never shows gaps.
        const rest = rope.segmentLength * rope.elastic;
        if (Math.abs(rest - this._drawnRest) >= 0.25) {
            this._drawnRest = rest;
            this._body.setRestLength(rest);
            if (this._glowOn)
                this._glow.setRestLength(rest);
        }
        const end = rope.cordEnd(this._end);
        const last = end.segment - 1;
        this._body.update(rope.x, rope.y, last, end.x, end.y);
        if (this._glowOn)
            this._glow.update(rope.x, rope.y, last, end.x, end.y);

        for (let i = 0; i < this.charmActors.length; i++) {
            const actor = this.charmActors[i];
            const pose = rope.charmPose(i, this._pose);
            const half = actor._dangleSize / 2;
            actor.set_translation(pose.x - half, pose.y - half, 0);
            actor.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, pose.angle * RAD_TO_DEG);
        }
    }

    destroy() {
        this._glow?.destroy();
        this._body?.destroy();
        this._shadow = this._glow = this._body = this._ropeGroup = null;
        this.charmActors = [];
        this.actor?.destroy();
        this.actor = null;
        this.rope = null;
    }

    // ── rope appearance ────────────────────────────────────────────────────

    _restyle() {
        const style = this.rope.style;
        const appearance = appearanceOf(style);
        const bottom = this.rope.slots.at(-1)?.radius ?? 20;
        const width = Math.max(1, ropeWidth(style, bottom / this._scale, this._look.thickness) * WIDTH_BOOST * this._scale);
        const rest = this.rope.segmentLength;
        const key = `${style}|${width}|${rest}|${this._look.shadow}`;
        if (key === this._styleKey)
            return;
        this._styleKey = key;

        this._body.setStyle(bodyCss(appearance), width, rest, this._scale);
        this._drawnRest = rest;

        // Only a strong glow earns its own layer of moving links (Neon); a faint
        // one (Spider Thread's 0.26) is invisible at this width anyway.
        this._glowOn = appearance.glow >= 0.5;
        this._glow.setStyle(() => `background-color: ${rgba(appearance.palette.base, 0.3 * appearance.glow)};`,
                            width * 3, rest, this._scale);
        this._glow.setVisible(this._glowOn);

        this._shadow.visible = this._look.shadow;
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
