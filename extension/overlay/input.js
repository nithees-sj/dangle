// Grabbing and flicking charms.
//
// Charms are NOT reactive by default, so clicks always reach the windows under
// them. The overlay arms them (makes them reactive) only while the pointer is
// near the cords and the grab modifier is held, or always when the user asked
// for grabbing without a modifier. A drag holds a global.stage.grab(), which is
// always dismissed on release, on hide, when the charm goes away and in destroy.
//
// Clutter only re-picks the actor under the pointer when the pointer moves, so a
// charm armed under a resting pointer would never see the click. While armed
// (and only then) a stage 'captured-event' handler therefore checks presses with
// a fresh pick and starts the drag itself when the press is on a charm; any
// other press is left untouched.

import Clutter from 'gi://Clutter';

/** Weight of the newest pointer sample in the flick velocity. */
const VELOCITY_SMOOTHING = 0.5;
/** Letting go after holding still must not fling the charm. */
const STALE_MOTION_MS = 80;

export class CharmInput {
    /** @param {() => void} onActivity wakes the animation */
    constructor(onActivity) {
        this._onActivity = onActivity;
        this._actors = new Set();
        this._armed = false;
        this._drag = null;
        this._grab = null;
        this._capturedId = 0;
    }

    get dragging() {
        return this._drag !== null;
    }

    /** Wires up a cord's charm actors (idempotent: call after any rebuild). */
    attach(cord) {
        for (const actor of cord.charmActors) {
            if (this._actors.has(actor))
                continue;
            this._actors.add(actor);
            actor.reactive = this._armed;
            actor.connectObject(
                'button-press-event', (a, event) => this._onButtonPress(a, event),
                'motion-event', (a, event) => this._onMotion(a, event),
                'button-release-event', (a, event) => this._onButtonRelease(a, event),
                'touch-event', (a, event) => this._onTouch(a, event),
                'destroy', a => this._onActorDestroyed(a),
                this);
        }
    }

    /** Makes charms catch clicks (true) or let them through (false). */
    setArmed(armed) {
        if (armed === this._armed)
            return;
        this._armed = armed;
        for (const actor of this._actors) {
            actor.reactive = armed || actor === this._drag?.actor;
            // A relayout makes Clutter re-pick what is under the pointer after the
            // next frame; otherwise a press over a window would still be routed
            // (by mutter, before we see it) to the window the pointer last hit.
            actor.queue_relayout();
        }
        global.stage.schedule_update();
        this._syncCapture();
    }

    /** The press watcher exists only while armed or dragging. */
    _syncCapture() {
        const want = this._armed || this._drag !== null;
        if (want && !this._capturedId) {
            this._capturedId = global.stage.connect('captured-event', (_stage, event) => this._onCaptured(event));
        } else if (!want && this._capturedId) {
            global.stage.disconnect(this._capturedId);
            this._capturedId = 0;
        }
    }

    /** Ends any drag and releases the grab. */
    cancel() {
        this._endDrag(false);
    }

    destroy() {
        this.cancel();
        this._armed = false;
        this._syncCapture();
        for (const actor of this._actors)
            actor.disconnectObject(this);
        this._actors.clear();
        this._onActivity = null;
    }

    // ── events ─────────────────────────────────────────────────────────────

    _onCaptured(event) {
        const type = event.type();
        if (type !== Clutter.EventType.BUTTON_PRESS && type !== Clutter.EventType.TOUCH_BEGIN)
            return Clutter.EVENT_PROPAGATE;
        // Never steal from a menu, dialog or other grab, or while already dragging.
        if (!this._armed || this._drag || global.stage.get_grab_actor())
            return Clutter.EVENT_PROPAGATE;
        if (type === Clutter.EventType.BUTTON_PRESS && event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        const hit = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
        if (!this._actors.has(hit))
            return Clutter.EVENT_PROPAGATE;
        const sequence = type === Clutter.EventType.TOUCH_BEGIN ? event.get_event_sequence() : null;
        return this._begin(hit, event, sequence);
    }

    _onButtonPress(actor, event) {
        if (event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;
        return this._begin(actor, event, null);
    }

    _onMotion(actor, event) {
        if (this._drag?.actor !== actor || this._drag.sequence)
            return Clutter.EVENT_PROPAGATE;
        this._track(event);
        return Clutter.EVENT_STOP;
    }

    _onButtonRelease(actor, event) {
        if (this._drag?.actor !== actor || this._drag.sequence)
            return Clutter.EVENT_PROPAGATE;
        // The release repeats the last position; tracking it would only damp the flick.
        this._endDrag(event.get_time() - this._drag.time <= STALE_MOTION_MS);
        return Clutter.EVENT_STOP;
    }

    _onTouch(actor, event) {
        const type = event.type();
        const sequence = event.get_event_sequence();
        if (type === Clutter.EventType.TOUCH_BEGIN)
            return this._begin(actor, event, sequence);
        if (this._drag?.actor !== actor || this._drag.sequence !== sequence)
            return Clutter.EVENT_PROPAGATE;
        if (type === Clutter.EventType.TOUCH_UPDATE) {
            this._track(event);
        } else {
            this._endDrag(type === Clutter.EventType.TOUCH_END &&
                event.get_time() - this._drag.time <= STALE_MOTION_MS);
        }
        return Clutter.EVENT_STOP;
    }

    _onActorDestroyed(actor) {
        this._actors.delete(actor);
        if (this._drag?.actor === actor)
            this._endDrag(false);
    }

    // ── dragging ───────────────────────────────────────────────────────────

    _begin(actor, event, sequence) {
        if (this._drag)
            return Clutter.EVENT_STOP;
        const rope = actor._dangleCord?.rope;
        if (!rope)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        if (rope.beginDrag(x, y, actor._dangleSlot) < 0)
            return Clutter.EVENT_PROPAGATE;

        this._drag = {actor, rope, sequence, x, y, time: event.get_time(), vx: 0, vy: 0};
        this._grab = global.stage.grab(actor);
        this._syncCapture();
        this._onActivity?.();
        return Clutter.EVENT_STOP;
    }

    _track(event) {
        const drag = this._drag;
        const [x, y] = event.get_coords();
        const time = event.get_time();
        const dt = (time - drag.time) / 1000;
        if (dt > 0) {
            const k = VELOCITY_SMOOTHING;
            drag.vx = drag.vx * (1 - k) + (x - drag.x) / dt * k;
            drag.vy = drag.vy * (1 - k) + (y - drag.y) / dt * k;
            drag.time = time;
        }
        drag.x = x;
        drag.y = y;
        drag.rope.updateDrag(x, y, drag.vx, drag.vy);
        this._onActivity?.();
    }

    /** @param {boolean} fling keep the pointer's velocity as momentum */
    _endDrag(fling) {
        const drag = this._drag;
        if (!drag)
            return;
        this._drag = null;
        if (drag.rope.isDragging) {
            if (!fling)
                drag.rope.updateDrag(drag.x, drag.y, 0, 0);
            drag.rope.endDrag();
        }
        this._grab?.dismiss();
        this._grab = null;
        if (this._actors.has(drag.actor))
            drag.actor.reactive = this._armed;
        this._syncCapture();
        this._onActivity?.();
    }
}
