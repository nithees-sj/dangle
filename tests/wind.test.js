import {test} from 'node:test';
import assert from 'node:assert/strict';

import {Breeze, GUST_MIN_DELAY, GUST_MAX_DELAY, MAX_GUST_ACCEL} from '../core/wind.js';
import {mulberry32} from './helpers.js';

test('gusts come every 45–120 s', () => {
    assert.equal(GUST_MIN_DELAY, 45);
    assert.equal(GUST_MAX_DELAY, 120);
    const breeze = new Breeze(mulberry32(1));
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 5000; i++) {
        const d = breeze.nextDelay();
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
    }
    assert.ok(lo >= 45 && hi <= 120, `${lo}..${hi}`);
    assert.ok(lo < 50 && hi > 115, 'uses the whole range');
});

test('no force outside a gust', () => {
    const breeze = new Breeze(mulberry32(2));
    assert.equal(breeze.active, false);
    for (let c = 0; c < 5; c++)
        assert.equal(breeze.forceX(c), 0);
});

test('a gust rises, stays bounded, and ends by itself', () => {
    const breeze = new Breeze(mulberry32(3));
    breeze.start(1);
    assert.equal(breeze.active, true);
    let peak = 0, frames = 0;
    while (breeze.active && frames < 10000) {
        breeze.advance(1 / 60);
        for (let c = 0; c < 5; c++) {
            const f = breeze.forceX(c);
            assert.ok(Number.isFinite(f));
            peak = Math.max(peak, Math.abs(f));
        }
        frames++;
    }
    assert.equal(breeze.active, false, 'gust ends');
    assert.ok(frames / 60 >= 1.5 && frames / 60 <= 5, `lasted ${frames / 60}s`);
    assert.ok(peak > 0, 'moves something');
    assert.ok(peak <= MAX_GUST_ACCEL * 1.25 + 1e-9, 'bounded');
    for (let c = 0; c < 5; c++)
        assert.equal(breeze.forceX(c), 0);
});

test('strength scales the gust and zero strength is calm', () => {
    const peakFor = strength => {
        const breeze = new Breeze(mulberry32(4));
        breeze.start(strength);
        let peak = 0;
        while (breeze.active) {
            breeze.advance(1 / 120);
            peak = Math.max(peak, Math.abs(breeze.forceX(0)));
        }
        return peak;
    };
    assert.equal(peakFor(0), 0);
    assert.ok(Math.abs(peakFor(1) - 2 * peakFor(0.5)) < 1e-9);
});

test('neighbouring cords sway out of step', () => {
    const breeze = new Breeze(mulberry32(5));
    breeze.start(1);
    breeze.advance(0.6);
    assert.notEqual(breeze.forceX(0), breeze.forceX(3));
});

test('stop() ends a gust immediately', () => {
    const breeze = new Breeze(mulberry32(6));
    breeze.start(1);
    breeze.advance(0.5);
    breeze.stop();
    assert.equal(breeze.active, false);
    assert.equal(breeze.forceX(0), 0);
});
