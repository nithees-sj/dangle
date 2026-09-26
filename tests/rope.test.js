import {test} from 'node:test';
import assert from 'node:assert/strict';

import {Rope, SETTLE_LIMIT, MAX_ELASTIC} from '../core/rope.js';
import {DEFAULTS, STYLE_IDS} from '../core/ropeStyles.js';
import {mulberry32, stretchOf, allFinite, timeToSleep} from './helpers.js';

const STRETCH_LIMIT = 1.02 + 1e-9;
/** While held, a rope may stretch elastically (and keep its style's give on top). */
const HELD_LIMIT = MAX_ELASTIC * 1.02 + 1e-9;
const ANCHOR = {anchorX: 500, anchorY: 32};

function hanging(opts = {}) {
    const rope = new Rope({...ANCHOR, length: 140, charmCount: 1, charmSize: 44, angle: 0, ...opts});
    timeToSleep(rope);
    return rope;
}

test('a rope released at an angle swings, then hangs straight below the anchor', () => {
    const rope = new Rope({...ANCHOR, length: 140});
    rope.step(1 / 60);
    assert.equal(rope.isSleeping, false);
    assert.ok(timeToSleep(rope) < SETTLE_LIMIT);
    const end = rope.pointCount - 1;
    assert.ok(Math.abs(rope.x[end] - 500) < 1.5, `x ${rope.x[end]}`);
    const drop = rope.y[end] - 32;
    assert.ok(drop > 140 * 0.97 && drop <= 140 * 1.02 + 1e-9, `drop ${drop}`);
});

test('a sleeping rope costs nothing and does not move', () => {
    const rope = hanging();
    assert.equal(rope.isSleeping, true);
    const before = Float64Array.from(rope.y);
    assert.equal(rope.step(1 / 60), 0);
    assert.deepEqual(Float64Array.from(rope.y), before);
});

test('dt is capped at 50 ms: a stall never turns into a burst of catch-up steps', () => {
    const rope = new Rope({...ANCHOR});
    const steps = rope.step(3.0);
    assert.ok(steps <= Math.round(DEFAULTS.maxFrame / DEFAULTS.fixedStep), `took ${steps}`);
    assert.ok(steps >= 11);
});

test('push() wakes a sleeping rope and moves it sideways', () => {
    const rope = hanging();
    rope.push(1);
    assert.equal(rope.isSleeping, false);
    for (let i = 0; i < 10; i++)
        rope.step(1 / 60);
    assert.ok(rope.x[rope.pointCount - 1] > 505, 'swung right');
});

for (const style of STYLE_IDS) {
    test(`${style}: stretches at most ${MAX_ELASTIC}× while held, and back to ≤ 1.02× after`, () => {
        const rng = mulberry32(style.length * 7919);
        for (const count of [1, 3]) {
            const rope = new Rope({...ANCHOR, length: 140, style, charmCount: count, angle: 0});
            for (let slot = 0; slot < count; slot++) {
                const node = rope.slots[slot].node;
                assert.equal(rope.beginDrag(rope.x[node], rope.y[node]), slot);
                for (let f = 0; f < 240; f++) {
                    const tx = 500 + (rng() - 0.5) * 2000;
                    const ty = 32 + (rng() - 0.3) * 1200;
                    rope.updateDrag(tx, ty, (rng() - 0.5) * 20000, (rng() - 0.5) * 20000);
                    rope.step(rng() * 0.05);
                    assert.ok(stretchOf(rope) <= HELD_LIMIT, `stretch ${stretchOf(rope)} while dragging`);
                }
                rope.endDrag();
                for (let f = 0; f < 600 && !rope.isSleeping; f++) {
                    rope.step(1 / 60);
                    assert.ok(stretchOf(rope) <= HELD_LIMIT, `stretch ${stretchOf(rope)} while recoiling`);
                }
                assert.equal(rope.elastic, 1, 'springs back to its own length');
                assert.ok(stretchOf(rope) <= STRETCH_LIMIT, `stretch ${stretchOf(rope)} at rest`);
            }
        }
    });

    test(`${style}: sleeps within ${SETTLE_LIMIT} s after a push (every length and stack)`, t => {
        let worst = 0;
        for (const length of [60, 140, 300]) {
            for (const count of [1, 2, 3]) {
                const rope = hanging({style, length, charmCount: count});
                assert.equal(rope.isSleeping, true, 'starts at rest');
                rope.push(1);
                const secs = timeToSleep(rope, 20);
                assert.ok(secs <= SETTLE_LIMIT, `${length}px ×${count}: ${secs.toFixed(2)} s`);
                worst = Math.max(worst, secs);
            }
        }
        t.diagnostic(`${style}: worst settle ${worst.toFixed(2)} s`);
    });
}

test('stable under 1000 random pushes, drags, gusts and dt spikes', () => {
    const rng = mulberry32(42);
    for (const style of STYLE_IDS) {
        const rope = new Rope({...ANCHOR, length: 60 + rng() * 240, style, charmCount: 1 + Math.floor(rng() * 3)});
        for (let i = 0; i < 1000; i++) {
            const r = rng();
            if (r < 0.2) {
                rope.push(rng() < 0.5 ? -1 : 1);
            } else if (r < 0.4) {
                const node = 1 + Math.floor(rng() * (rope.pointCount - 1));
                rope.impulse(node, (rng() - 0.5) * 10000, (rng() - 0.5) * 10000);
            } else if (r < 0.55) {
                const s = rope.slots[Math.floor(rng() * rope.slots.length)];
                rope.beginDrag(rope.x[s.node], rope.y[s.node]);
            } else if (r < 0.7) {
                rope.updateDrag(rng() * 2000 - 500, rng() * 1500 - 300, (rng() - 0.5) * 1e5, (rng() - 0.5) * 1e5);
            } else if (r < 0.75) {
                rope.endDrag();
            } else if (r < 0.85) {
                rope.setWind((rng() - 0.5) * 2000, (rng() - 0.5) * 200);
            } else if (r < 0.9) {
                rope.setAnchor(500 + (rng() - 0.5) * 40, 32 + (rng() - 0.5) * 10);
            }
            const dt = rng() < 0.05 ? rng() : rng() * 0.05;
            rope.step(dt);
            assert.ok(allFinite(rope), `${style}: finite at ${i}`);
            assert.ok(stretchOf(rope) <= HELD_LIMIT, `${style}: stretch ${stretchOf(rope)} at ${i}`);
            if (!rope.isDragging && rope.elastic === 1)
                assert.ok(stretchOf(rope) <= STRETCH_LIMIT, `${style}: rest stretch ${stretchOf(rope)} at ${i}`);
            for (let n = 0; n < rope.pointCount; n++)
                assert.ok(rope.y[n] >= rope.anchorY - 1e-9, `${style}: node ${n} above the bar at ${i}`);
        }
    }
});

test('nothing rises above the anchor, even when dragged there', () => {
    const rope = hanging();
    const end = rope.pointCount - 1;
    rope.beginDrag(rope.x[end], rope.y[end]);
    for (let f = 0; f < 120; f++) {
        rope.updateDrag(560, -400, 0, -3000);
        rope.step(1 / 60);
        for (let n = 0; n < rope.pointCount; n++)
            assert.ok(rope.y[n] >= 32 - 1e-9);
    }
    rope.endDrag();
    for (let f = 0; f < 60; f++) {
        rope.step(1 / 60);
        for (let n = 0; n < rope.pointCount; n++)
            assert.ok(rope.y[n] >= 32 - 1e-9);
    }
});

test('drag reach is clamped to the (stretched) rope above the held node', () => {
    for (const count of [1, 3]) {
        const rope = new Rope({...ANCHOR, length: 140, charmCount: count, angle: 0});
        const slot = rope.slots[0];
        rope.beginDrag(rope.x[slot.node], rope.y[slot.node]);
        for (let f = 0; f < 120; f++) {
            rope.updateDrag(1500, 900, 0, 0);
            rope.step(1 / 60);
        }
        const reach = Math.hypot(rope.x[slot.node] - 500, rope.y[slot.node] - 32);
        const natural = slot.node * rope.segmentLength * DEFAULTS.reachRatio;
        assert.ok(reach <= natural * MAX_ELASTIC + 1e-6, `reach ${reach}`);
        assert.ok(reach > natural * (MAX_ELASTIC - 0.1), 'stretches most of the way out');
    }
});

test('beginDrag only grabs a charm, and reports which one', () => {
    const rope = hanging({charmCount: 2});
    const [top, bottom] = rope.slots;
    assert.equal(rope.beginDrag(rope.x[top.node], rope.y[top.node]), 0);
    rope.endDrag();
    assert.equal(rope.beginDrag(rope.x[bottom.node] + 3, rope.y[bottom.node]), 1);
    assert.equal(rope.isDragging, true);
    rope.endDrag();
    assert.equal(rope.beginDrag(900, 900), -1);
    assert.equal(rope.isDragging, false);
});

test('a flick keeps its momentum after release', () => {
    const rope = hanging();
    const end = rope.pointCount - 1;
    rope.beginDrag(rope.x[end], rope.y[end]);
    for (let f = 0; f < 10; f++) {
        rope.updateDrag(500 + f * 8, rope.y[end], 480, 0);
        rope.step(1 / 60);
    }
    rope.endDrag();
    const x0 = rope.x[end];
    rope.step(1 / 60);
    assert.ok(rope.x[end] > x0 + 2, 'keeps moving right');
});

test('moving the anchor carries the swing with it exactly', () => {
    const a = new Rope({...ANCHOR, length: 140});
    const b = new Rope({...ANCHOR, length: 140});
    for (let f = 0; f < 20; f++) {
        a.step(1 / 60);
        b.step(1 / 60);
    }
    b.setAnchor(600, 32);
    for (let f = 0; f < 30; f++) {
        a.step(1 / 60);
        b.step(1 / 60);
    }
    for (let n = 0; n < a.pointCount; n++) {
        assert.ok(Math.abs(b.x[n] - a.x[n] - 100) < 1e-6, `x offset at ${n}`);
        assert.ok(Math.abs(b.y[n] - a.y[n]) < 1e-6, `y at ${n}`);
    }
});

test('hover nudges wake the rope only when the pointer is close and moving', () => {
    const rope = hanging();
    const end = rope.pointCount - 1;
    assert.equal(rope.nudge(rope.x[end] + 400, rope.y[end], 800, 0), false);
    assert.equal(rope.isSleeping, true);
    assert.equal(rope.nudge(rope.x[end] + 10, rope.y[end], 0, 0), false, 'still pointer does nothing');
    assert.equal(rope.nudge(rope.x[end] + 10, rope.y[end], -800, 0), true);
    assert.equal(rope.isSleeping, false);
    for (let f = 0; f < 10; f++)
        rope.step(1 / 60);
    assert.ok(rope.x[end] < 500 - 1, 'pushed the way the pointer moved');
});

test('wind leans the rope and keeps it awake', () => {
    const rope = hanging();
    rope.setWind(300, 0);
    for (let f = 0; f < 240; f++)
        rope.step(1 / 60);
    assert.equal(rope.isSleeping, false);
    assert.ok(rope.x[rope.pointCount - 1] > 510, 'leans downwind');
    rope.setWind(0, 0);
    assert.ok(timeToSleep(rope) <= SETTLE_LIMIT);
});

test('charm pose follows the rope: upright at rest, tilted when swung', () => {
    const rope = hanging();
    const rest = rope.charmPose(0);
    assert.ok(Math.abs(rest.angle) < 0.02, `rest angle ${rest.angle}`);
    assert.equal(rest.x, rope.x[rope.pointCount - 1]);
    assert.equal(rest.radius, 22);
    const end = rope.pointCount - 1;
    rope.beginDrag(rope.x[end], rope.y[end]);
    for (let f = 0; f < 60; f++) {
        rope.updateDrag(640, 100, 0, 0);
        rope.step(1 / 60);
    }
    const swung = rope.charmPose(0);
    assert.ok(swung.angle < -0.3, `charm to the right tilts counter-clockwise (${swung.angle})`);
});

test('cordEnd stops at the bottom charm knot', () => {
    const rope = hanging();
    const end = rope.cordEnd();
    const r = rope.slots[0].radius;
    assert.ok(Math.abs(end.x - 500) < 1);
    assert.ok(Math.abs(rope.y[rope.pointCount - 1] - end.y - r * 0.9) < 1.5);
});

test('bounds cover the rope and its charms', () => {
    const rope = hanging();
    const b = rope.bounds(false);
    const withCharms = rope.bounds(true);
    assert.ok(b.y1 >= 32 - 1e-9 && b.y1 <= 32 + 1e-9);
    assert.ok(withCharms.y2 >= b.y2 + 21);
    assert.ok(withCharms.x1 <= 500 - 21 && withCharms.x2 >= 500 + 21);
});

test('changing style, length and charms keeps the rope valid and awake', () => {
    const rope = hanging();
    rope.setStyle('gold-chain');
    assert.equal(rope.isSleeping, false);
    assert.equal(rope.style, 'gold-chain');
    rope.setLength(220);
    assert.ok(Math.abs(rope.segmentLength - 11) < 1e-12);
    assert.ok(stretchOf(rope) <= STRETCH_LIMIT);
    rope.setCharms(3, 40);
    assert.equal(rope.slots.length, 3);
    assert.ok(timeToSleep(rope) <= SETTLE_LIMIT);
    const drop = rope.y[rope.pointCount - 1] - 32;
    assert.ok(drop > 220 * 0.97, `drop ${drop}`);
});

test('reduced motion: resets hanging still and settles quickly', () => {
    const rope = new Rope({...ANCHOR, length: 140, reducedMotion: true});
    assert.ok(Math.abs(rope.x[rope.pointCount - 1] - 500) < 1e-9, 'no initial swing');
    rope.push(1);
    assert.ok(timeToSleep(rope) < 3);
});

test('beginDrag can take an explicit slot (the actor that was pressed)', () => {
    const rope = hanging({charmCount: 3});
    assert.equal(rope.beginDrag(0, 0, 1), 1);
    assert.equal(rope.dragSlot, 1);
    rope.endDrag();
    assert.equal(rope.beginDrag(0, 0, 7), -1);
    assert.equal(rope.isDragging, false);
});

test('cordEnd reports the segment it lies on', () => {
    const rope = hanging();
    const end = rope.cordEnd();
    const j = end.segment;
    assert.ok(j >= 1 && j <= rope.pointCount - 1);
    assert.ok(rope.y[j - 1] <= end.y + 1e-9 && end.y <= rope.y[j] + 1e-9);
});

test('dragging straight down stretches the rope, and it springs back on release', () => {
    const rope = hanging();
    const end = rope.pointCount - 1;
    const restDrop = rope.y[end] - 32;
    rope.beginDrag(rope.x[end], rope.y[end]);
    for (let f = 0; f < 90; f++) {
        rope.updateDrag(500, 32 + 140 * 1.45, 0, 0);
        rope.step(1 / 60);
    }
    const heldDrop = rope.y[end] - 32;
    assert.ok(heldDrop > 140 * 1.35, `pulled down to ${heldDrop.toFixed(1)} px (rope 140 px)`);
    assert.ok(rope.elastic > 1.35, `elastic ${rope.elastic}`);
    assert.ok(Math.abs(rope.x[end] - 500) < 2, 'straight down, not sideways');

    rope.endDrag();
    let highest = Infinity;
    for (let f = 0; f < 30; f++) {
        rope.step(1 / 60);
        highest = Math.min(highest, rope.y[end] - 32);
    }
    assert.ok(highest < restDrop, `recoils up past its rest length (to ${highest.toFixed(1)} px): a bounce`);
    const secs = timeToSleep(rope);
    assert.ok(secs <= SETTLE_LIMIT, `back at rest in ${secs.toFixed(2)} s`);
    assert.equal(rope.elastic, 1);
    const drop = rope.y[end] - 32;
    assert.ok(Math.abs(drop - restDrop) < 2, `home again: ${drop.toFixed(1)} vs ${restDrop.toFixed(1)} px`);
});

test('a rope that is still recoiling does not fall asleep', () => {
    const rope = hanging();
    const end = rope.pointCount - 1;
    rope.beginDrag(rope.x[end], rope.y[end]);
    for (let f = 0; f < 30; f++) {
        rope.updateDrag(500, 300, 0, 0);
        rope.step(1 / 60);
    }
    rope.endDrag();
    rope.step(1 / 60);
    assert.equal(rope.isSleeping, false);
    assert.notEqual(rope.elastic, 1);
});
