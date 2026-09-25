// Main-thread budget: the solver runs inside GNOME Shell's compositor thread,
// so the worst realistic load (5 cords × 3 charms, all moving) must stay cheap.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';

import {Rope} from '../core/rope.js';
import {STYLE_IDS} from '../core/ropeStyles.js';
import {Breeze} from '../core/wind.js';
import {mulberry32} from './helpers.js';

const FRAMES = 600;
const WARMUP = 60;
const BUDGET_MS = 1.0;

test(`5 cords × 3 charms average ≤ ${BUDGET_MS} ms of physics per 60 Hz frame`, t => {
    const rng = mulberry32(2024);
    const ropes = [];
    for (let c = 0; c < 5; c++) {
        ropes.push(new Rope({
            anchorX: 300 + c * 250,
            anchorY: 32,
            length: 140 + c * 30,
            style: STYLE_IDS[(c * 2) % STYLE_IDS.length],
            charmCount: 3,
            charmSize: 44,
        }));
    }
    const breeze = new Breeze(rng);
    const dt = 1 / 60;
    let total = 0;
    let worst = 0;

    for (let f = 0; f < FRAMES + WARMUP; f++) {
        // Keep everything awake: a constant gust, pushes, and a drag on cord 0.
        if (!breeze.active)
            breeze.start(1);
        // Worst case: every cord shaken at once ("Shake them"), repeatedly.
        if (f % 45 === 0)
            ropes.forEach((rope, c) => rope.push((c + f / 45) % 2 ? 1 : -1));
        if (f % 120 === 10) {
            const s = ropes[0].slots[2];
            ropes[0].beginDrag(ropes[0].x[s.node], ropes[0].y[s.node]);
        }
        if (f % 120 === 90)
            ropes[0].endDrag();

        const start = performance.now();
        breeze.advance(dt);
        for (let c = 0; c < ropes.length; c++) {
            const rope = ropes[c];
            if (rope.isDragging)
                rope.updateDrag(300 + Math.sin(f / 9) * 180, 150 + Math.cos(f / 7) * 90, 0, 0);
            rope.setWind(breeze.forceX(c), 0);
            rope.step(dt);
        }
        const elapsed = performance.now() - start;
        if (f >= WARMUP) {
            total += elapsed;
            worst = Math.max(worst, elapsed);
        }
    }

    for (const rope of ropes)
        assert.equal(rope.isSleeping, false, 'ropes stayed awake for the whole run');
    const average = total / FRAMES;
    t.diagnostic(`average ${average.toFixed(3)} ms/frame, worst ${worst.toFixed(3)} ms`);
    assert.ok(average <= BUDGET_MS, `average ${average.toFixed(3)} ms/frame`);
});
