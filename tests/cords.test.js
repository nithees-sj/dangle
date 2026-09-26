import {test} from 'node:test';
import assert from 'node:assert/strict';

import * as C from '../core/cords.js';

const two = () => [[0.3, 120, 'silver-cord', ['builtin:star']], [0.37, 165, 'spider-thread', ['builtin:crescent']]];

test('normalizing repairs every field', () => {
    assert.deepEqual(C.normalizeCord([-1, 9999, 'rope?', ['nope', 'builtin:star', 'builtin:lotus', 'builtin:ghost', 'builtin:diya']]),
                     [C.MIN_POSITION, C.MAX_LENGTH, 'spider-thread', ['builtin:star', 'builtin:lotus', 'builtin:ghost']]);
    assert.deepEqual(C.normalizeCord([0.5, 10, 'neon', []]), [0.5, C.MIN_LENGTH, 'neon', ['builtin:star']]);
    assert.deepEqual(C.normalizeCord(null), [0.5, C.DEFAULT_LENGTH, 'spider-thread', ['builtin:star']]);
    assert.equal(C.DEFAULT_LENGTH, 220, '20 segments of 11 points');
});

test('at most five cords', () => {
    const many = Array.from({length: 8}, (_, i) => [i / 10, 100, 'thread', ['builtin:star']]);
    assert.equal(C.normalizeCords(many).length, C.MAX_CORDS);
    assert.deepEqual(C.normalizeCords('nonsense'), []);
});

test('add cord goes into the widest gap, up to five', () => {
    let cords = two();
    cords = C.addCord(cords);
    assert.equal(cords.length, 3);
    const pos = cords[2][0];
    assert.ok(pos > 0.5, `new cord at ${pos}`);
    assert.equal(cords[2][2], 'spider-thread', 'inherits the last style');
    cords = C.addCord(C.addCord(cords));
    assert.equal(cords.length, 5);
    assert.equal(C.addCord(cords).length, 5);
    const positions = cords.map(c => c[0]).sort();
    for (let i = 1; i < positions.length; i++)
        assert.ok(positions[i] - positions[i - 1] > 0.05, 'spread out');
});

test('remove cord keeps at least one', () => {
    assert.equal(C.removeCord(two()).length, 1);
    assert.equal(C.removeCord(C.removeCord(two())).length, 1);
});

test('common style and set-all', () => {
    assert.equal(C.commonStyle(two()), null);
    const gold = C.setAllStyles(two(), 'gold-chain');
    assert.equal(C.commonStyle(gold), 'gold-chain');
});

test('charm count, order and assignment', () => {
    let cords = C.setCharmCount(two(), 0, 3);
    assert.deepEqual(cords[0][3], ['builtin:star', 'builtin:star', 'builtin:star']);
    cords = C.assignCharm(cords, 0, 1, 'builtin:lotus');
    cords = C.moveCharm(cords, 0, 1, 0);
    assert.deepEqual(cords[0][3], ['builtin:lotus', 'builtin:star', 'builtin:star']);
    cords = C.setCharmCount(cords, 0, 1);
    assert.deepEqual(cords[0][3], ['builtin:lotus']);
    cords = C.assignCharm(cords, 0, 5, 'builtin:ghost');
    assert.deepEqual(cords[0][3], ['builtin:lotus', 'builtin:ghost']);
    assert.deepEqual(C.assignCharm(cords, 0, 0, 'custom:../x.png'), cords, 'rejects bad ids');
});

test('replacing a deleted custom charm', () => {
    const cords = [[0.5, 100, 'thread', ['custom:cat-abc123.png', 'builtin:star']]];
    assert.deepEqual(C.replaceCharm(cords, 'custom:cat-abc123.png')[0][3], ['builtin:star', 'builtin:star']);
});
