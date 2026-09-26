// Draws a cord as a chain of short strips, one per link.
//
// Each strip is an St.DrawingArea painted ONCE (whenever the style, width or
// shadow setting changes) with the reference recipe, in this order:
//   1. glow      – three wider, fainter strokes of the light ink (Neon, Spider Thread)
//   2. shadow    – two black passes falling down-right at 45°
//   3. cylinder  – a silhouette, then a 12-step lit-from-the-left cross-section
//   4. texture   – twist / braid / links / web dashes (skipped under 1.4 pt)
// While the rope moves the strips are only translated, rotated and (for the last
// link, or a stretched rope) scaled along their length, so a swinging rope costs
// no CPU drawing at all.
//
// The recipe is drawn in each link's own frame: "across the cord" is the link's
// normal and "along the cord" its direction. Dash phases carry on from link to
// link, and every translucent pass is clipped to its own link so joints never
// double up; only the opaque rod overlaps its neighbours, to close bends.
//
// Stroke recipe (widths, alphas, offsets, dash units) ported from Hangly for
// Windows (MIT, see NOTICE.md). As in the reference (Win2D), dash lengths are in
// units of the stroke's own width.

import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

const RAD_TO_DEG = 180 / Math.PI;
const DIAGONAL = 0.7071067811865476;
const CYLINDER_STEPS = 12;
const CYLINDER_STROKE = 0.45;
const CYLINDER_SPREAD = 0.62;
const SHADOW_OPACITY = 0.16;
const CHARM_SHADOW_RATIO = 0.041;
const MIN_TEXTURE_WIDTH = 1.4; // points

// Changes smaller than this are invisible; skipping them saves GI calls.
const MIN_MOVE = 0.05;
const MIN_TURN = 0.2;
const MIN_SCALE = 0.002;

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export class RopeStrips {
    /**
     * @param {Clutter.Actor} parent
     * @param {number} count links in the rope
     * @param {object|null} stats debug counters ({repaints})
     */
    constructor(parent, count, stats = null) {
        this._stats = stats;
        this._strips = [];
        this._lastIndex = -1;
        this._look = null;
        this.shadow = true;
        // Last transform sent to each strip: x, y, angle, scale.
        this._sent = new Float64Array(count * 4).fill(NaN);
        for (let k = 0; k < count; k++) {
            const strip = new St.DrawingArea({reactive: false});
            strip.set_pivot_point(0, 0.5);
            strip.connect('repaint', area => this._repaint(area, k));
            parent.add_child(strip);
            this._strips.push(strip);
        }
    }

    /**
     * @param {object} look
     * @param {object} look.appearance the style's appearance (palette, texture, glowStrength)
     * @param {number} look.width cord width, stage px
     * @param {number} look.widthPoints the same in points (for the 1.4 pt texture floor)
     * @param {number} look.charmRadius the charm's radius, stage px (sets the shadow's fall)
     * @param {number} look.rest one link's rest length, stage px
     * @param {boolean} look.shadow draw the shadow
     */
    setLook(look) {
        const w = look.width;
        const fall = Math.max(look.charmRadius * CHARM_SHADOW_RATIO, w * 1.6) * DIAGONAL;
        const glow = look.appearance.glowStrength;
        // The opaque rod overlaps each neighbour by this much, closing bends.
        const overhang = w * 0.55;
        const across = Math.max(
            w * 0.55, // silhouette
            w * (1 + 3 * 1.1 * glow) / 2, // widest halo
            look.shadow ? fall * 1.5 + w * 2.1 / 2 : 0); // far shadow
        const halfHeight = Math.ceil(across + 1);
        const along = Math.max(overhang, look.shadow ? fall * 1.5 : 0);
        this._look = {
            ...look, fall, overhang, halfHeight,
            stripWidth: Math.ceil(overhang + look.rest + along + 1),
        };
        this.shadow = look.shadow;
        this._strips.forEach(strip => {
            strip.set_size(this._look.stripWidth, 2 * halfHeight);
            strip.queue_repaint();
        });
        this._sent.fill(NaN);
        this._lastIndex = -1;
    }

    /**
     * Lays the strips along the rope: nodes 0 … last, then on to (endX, endY).
     * `link` is the current length of one link (rest × the elastic stretch).
     */
    update(x, y, last, endX, endY, link) {
        const L = this._look;
        if (!L)
            return;
        const strips = this._strips;
        last = Math.min(last, strips.length - 1);
        if (last !== this._lastIndex) {
            strips.forEach((strip, k) => (strip.visible = k <= last));
            this._lastIndex = last;
        }

        const h = L.overhang, half = L.halfHeight, rest = L.rest, sent = this._sent;
        const linkScale = (link + h) / (rest + h);
        for (let k = 0; k <= last; k++) {
            const ax = x[k], ay = y[k];
            const bx = k < last ? x[k + 1] : endX;
            const by = k < last ? y[k + 1] : endY;
            const len = Math.hypot(bx - ax, by - ay);
            const ux = len > 1e-6 ? (bx - ax) / len : 0;
            const uy = len > 1e-6 ? (by - ay) / len : 1;
            const strip = strips[k];
            const tx = ax - ux * h, ty = ay - uy * h - half;
            const angle = Math.atan2(uy, ux) * RAD_TO_DEG;
            // The strip's link spans [h, h + rest]; stretch it to the real length.
            const scale = k === last ? (len + h) / (rest + h) : linkScale;
            const j = k * 4;
            if (!(Math.abs(tx - sent[j]) < MIN_MOVE && Math.abs(ty - sent[j + 1]) < MIN_MOVE)) {
                strip.set_translation(tx, ty, 0);
                sent[j] = tx;
                sent[j + 1] = ty;
            }
            if (!(Math.abs(angle - sent[j + 2]) < MIN_TURN)) {
                strip.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, angle);
                sent[j + 2] = angle;
            }
            if (!(Math.abs(scale - sent[j + 3]) < MIN_SCALE)) {
                strip.set_scale(scale, 1);
                sent[j + 3] = scale;
            }
        }
    }

    destroy() {
        for (const strip of this._strips)
            strip.destroy();
        this._strips = [];
        this._look = null;
    }

    // ── painting ───────────────────────────────────────────────────────────

    _repaint(area, k) {
        const cr = area.get_context();
        try {
            if (this._look)
                this._paint(cr, k);
        } finally {
            cr.$dispose();
        }
        if (this._stats)
            this._stats.repaints++;
    }

    /**
     * Strokes the link's centre line at `across` from it (positive = the lit,
     * left-hand side of a hanging cord), shifted `along` it. `from`/`to` extend
     * the line past the link so caps land outside the clip.
     */
    _line(cr, across, along, from, to) {
        const L = this._look;
        const y = L.halfHeight + across;
        cr.newPath();
        cr.moveTo(L.overhang + along + from, y);
        cr.lineTo(L.overhang + along + L.rest + to, y);
    }

    /** A translucent pass: clipped to exactly this link, so neighbours never overlap. */
    _pass(cr, k, [r, g, b], alpha, width, {across = 0, along = 0, dash = null, dashOffset = 0, cap = Cairo.LineCap.BUTT} = {}) {
        const L = this._look;
        cr.save();
        cr.rectangle(L.overhang + along, 0, L.rest, 2 * L.halfHeight);
        cr.clip();
        // Extend past both ends so butt ends and round caps fall outside the clip.
        const pad = width * 4 + (dash ? dash[0] + dash[1] : 0);
        this._line(cr, across, along, -pad, pad);
        cr.setLineCap(cap);
        cr.setLineWidth(width);
        cr.setSourceRGBA(r, g, b, alpha);
        // The pattern continues from where the previous link left it.
        if (dash) {
            const period = dash[0] + dash[1];
            const phase = ((dashOffset + k * L.rest - pad) % period + period) % period;
            cr.setDash(dash, phase);
        } else {
            cr.setDash([], 0);
        }
        cr.stroke();
        cr.restore();
    }

    /** An opaque pass: runs over the overhangs too, closing gaps at bends. */
    _rod(cr, [r, g, b], width, across) {
        const L = this._look;
        this._line(cr, across, 0, -L.overhang, L.overhang);
        cr.setLineCap(Cairo.LineCap.BUTT);
        cr.setLineWidth(width);
        cr.setSourceRGBA(r, g, b, 1);
        cr.setDash([], 0);
        cr.stroke();
    }

    _paint(cr, k) {
        const L = this._look;
        const {palette, texture, glowStrength} = L.appearance;
        const w = L.width;

        // 1. Glow: three progressively wider, fainter strokes of the light ink.
        if (glowStrength > 0) {
            for (let halo = 3; halo >= 1; halo--)
                this._pass(cr, k, palette.light, glowStrength * 0.16 / halo, w * (1 + halo * 1.1 * glowStrength));
        }

        // 2. Shadow: down and to the right (the light is up-left), far pass first.
        //    In a hanging link's frame, screen-right is "across" negative and
        //    screen-down is "along" positive.
        if (L.shadow) {
            const far = L.fall * 1.5;
            this._pass(cr, k, [0, 0, 0], SHADOW_OPACITY * 0.55, w * 2.1, {across: -far, along: far});
            this._pass(cr, k, [0, 0, 0], SHADOW_OPACITY, w * 1.35, {across: -L.fall, along: L.fall});
        }

        // 3. Cylinder: the silhouette, then a 12-step cross-section lit from the left.
        this._rod(cr, mix(palette.deep, palette.primary, 0.3), w * 1.1, 0);
        for (let step = 0; step < CYLINDER_STEPS; step++) {
            const t = step / (CYLINDER_STEPS - 1);
            const ink = t < 0.5
                ? mix(palette.light, palette.primary, t * 2)
                : mix(palette.primary, palette.deep, (t - 0.5) * 2);
            // t = 0 is the far left of the cord: "across" positive.
            this._rod(cr, ink, w * CYLINDER_STROKE, -(t - 0.5) * w * CYLINDER_SPREAD);
        }

        // 4. Texture — never under 1.4 points, where any pattern turns to mud.
        if (L.widthPoints < MIN_TEXTURE_WIDTH)
            return;
        switch (texture.kind) {
        case 'twist':
        case 'web': {
            const inset = w * (1 - texture.offset);
            const unit = inset * texture.pitch;
            this._pass(cr, k, palette.light, 0.55, inset, {dash: [unit, unit]});
            break;
        }
        case 'braid': {
            const inset = w * (1 - texture.offset);
            const unit = inset * texture.pitch;
            const dash = [unit, unit * 0.9];
            this._pass(cr, k, palette.light, 0.40, inset, {dash});
            this._pass(cr, k, palette.secondary, 0.55, inset, {dash, dashOffset: unit});
            break;
        }
        case 'links': {
            const notch = w * 1.05, rim = w * 0.45;
            const pattern = s => [texture.pitch * texture.thickness * s, texture.pitch * s];
            this._pass(cr, k, palette.deep, 0.85, notch, {dash: pattern(notch), cap: Cairo.LineCap.ROUND});
            this._pass(cr, k, palette.light, 0.60, rim, {dash: pattern(rim), cap: Cairo.LineCap.ROUND});
            break;
        }
        default:
            // Smooth (Neon): no texture pass.
        }
    }
}
