// A hanging rope: Verlet integration with position-based constraints.
//
// Step order, per fixed 1/240 s substep (ported from Hangly for Windows, MIT,
// see NOTICE.md):
//   1. pin the anchor
//   2. integrate: damped implied velocity + gravity + wind
//   3. drive the held node toward the pointer at a bounded speed
//   4. relax link lengths (and keep stacked charms apart) until converged
//   5. clamp any link still over its stretch ceiling
// Dangle adds, for GNOME Shell's main thread and top bar:
//   - alternating-direction sweeps capped at ≤ 48 passes with early exit
//   - a ceiling: nothing rises above the anchor (the panel's bottom edge)
//   - an O(n) follow-the-leader guard that makes the stretch ceiling exact
//   - elastic stretch while a charm is held (up to MAX_ELASTIC), sprung back
//     to the rope's own length on release
//   - a settle envelope + rest assist so every style sleeps within 5 s
//
// Units are pixels and seconds; y grows downward. All state lives in
// Float64Arrays and the hot loop allocates nothing.

import {DEFAULTS, DEFAULT_STYLE, resolvedPhysics, styleOf} from './ropeStyles.js';
import {resolve, KNOT_INSET, GRAB_PADDING} from './charmLayout.js';

/** Every rope must be asleep this many seconds after a push. */
export const SETTLE_LIMIT = 5;

// Settle envelope: the style's own damping alone for SETTLE_HOLD seconds after
// the last disturbance, so the first swings stay lively; then damping ramps up to
// SETTLE_ZETA × critical for this rope's pendulum frequency by SETTLE_END. Critical
// damping is the fastest way home that never creeps or overshoots, and computing
// it per rope makes a 300 px cord settle as promptly as a 60 px one.
const SETTLE_HOLD = 1.0;
const SETTLE_END = 2.0;
const SETTLE_ZETA = 1.0;
const REDUCED_HOLD = 0.2;
const REDUCED_END = 0.8;

// Hover nudges.
const NUDGE_REACH = 24;
const NUDGE_MIN_SPEED = 40;
const NUDGE_TRANSFER = 0.35;
const NUDGE_MAX_SPEED = 450;

// Elastic stretch: while a charm is held the rope may stretch up to MAX_ELASTIC
// times its length (so it follows the pointer down, not only sideways). The
// stretch follows the pointer at ELASTIC_FOLLOW per second, and on release a
// damped spring (RECOIL_OMEGA rad/s, RECOIL_ZETA of critical) pulls the rope back
// to its own length, bouncing the charm home.
export const MAX_ELASTIC = 1.6;
const ELASTIC_FOLLOW = 20;
const RECOIL_OMEGA = 11;
const RECOIL_ZETA = 0.45;
const MIN_ELASTIC = 0.85;

// Alternations of the guard between the anchor and a held node.
const GUARD_SWEEPS = 4;

// Sleep: DEFAULTS.framesBeforeSleep consecutive frames in which every node moved
// slower than the rest speed, while the rope hangs within PLUMB_TOLERANCE px of
// vertical (so a slow swing never freezes at a tilt).
const PLUMB_TOLERANCE = 0.5;

const EPSILON = 1e-9;

function smoothstep(t) {
    if (t <= 0)
        return 0;
    if (t >= 1)
        return 1;
    return t * t * (3 - 2 * t);
}

export class Rope {
    /**
     * @param {object} [options]
     * @param {number} [options.anchorX] where the rope is pinned
     * @param {number} [options.anchorY] …and the ceiling nothing may rise above
     * @param {number} [options.length] rest length, px
     * @param {string} [options.style] rope style id
     * @param {number} [options.charmCount] 1–3
     * @param {number} [options.charmSize] diameter of a lone charm, px
     * @param {number} [options.angle] release angle from vertical, radians
     * @param {boolean} [options.reducedMotion] hang still and settle fast
     * @param {string} [options.timeProfile] 'morning' | 'afternoon' | 'night'
     */
    constructor({
        anchorX = 0,
        anchorY = 0,
        length = DEFAULTS.segmentLength * DEFAULTS.segmentCount,
        style = DEFAULT_STYLE,
        charmCount = 1,
        charmSize = 44,
        angle,
        reducedMotion = false,
        timeProfile = 'afternoon',
    } = {}) {
        const n = DEFAULTS.segmentCount + 1;
        this.pointCount = n;
        this.x = new Float64Array(n);
        this.y = new Float64Array(n);
        this.px = new Float64Array(n);
        this.py = new Float64Array(n);
        this.invMass = new Float64Array(n);
        this._weights = new Float64Array(n);
        this._frameX = new Float64Array(n);
        this._frameY = new Float64Array(n);

        this.anchorX = anchorX;
        this.anchorY = anchorY;
        this.length = length;
        this.segmentLength = length / DEFAULTS.segmentCount;
        this.style = styleOf(style).id;
        this.reducedMotion = reducedMotion;
        this.slots = [];

        this.timeProfile = timeProfile;
        this._physics = resolvedPhysics(this.style, timeProfile);
        this._settleDamping = 1;
        this._charmCount = charmCount;
        this._charmSize = charmSize;
        this._accumulator = 0;
        this._still = 0;
        this._sleeping = false;
        this._since = 0;
        this._drag = -1;
        this._dragX = 0;
        this._dragY = 0;
        this._dragVX = 0;
        this._dragVY = 0;
        this._windX = 0;
        this._windY = 0;
        this._elastic = 1;
        this._elasticVelocity = 0;
        this._elasticDemand = 1;

        this._layout();
        this.reset(angle ?? (reducedMotion ? 0 : this._physics.initialAngle));
    }

    get isSleeping() {
        return this._sleeping;
    }

    get isDragging() {
        return this._drag >= 0;
    }

    /** How far the rope is stretched right now (1 = its own length). */
    get elastic() {
        return this._elastic;
    }

    /** Index of the held charm in `slots`, or -1. */
    get dragSlot() {
        return this.slots.findIndex(s => s.node === this._drag);
    }

    // ── lifecycle ──────────────────────────────────────────────────────────

    /** Lays the rope out straight at `angle` from vertical, motionless. */
    reset(angle = 0) {
        const sin = Math.sin(angle), cos = Math.cos(angle);
        for (let i = 0; i < this.pointCount; i++) {
            const d = i * this.segmentLength;
            this.x[i] = this.px[i] = this.anchorX + sin * d;
            this.y[i] = this.py[i] = this.anchorY + cos * d;
        }
        this._accumulator = 0;
        this._drag = -1;
        this._elastic = 1;
        this._elasticVelocity = 0;
        this._elasticDemand = 1;
        this._disturb();
    }

    wake() {
        this._sleeping = false;
        this._still = 0;
    }

    /**
     * Advances by `dt` seconds of wall time in fixed substeps.
     * @returns {number} substeps taken (0 while asleep)
     */
    step(dt) {
        if (this._sleeping || !(dt > 0))
            return 0;

        const h = DEFAULTS.fixedStep;
        dt = Math.min(dt, DEFAULTS.maxFrame);
        this._accumulator = Math.min(this._accumulator + dt, DEFAULTS.maxFrame);

        // Where every node started this frame, to judge how fast it moved over it.
        this._frameX.set(this.x);
        this._frameY.set(this.y);

        let steps = 0;
        while (this._accumulator >= h) {
            this._advance(h);
            this._accumulator -= h;
            steps++;
        }
        this._updateSleep(dt);
        return steps;
    }

    // ── interaction ────────────────────────────────────────────────────────

    /** A sideways shove at the speed of the rope's own release swing. */
    push(direction = 1) {
        if (direction === 0)
            return;
        const p = this._physics;
        const speed = Math.sqrt(2 * p.gravity * this.length * (1 - Math.cos(p.initialAngle)));
        const end = this.pointCount - 1;
        this.px[end] = this.x[end] - Math.sign(direction) * speed * DEFAULTS.fixedStep;
        this.py[end] = this.y[end];
        this._disturb();
    }

    /** Adds velocity (px/s) to one free node. */
    impulse(node, vx, vy) {
        if (node <= 0 || node >= this.pointCount || node === this._drag)
            return;
        const h = DEFAULTS.fixedStep;
        this.px[node] -= vx * h;
        this.py[node] -= vy * h;
        this._disturb();
    }

    /**
     * A pointer passing near a charm brushes it along. Nudging can never make a
     * charm faster than NUDGE_MAX_SPEED, so a wiggling pointer cannot pump energy.
     * @returns {boolean} whether any charm was nudged
     */
    nudge(pointerX, pointerY, vx, vy) {
        if (this._drag >= 0)
            return false;
        const speed = Math.hypot(vx, vy);
        if (speed < NUDGE_MIN_SPEED)
            return false;

        const h = DEFAULTS.fixedStep;
        const k = Math.min(NUDGE_TRANSFER * speed, NUDGE_MAX_SPEED) / speed;
        let nudged = false;
        for (const slot of this.slots) {
            const n = slot.node;
            if (Math.hypot(this.x[n] - pointerX, this.y[n] - pointerY) > slot.radius + NUDGE_REACH)
                continue;
            const cvx = (this.x[n] - this.px[n]) / h, cvy = (this.y[n] - this.py[n]) / h;
            let nvx = cvx + vx * k, nvy = cvy + vy * k;
            const cap = Math.max(NUDGE_MAX_SPEED, Math.hypot(cvx, cvy));
            const len = Math.hypot(nvx, nvy);
            if (len > cap) {
                nvx *= cap / len;
                nvy *= cap / len;
            }
            this.px[n] = this.x[n] - nvx * h;
            this.py[n] = this.y[n] - nvy * h;
            nudged = true;
        }
        if (nudged)
            this._disturb();
        return nudged;
    }

    /** Steady extra acceleration on every node, px/s² (the breeze). */
    setWind(ax, ay) {
        this._windX = ax;
        this._windY = ay;
        if (ax !== 0 || ay !== 0)
            this._disturb();
    }

    /** Index of the charm under (x, y), nearest first, or -1. */
    charmAt(x, y) {
        let best = -1, bestDistance = Infinity;
        for (let i = this.slots.length - 1; i >= 0; i--) {
            const s = this.slots[i];
            const d = Math.hypot(this.x[s.node] - x, this.y[s.node] - y);
            if (d <= s.radius + GRAB_PADDING && d < bestDistance) {
                best = i;
                bestDistance = d;
            }
        }
        return best;
    }

    /**
     * Picks up a charm. With `slot` given (the actor the pointer pressed on),
     * that charm is taken; otherwise whichever charm is under (x, y).
     * @returns {number} slot index or -1
     */
    beginDrag(x, y, slot = this.charmAt(x, y)) {
        if (!(slot >= 0 && slot < this.slots.length))
            return -1;
        this._drag = this.slots[slot].node;
        this._dragVX = this._dragVY = 0;
        this._setDragTarget(x, y);
        this._disturb();
        return slot;
    }

    /** Moves the held charm toward (x, y); (vx, vy) is the pointer velocity, px/s. */
    updateDrag(x, y, vx, vy) {
        if (this._drag < 0)
            return;
        this._setDragTarget(x, y);
        const speed = Math.hypot(vx, vy);
        const k = speed > DEFAULTS.maxSpeed ? DEFAULTS.maxSpeed / speed : 1;
        this._dragVX = vx * k;
        this._dragVY = vy * k;
        this._disturb();
    }

    /** Lets go; the held node keeps the pointer's velocity as momentum. */
    endDrag() {
        if (this._drag < 0)
            return;
        this._drag = -1;
        this._dragVX = this._dragVY = 0;
        this._disturb();
    }

    // ── configuration ──────────────────────────────────────────────────────

    /** Moves the anchor, carrying the rope and its motion along unchanged. */
    setAnchor(ax, ay) {
        const dx = ax - this.anchorX, dy = ay - this.anchorY;
        if (dx === 0 && dy === 0)
            return;
        for (let i = 0; i < this.pointCount; i++) {
            this.x[i] += dx;
            this.px[i] += dx;
            this.y[i] += dy;
            this.py[i] += dy;
        }
        this._dragX += dx;
        this._dragY += dy;
        this.anchorX = ax;
        this.anchorY = ay;
    }

    setStyle(id) {
        const style = styleOf(id).id;
        if (style === this.style)
            return;
        this.style = style;
        this._physics = resolvedPhysics(style, this.timeProfile);
        this._layout();
        this.wake();
    }

    /** Changes the rest length, scaling the current shape (and motion) to match. */
    setLength(length) {
        if (!(length > 0) || length === this.length)
            return;
        const k = length / this.length;
        for (let i = 0; i < this.pointCount; i++) {
            this.x[i] = this.anchorX + (this.x[i] - this.anchorX) * k;
            this.px[i] = this.anchorX + (this.px[i] - this.anchorX) * k;
            this.y[i] = this.anchorY + (this.y[i] - this.anchorY) * k;
            this.py[i] = this.anchorY + (this.py[i] - this.anchorY) * k;
        }
        this.length = length;
        this.segmentLength = length / DEFAULTS.segmentCount;
        this._layout();
        this.wake();
    }

    setCharms(count, size) {
        this._charmCount = count;
        this._charmSize = size;
        if (this._drag >= 0)
            this.endDrag();
        this._layout();
        this.wake();
    }

    /** Applies a time-of-day profile ('morning' | 'afternoon' | 'night') to the style. */
    setTimeProfile(profile) {
        if (profile === this.timeProfile)
            return;
        this.timeProfile = profile;
        this._physics = resolvedPhysics(this.style, profile);
        this._layout();
        this.wake();
    }

    setReducedMotion(reduced) {
        this.reducedMotion = reduced;
    }

    // ── geometry for drawing and hit-testing ───────────────────────────────

    /**
     * Where charm `index` is drawn: its centre, radius and the clockwise screen
     * rotation (radians) that makes its upright artwork follow the rope.
     */
    charmPose(index, out = {}) {
        const slot = this.slots[index];
        const n = slot.node;
        this._pointBack(n, slot.radius * KNOT_INSET, out);
        const kx = out.x, ky = out.y;
        out.x = this.x[n];
        out.y = this.y[n];
        out.radius = slot.radius;
        out.angle = -Math.atan2(out.x - kx, out.y - ky);
        return out;
    }

    /**
     * Where the drawn cord ends: the knot on top of the bottom charm.
     * `out.segment` is the node just below that point, so the cord is drawn
     * through nodes 0 … segment-1 and then to (out.x, out.y).
     */
    cordEnd(out = {}) {
        const slot = this.slots[this.slots.length - 1];
        return this._pointBack(slot.node, slot.radius * KNOT_INSET, out);
    }

    /** Axis-aligned bounds of the rope, optionally including its charms. */
    bounds(includeCharms = true, out = {}) {
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (let i = 0; i < this.pointCount; i++) {
            const x = this.x[i], y = this.y[i];
            if (x < x1)
                x1 = x;
            if (x > x2)
                x2 = x;
            if (y < y1)
                y1 = y;
            if (y > y2)
                y2 = y;
        }
        if (includeCharms) {
            for (const s of this.slots) {
                const x = this.x[s.node], y = this.y[s.node], r = s.radius;
                x1 = Math.min(x1, x - r);
                x2 = Math.max(x2, x + r);
                y1 = Math.min(y1, y - r);
                y2 = Math.max(y2, y + r);
            }
        }
        out.x1 = x1;
        out.y1 = y1;
        out.x2 = x2;
        out.y2 = y2;
        return out;
    }

    // ── internals ──────────────────────────────────────────────────────────

    _disturb() {
        this._since = 0;
        this.wake();
    }

    _layout() {
        this.slots = resolve({
            count: this._charmCount,
            charmSize: this._charmSize,
            segmentLength: this.segmentLength,
            segmentCount: DEFAULTS.segmentCount,
            massScale: this._physics.charmMassScale,
        });

        // Critical damping for a pendulum of this length: c = 2ζω, ω = √(g/L).
        const omega = Math.sqrt(this._physics.gravity / this.length);
        this._settleDamping = Math.max(0.9, 1 - 2 * SETTLE_ZETA * omega * DEFAULTS.fixedStep);

        // The end node *is* its charm; an interior charm adds to the rope node.
        const inv = this.invMass;
        const last = this.pointCount - 1;
        inv.fill(1);
        inv[0] = 0;
        for (const s of this.slots)
            inv[s.node] = s.node === last ? 1 / s.mass : 1 / (1 + s.mass);
    }

    _setDragTarget(x, y) {
        // Only the rope above the held node can hold it back; pulling past its
        // length stretches it, up to MAX_ELASTIC.
        const natural = this._drag * this.segmentLength * DEFAULTS.reachRatio;
        const reach = natural * MAX_ELASTIC;
        let dx = x - this.anchorX, dy = Math.max(0, y - this.anchorY);
        const d = Math.hypot(dx, dy);
        if (d > reach && d > EPSILON) {
            dx *= reach / d;
            dy *= reach / d;
        }
        this._dragX = this.anchorX + dx;
        this._dragY = this.anchorY + dy;
        this._elasticDemand = natural > EPSILON ? Math.max(1, Math.min(MAX_ELASTIC, Math.hypot(dx, dy) / natural)) : 1;
    }

    /** Eases the stretch toward the pointer while held; springs it back after. */
    _advanceElastic(h) {
        const before = this._elastic;
        if (this._drag >= 0) {
            this._elastic += (this._elasticDemand - this._elastic) * Math.min(1, ELASTIC_FOLLOW * h);
            this._elasticVelocity = (this._elastic - before) / h;
            return;
        }
        if (this._elastic === 1 && this._elasticVelocity === 0)
            return;
        const w = RECOIL_OMEGA;
        const accel = -w * w * (this._elastic - 1) - 2 * RECOIL_ZETA * w * this._elasticVelocity;
        this._elasticVelocity += accel * h;
        this._elastic = Math.max(MIN_ELASTIC, Math.min(MAX_ELASTIC, this._elastic + this._elasticVelocity * h));
        if (Math.abs(this._elastic - 1) < 1e-4 && Math.abs(this._elasticVelocity) < 1e-3) {
            this._elastic = 1;
            this._elasticVelocity = 0;
        }
        // Still recoiling counts as a disturbance: the settle envelope waits for it.
        this._since = 0;
    }

    _advance(h) {
        const x = this.x, y = this.y, px = this.px, py = this.py, inv = this.invMass;
        const n = this.pointCount;
        const p = this._physics;
        const drag = this._drag;

        if (drag >= 0 || this._windX !== 0 || this._windY !== 0)
            this._since = 0;
        else
            this._since += h;
        this._advanceElastic(h);
        const rest = this.segmentLength * this._elastic;

        // Settle envelope.
        const hold = this.reducedMotion ? REDUCED_HOLD : SETTLE_HOLD;
        const end = this.reducedMotion ? REDUCED_END : SETTLE_END;
        const settle = smoothstep((this._since - hold) / (end - hold));
        const damping = Math.min(p.damping, p.damping + (this._settleDamping - p.damping) * settle);

        // 1. Pin the anchor.
        x[0] = px[0] = this.anchorX;
        y[0] = py[0] = this.anchorY;

        // 2. Integrate.
        const gx = this._windX * h * h;
        const gy = (p.gravity + this._windY) * h * h;
        const maxStep = DEFAULTS.maxSpeed * h;
        for (let i = 1; i < n; i++) {
            if (i === drag || inv[i] === 0)
                continue;
            let vx = (x[i] - px[i]) * damping;
            let vy = (y[i] - py[i]) * damping;
            const s2 = vx * vx + vy * vy;
            if (s2 > maxStep * maxStep) {
                const k = maxStep / Math.sqrt(s2);
                vx *= k;
                vy *= k;
            }
            px[i] = x[i];
            py[i] = y[i];
            x[i] += vx + gx;
            y[i] += vy + gy;
        }

        // 3. Drive the held node at a finite rate; its history carries the pointer's velocity.
        if (drag >= 0) {
            let dx = this._dragX - x[drag], dy = this._dragY - y[drag];
            const d = Math.hypot(dx, dy);
            if (d > maxStep) {
                dx *= maxStep / d;
                dy *= maxStep / d;
            }
            x[drag] += dx;
            y[drag] += dy;
            px[drag] = x[drag] - this._dragVX * h;
            py[drag] = y[drag] - this._dragVY * h;
        }

        this._prepareWeights();

        // 4. Relax until converged or out of budget, in forward+backward pairs:
        //    stopping after a lone forward sweep on some substeps and a backward
        //    one on others leaves a sub-pixel flicker that never settles.
        for (let it = 0; it < p.iterations; it += 2) {
            const forward = this._relax(false, rest);
            const backward = this._relax(true, rest);
            const residual = Math.max(forward, backward, this._separateCharms());
            if (residual < DEFAULTS.tolerance)
                break;
        }

        // 5. Stretch ceiling, then the ceiling, then the exact guard.
        // Like relaxation, capped with an early exit at the convergence tolerance:
        // under gravity a tight cord (1.004) sits right at its ceiling, and "any
        // link over by anything" would never exit and run every pass, every step.
        // The guard below makes the ceiling exact regardless.
        const limit = rest * p.maxStretch;
        for (let pass = 0; pass < p.stretchPasses; pass++) {
            if (this._clampStretch(limit, pass & 1) < DEFAULTS.tolerance)
                break;
        }
        this._applyCeiling();
        this._guard(limit);
    }

    /** One Gauss-Seidel sweep over every link. @returns largest correction */
    _relax(backward, rest) {
        // The hottest loop in the extension: written out in full, over the
        // effective inverse masses prepared once per substep (_prepareWeights).
        const x = this.x, y = this.y, w = this._weights;
        const last = this.pointCount - 2;
        let worst = 0;
        for (let s = 0; s <= last; s++) {
            const a = backward ? last - s : s, b = a + 1;
            const wa = w[a], wb = w[b], total = wa + wb;
            if (total <= 0)
                continue;
            const dx = x[b] - x[a], dy = y[b] - y[a];
            const d2 = dx * dx + dy * dy;
            if (d2 <= EPSILON * EPSILON)
                continue;
            const d = Math.sqrt(d2);
            const diff = d - rest;
            const k = diff / (d * total);
            x[a] += dx * k * wa;
            y[a] += dy * k * wa;
            x[b] -= dx * k * wb;
            y[b] -= dy * k * wb;
            const correction = (diff < 0 ? -diff : diff) * (wa > wb ? wa : wb) / total;
            if (correction > worst)
                worst = correction;
        }
        return worst;
    }

    /** Effective inverse masses for this substep: a held node is immovable. */
    _prepareWeights() {
        const w = this._weights;
        w.set(this.invMass);
        if (this._drag >= 0)
            w[this._drag] = 0;
    }

    /** Clamp sweep: only links longer than `limit`. @returns the largest correction */
    _clampStretch(limit, backward) {
        const n = this.pointCount;
        let worst = 0;
        if (backward) {
            for (let i = n - 2; i >= 0; i--)
                worst = Math.max(worst, this._solveLink(i, limit, true));
        } else {
            for (let i = 0; i < n - 1; i++)
                worst = Math.max(worst, this._solveLink(i, limit, true));
        }
        return worst;
    }

    /**
     * Pulls link (a, a+1) toward `rest`, sharing the correction by mobility.
     * With `oneSided`, links already within `rest` are left alone.
     * @returns {number} size of the larger correction
     */
    _solveLink(a, rest, oneSided) {
        const b = a + 1;
        const x = this.x, y = this.y;
        const wa = a === this._drag ? 0 : this.invMass[a];
        const wb = b === this._drag ? 0 : this.invMass[b];
        const w = wa + wb;
        if (w <= 0)
            return 0;
        const dx = x[b] - x[a], dy = y[b] - y[a];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= EPSILON || (oneSided && d <= rest))
            return 0;
        const k = (d - rest) / d / w;
        x[a] += dx * k * wa;
        y[a] += dy * k * wa;
        x[b] -= dx * k * wb;
        y[b] -= dy * k * wb;
        return Math.abs(d - rest) * Math.max(wa, wb) / w;
    }

    /** Keeps stacked charms from passing through each other. */
    _separateCharms() {
        const slots = this.slots;
        if (slots.length < 2)
            return 0;
        const x = this.x, y = this.y;
        let worst = 0;
        for (let i = 0; i < slots.length - 1; i++) {
            for (let j = i + 1; j < slots.length; j++) {
                const a = slots[i].node, b = slots[j].node;
                const min = slots[i].radius + slots[j].radius;
                const wa = a === this._drag ? 0 : this.invMass[a];
                const wb = b === this._drag ? 0 : this.invMass[b];
                const w = wa + wb;
                if (w <= 0)
                    continue;
                let dx = x[b] - x[a], dy = y[b] - y[a];
                let d = Math.sqrt(dx * dx + dy * dy);
                if (d >= min)
                    continue;
                if (d <= EPSILON) {
                    dx = 0;
                    dy = 1;
                    d = 1;
                } else {
                    dx /= d;
                    dy /= d;
                }
                const c = (d - min) / w;
                x[a] += dx * c * wa;
                y[a] += dy * c * wa;
                x[b] -= dx * c * wb;
                y[b] -= dy * c * wb;
                worst = Math.max(worst, Math.abs(c) * Math.max(wa, wb));
            }
        }
        return worst;
    }

    /** Nothing may rise above the anchor; upward motion stops there. */
    _applyCeiling() {
        const top = this.anchorY;
        const y = this.y, py = this.py;
        for (let i = 1; i < this.pointCount; i++) {
            if (y[i] < top)
                y[i] = py[i] = top;
        }
    }

    /**
     * Follow-the-leader projection making the stretch ceiling exact. Like any
     * position-based correction, the move also cancels the velocity that carried
     * the node past the limit (history is left alone). Moves stay on the segment
     * between two nodes below the ceiling, so the ceiling holds too.
     */
    _guard(limit) {
        const drag = this._drag;
        if (drag > 0) {
            for (let s = 0; s < GUARD_SWEEPS; s++) {
                for (let i = drag - 1; i >= 1; i--)
                    this._follow(i, i + 1, limit);
                for (let i = 1; i < drag; i++)
                    this._follow(i, i - 1, limit);
            }
        }
        for (let i = 1; i < this.pointCount; i++)
            this._follow(i, i - 1, limit);
    }

    /** Moves `node` to within `limit` of `leader`. */
    _follow(node, leader, limit) {
        const x = this.x, y = this.y;
        const dx = x[node] - x[leader], dy = y[node] - y[leader];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= limit)
            return;
        const k = limit / d;
        x[node] = x[leader] + dx * k;
        y[node] = y[leader] + dy * k;
    }

    /** Point `distance` px back up the rope from `node` (toward the anchor); sets out.segment. */
    _pointBack(node, distance, out) {
        const x = this.x, y = this.y;
        let remaining = distance;
        for (let j = node; j > 0; j--) {
            const dx = x[j - 1] - x[j], dy = y[j - 1] - y[j];
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len >= remaining && len > EPSILON) {
                const t = remaining / len;
                out.x = x[j] + dx * t;
                out.y = y[j] + dy * t;
                out.segment = j;
                return out;
            }
            remaining -= len;
        }
        out.x = x[0];
        out.y = y[0];
        out.segment = 1;
        return out;
    }

    /**
     * Sleep follows the reference rule: the rope must stay still (every node
     * slower than the rest speed over the frame) for framesBeforeSleep
     * consecutive frames. Speed is measured across the whole frame rather than
     * one substep, so the solver's sub-pixel corrections within a frame cancel
     * out. A rope must also hang plumb, so a slow swing never freezes at a tilt.
     */
    _updateSleep(dt) {
        if (this._drag >= 0 || this._windX !== 0 || this._windY !== 0 || this._elastic !== 1) {
            this._still = 0;
            return;
        }
        const x = this.x, y = this.y, fx = this._frameX, fy = this._frameY;
        const limit = this._physics.restSpeed * dt;
        const limit2 = limit * limit;
        for (let i = 1; i < this.pointCount; i++) {
            const dx = x[i] - fx[i], dy = y[i] - fy[i];
            if (dx * dx + dy * dy > limit2 || Math.abs(x[i] - this.anchorX) > PLUMB_TOLERANCE) {
                this._still = 0;
                return;
            }
        }
        this._still += 1;
        if (this._still >= DEFAULTS.framesBeforeSleep) {
            // Freeze exactly: a sleeping rope carries no velocity into its wake.
            this.px.set(this.x);
            this.py.set(this.y);
            this._accumulator = 0;
            this._sleeping = true;
        }
    }
}
