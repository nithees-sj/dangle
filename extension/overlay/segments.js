// Draws a rope as a chain of thin rounded St.Widgets: one per link, moved
// only with translation and rotation. Their backgrounds are rendered once and
// then transformed on the GPU, so a moving rope costs no CPU drawing at all.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

const RAD_TO_DEG = 180 / Math.PI;

// Changes smaller than this are invisible; skipping them saves GI calls.
const MIN_MOVE = 0.05;
const MIN_TURN = 0.2;

/** CSS colour from a [r, g, b] palette entry (0–1) and an alpha. */
export const rgba = ([r, g, b], a = 1) =>
    `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;

export class SegmentLayer {
    /**
     * @param {Clutter.Actor} parent
     * @param {number} count how many links the rope has
     */
    constructor(parent, count) {
        this._segments = [];
        this._thickness = 1;
        this._restLength = 1;
        this._lastIndex = -1;
        this._lastWidth = -1;
        this._hidden = false;
        // Last transform sent to each link: x, y, angle.
        this._sent = new Float64Array(count * 3).fill(NaN);
        for (let i = 0; i < count; i++) {
            const segment = new St.Widget({reactive: false});
            segment.set_pivot_point(0, 0.5);
            parent.add_child(segment);
            this._segments.push(segment);
        }
    }

    /**
     * @param {(i: number) => string} cssFor background (and border) CSS for link i
     * @param {number} thickness stroke width, stage pixels
     * @param {number} restLength one link's rest length, stage pixels
     * @param {number} scale St theme scale factor (CSS lengths are logical)
     */
    setStyle(cssFor, thickness, restLength, scale) {
        this._thickness = thickness;
        this._restLength = restLength;
        const radius = (thickness / 2 / scale).toFixed(2);
        // Rounded ends overlap the neighbours, so bends never show a gap.
        const width = restLength + thickness;
        this._segments.forEach((segment, i) => {
            segment.style = `${cssFor(i)} border-radius: ${radius}px;`;
            segment.set_size(width, thickness);
        });
        this._lastWidth = -1;
    }

    /**
     * Lengthens or shortens every link (the rope is being stretched or is
     * springing back). Only called when the length changes visibly.
     */
    setRestLength(restLength) {
        this._restLength = restLength;
        const full = restLength + this._thickness;
        this._segments.forEach((segment, k) => {
            if (k !== this._lastIndex)
                segment.width = full;
        });
    }

    /**
     * Lays the links along the rope: nodes 0 … last, then on to (endX, endY).
     * (dx, dy) offsets the whole layer (used by the shadow).
     */
    update(x, y, last, endX, endY, dx = 0, dy = 0) {
        const segments = this._segments;
        const full = this._restLength + this._thickness;
        last = Math.min(last, segments.length - 1);

        if (last !== this._lastIndex) {
            // The link that used to end at the knot gets its full length back.
            if (this._lastIndex >= 0)
                segments[this._lastIndex].width = full;
            segments.forEach((segment, k) => (segment.visible = !this._hidden && k <= last));
            this._lastIndex = last;
            this._lastWidth = -1;
        }

        const half = this._thickness / 2;
        for (let k = 0; k <= last; k++) {
            const ax = x[k], ay = y[k];
            const bx = k < last ? x[k + 1] : endX;
            const by = k < last ? y[k + 1] : endY;
            const len = Math.hypot(bx - ax, by - ay);
            const ux = len > 1e-6 ? (bx - ax) / len : 0;
            const uy = len > 1e-6 ? (by - ay) / len : 1;
            const segment = segments[k];
            const tx = ax - ux * half + dx, ty = ay - uy * half - half + dy;
            const angle = Math.atan2(uy, ux) * RAD_TO_DEG;
            const sent = this._sent, j = k * 3;
            if (!(Math.abs(tx - sent[j]) < MIN_MOVE && Math.abs(ty - sent[j + 1]) < MIN_MOVE)) {
                segment.set_translation(tx, ty, 0);
                sent[j] = tx;
                sent[j + 1] = ty;
            }
            if (!(Math.abs(angle - sent[j + 2]) < MIN_TURN)) {
                segment.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, angle);
                sent[j + 2] = angle;
            }
            if (k === last) {
                // The final link stops at the charm's knot.
                const width = Math.round((len + this._thickness) * 2) / 2;
                if (width !== this._lastWidth) {
                    segment.width = width;
                    this._lastWidth = width;
                }
            }
        }
    }

    /** Shows or hides the whole layer (e.g. the shadow when it is turned off). */
    setVisible(visible) {
        this._hidden = !visible;
        this._segments.forEach((segment, k) => (segment.visible = visible && k <= this._lastIndex));
    }

    destroy() {
        for (const segment of this._segments)
            segment.destroy();
        this._segments = [];
    }
}
