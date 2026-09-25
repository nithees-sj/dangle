import {test} from 'node:test';
import assert from 'node:assert/strict';

import {DEFAULTS, STYLES, STYLE_IDS, DEFAULT_STYLE, physicsOf, appearanceOf, styleName} from '../core/ropeStyles.js';

const TEXTURES = ['smooth', 'twist', 'braid', 'links', 'web'];

test('there are nine styles with unique ids and names', () => {
    assert.equal(STYLES.length, 9);
    assert.equal(new Set(STYLE_IDS).size, 9);
    assert.equal(new Set(STYLES.map(s => s.name)).size, 9);
    assert.deepEqual(STYLE_IDS, [
        'thread', 'leather', 'gold-chain', 'silver-chain', 'neon',
        'spider-thread', 'midnight-cord', 'temple-thread', 'silver-cord',
    ]);
});

test('thread is exactly the default solver', () => {
    const p = physicsOf('thread');
    assert.equal(p.gravityScale, 1);
    assert.equal(p.damping, DEFAULTS.damping);
    assert.equal(p.maxStretch, DEFAULTS.maxStretch);
    assert.equal(p.charmMassScale, 1);
    assert.equal(DEFAULT_STYLE, 'thread');
});

test('unknown ids fall back to thread', () => {
    assert.equal(physicsOf('no-such-rope'), physicsOf('thread'));
    assert.equal(appearanceOf(undefined), appearanceOf('thread'));
    assert.equal(styleName('nope'), 'Thread');
});

test('solver defaults are sane', () => {
    assert.equal(DEFAULTS.segmentCount, 20);
    assert.equal(DEFAULTS.fixedStep, 1 / 240);
    assert.equal(DEFAULTS.maxFrame, 0.05);
    assert.ok(DEFAULTS.iterations <= 48 && DEFAULTS.stretchPasses <= 48);
});

for (const style of STYLES) {
    test(`${style.id}: physics values within sane bounds`, () => {
        const p = style.physics;
        assert.ok(p.gravityScale >= 0.5 && p.gravityScale <= 1.5, 'gravityScale');
        assert.ok(p.damping >= 0.99 && p.damping < 1, 'damping');
        assert.ok(p.maxStretch >= 1 && p.maxStretch <= 1.02, 'maxStretch');
        assert.ok(Number.isInteger(p.iterations) && p.iterations >= 8 && p.iterations <= 48, 'iterations');
        assert.ok(Number.isInteger(p.stretchPasses) && p.stretchPasses >= 8 && p.stretchPasses <= 48, 'stretchPasses');
        assert.ok(p.charmMassScale >= 0.5 && p.charmMassScale <= 2, 'charmMassScale');
    });

    test(`${style.id}: appearance values within sane bounds`, () => {
        const a = style.appearance;
        for (const key of ['base', 'shade', 'deep', 'light']) {
            const c = a.palette[key];
            assert.equal(c.length, 3, key);
            assert.ok(c.every(v => v >= 0 && v <= 1), `${key} in 0..1`);
        }
        assert.ok(a.widthScale > 0 && a.widthScale < 0.2, 'widthScale');
        assert.ok(a.minWidth > 0 && a.minWidth < 4, 'minWidth');
        assert.ok(TEXTURES.includes(a.texture.kind), 'texture kind');
        assert.ok(a.texture.pitch >= 0 && a.texture.offset >= 0, 'texture numbers');
        assert.ok(a.glow >= 0 && a.glow <= 1, 'glow');
    });
}
