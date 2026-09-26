import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULTS, STYLES, STYLE_IDS, DEFAULT_STYLE, TIME_PROFILES,
    physicsOf, appearanceOf, styleName, styleDescription, timeProfileAt, resolvedPhysics,
} from '../core/ropeStyles.js';

// The reference values, verbatim.
const PHYSICS = {
    Thread: {gravityScale: 1.00, damping: 0.9990, maxStretch: 1.020, iterations: 256, stretchPasses: 256, charmMassScale: 1.00},
    Leather: {gravityScale: 1.08, damping: 0.9955, maxStretch: 1.006, iterations: 288, stretchPasses: 288, charmMassScale: 1.05},
    GoldChain: {gravityScale: 0.72, damping: 0.9992, maxStretch: 1.004, iterations: 320, stretchPasses: 320, charmMassScale: 1.40},
    SilverChain: {gravityScale: 0.84, damping: 0.9988, maxStretch: 1.005, iterations: 320, stretchPasses: 320, charmMassScale: 1.25},
    Neon: {gravityScale: 1.22, damping: 0.9997, maxStretch: 1.030, iterations: 224, stretchPasses: 224, charmMassScale: 0.78},
    SpiderThread: {gravityScale: 1.16, damping: 0.9996, maxStretch: 1.004, iterations: 336, stretchPasses: 336, charmMassScale: 0.80},
    MidnightCord: {gravityScale: 0.78, damping: 0.9986, maxStretch: 1.007, iterations: 304, stretchPasses: 304, charmMassScale: 1.32},
    TempleThread: {gravityScale: 1.04, damping: 0.9982, maxStretch: 1.026, iterations: 232, stretchPasses: 232, charmMassScale: 0.92},
    SilverCord: {gravityScale: 0.94, damping: 0.9990, maxStretch: 1.009, iterations: 272, stretchPasses: 272, charmMassScale: 1.08},
};

const PALETTES = {
    Thread: [[0.47, 0.34, 0.11], [0.31, 0.22, 0.06], [0.16, 0.11, 0.03], [0.78, 0.62, 0.30]],
    Leather: [[0.36, 0.22, 0.13], [0.25, 0.15, 0.08], [0.11, 0.06, 0.03], [0.63, 0.45, 0.30]],
    GoldChain: [[0.72, 0.55, 0.19], [0.50, 0.36, 0.10], [0.24, 0.16, 0.04], [0.97, 0.86, 0.53]],
    SilverChain: [[0.69, 0.72, 0.77], [0.47, 0.50, 0.55], [0.21, 0.23, 0.27], [0.97, 0.98, 1.00]],
    Neon: [[0.29, 0.92, 1.00], [0.16, 0.60, 0.95], [0.05, 0.16, 0.40], [0.88, 1.00, 1.00]],
    SpiderThread: [[0.94, 0.95, 0.97], [0.74, 0.77, 0.82], [0.33, 0.36, 0.42], [1.00, 1.00, 1.00]],
    MidnightCord: [[0.16, 0.18, 0.29], [0.09, 0.10, 0.18], [0.03, 0.03, 0.07], [0.42, 0.46, 0.62]],
    TempleThread: [[0.87, 0.51, 0.09], [0.66, 0.20, 0.07], [0.29, 0.07, 0.03], [1.00, 0.82, 0.38]],
    SilverCord: [[0.80, 0.83, 0.88], [0.58, 0.62, 0.69], [0.26, 0.28, 0.33], [1.00, 1.00, 1.00]],
};

const APPEARANCES = {
    Thread: {widthScale: 0.046, minWidth: 1.5, texture: {kind: 'twist', pitch: 1.50, offset: 0.20}, glowStrength: 0, beadTint: null},
    Leather: {widthScale: 0.058, minWidth: 1.7, texture: {kind: 'braid', pitch: 2.30, offset: 0.26}, glowStrength: 0, beadTint: 'Leather'},
    GoldChain: {widthScale: 0.088, minWidth: 2.2, texture: {kind: 'links', pitch: 2.05, thickness: 0.62}, glowStrength: 0, beadTint: null},
    SilverChain: {widthScale: 0.082, minWidth: 2.1, texture: {kind: 'links', pitch: 1.95, thickness: 0.60}, glowStrength: 0, beadTint: 'SilverChain'},
    Neon: {widthScale: 0.040, minWidth: 1.4, texture: {kind: 'smooth'}, glowStrength: 1.0, beadTint: 'Neon'},
    SpiderThread: {widthScale: 0.038, minWidth: 1.55, texture: {kind: 'web', pitch: 1.55, offset: 0.28}, glowStrength: 0.26, beadTint: 'SpiderThread'},
    MidnightCord: {widthScale: 0.068, minWidth: 1.9, texture: {kind: 'braid', pitch: 2.10, offset: 0.24}, glowStrength: 0, beadTint: 'MidnightCord'},
    TempleThread: {widthScale: 0.052, minWidth: 1.6, texture: {kind: 'twist', pitch: 1.15, offset: 0.26}, glowStrength: 0, beadTint: 'TempleThread'},
    SilverCord: {widthScale: 0.054, minWidth: 1.7, texture: {kind: 'twist', pitch: 1.35, offset: 0.22}, glowStrength: 0, beadTint: 'SilverCord'},
};

const NAMES = {
    Thread: 'Thread', Leather: 'Leather', GoldChain: 'Gold Chain', SilverChain: 'Silver Chain', Neon: 'Neon',
    SpiderThread: 'Spider Thread', MidnightCord: 'Midnight Cord', TempleThread: 'Temple Thread', SilverCord: 'Silver Cord',
};

const idOf = enumName => STYLES.find(s => s.enumName === enumName)?.id;

test('nine styles in reference order, with their display names', () => {
    assert.deepEqual(STYLES.map(s => s.enumName), Object.keys(NAMES));
    assert.deepEqual(STYLES.map(s => s.name), Object.values(NAMES));
    assert.equal(new Set(STYLE_IDS).size, 9);
});

test('new installs hang on Spider Thread; unknown ids fall back to it', () => {
    assert.equal(DEFAULT_STYLE, 'spider-thread');
    assert.equal(physicsOf('no-such-rope'), physicsOf('spider-thread'));
    assert.equal(appearanceOf(undefined), appearanceOf('spider-thread'));
    assert.equal(styleName('nope'), 'Spider Thread');
});

test('base solver configuration is the reference one', () => {
    assert.equal(DEFAULTS.segmentCount, 20);
    assert.equal(DEFAULTS.segmentLength, 11);
    assert.equal(DEFAULTS.gravity, 2000);
    assert.equal(DEFAULTS.damping, 0.999);
    assert.equal(DEFAULTS.fixedStep, 1 / 240);
    assert.equal(DEFAULTS.maxFrame, 0.1);
    assert.equal(DEFAULTS.maxSpeed, 6000);
    assert.equal(DEFAULTS.reachRatio, 0.98);
    assert.equal(DEFAULTS.restSpeed, 4.0);
    assert.equal(DEFAULTS.framesBeforeSleep, 60);
    assert.equal(DEFAULTS.initialAngle, 0.38);
    assert.equal(DEFAULTS.tolerance, 0.05);
});

for (const enumName of Object.keys(PHYSICS)) {
    test(`${enumName}: physics, palette and appearance are exactly the reference values`, () => {
        const id = idOf(enumName);
        assert.ok(id, 'style exists');
        assert.deepEqual({...physicsOf(id)}, PHYSICS[enumName]);
        const {palette, ...appearance} = appearanceOf(id);
        assert.deepEqual([palette.primary, palette.secondary, palette.deep, palette.light].map(c => [...c]), PALETTES[enumName]);
        assert.deepEqual({...appearance, texture: {...appearance.texture}}, APPEARANCES[enumName]);
        assert.ok(styleDescription(id).length > 10);
        assert.doesNotMatch(styleDescription(id), /hangly/i, 'no reference branding in the UI');
    });
}

test('gravityScale multiplies the base gravity (Gold Chain = 1440)', () => {
    assert.ok(Math.abs(resolvedPhysics('gold-chain').gravity - 1440) < 1e-9);
});

test('time-of-day profiles and hours', () => {
    assert.deepEqual({...TIME_PROFILES.morning}, {energyLossScale: 0.80, releaseAngleScale: 1.14, restSpeedScale: 0.94});
    assert.deepEqual({...TIME_PROFILES.afternoon}, {energyLossScale: 1.00, releaseAngleScale: 1.00, restSpeedScale: 1.00});
    assert.deepEqual({...TIME_PROFILES.night}, {energyLossScale: 1.30, releaseAngleScale: 0.88, restSpeedScale: 1.10});
    const at = h => timeProfileAt(h);
    assert.deepEqual([4, 5, 11, 12, 17, 18, 23, 0].map(at),
                     ['night', 'morning', 'morning', 'afternoon', 'afternoon', 'night', 'night', 'night']);
});

test('energyLossScale scales (1 − damping): Thread in the morning is 0.9992', () => {
    assert.ok(Math.abs(resolvedPhysics('thread', 'morning').damping - 0.9992) < 1e-12);
    assert.ok(Math.abs(resolvedPhysics('thread', 'night').damping - (1 - 0.001 * 1.3)) < 1e-12);
    assert.equal(resolvedPhysics('thread', 'afternoon').damping, 0.999);
    assert.ok(Math.abs(resolvedPhysics('thread', 'morning').initialAngle - 0.38 * 1.14) < 1e-12);
    assert.ok(Math.abs(resolvedPhysics('thread', 'night').restSpeed - 4.4) < 1e-12);
});

test('every style looks distinct: no two share palette and texture', () => {
    const looks = STYLES.map(s => JSON.stringify([s.appearance.palette, s.appearance.texture, s.appearance.glowStrength]));
    assert.equal(new Set(looks).size, 9);
});
