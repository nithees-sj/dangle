import {test} from 'node:test';
import assert from 'node:assert/strict';

import * as V from '../core/vec2.js';

const close = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('basic arithmetic', () => {
    assert.deepEqual(V.add(V.vec(1, 2), V.vec(3, 4)), {x: 4, y: 6});
    assert.deepEqual(V.sub(V.vec(1, 2), V.vec(3, 5)), {x: -2, y: -3});
    assert.deepEqual(V.scale(V.vec(1, -2), 3), {x: 3, y: -6});
    close(V.length(V.vec(3, 4)), 5);
    close(V.distance(V.vec(1, 1), V.vec(4, 5)), 5);
});

test('limit clamps magnitude and keeps direction', () => {
    const v = V.limit(V.vec(30, 40), 5);
    close(v.x, 3);
    close(v.y, 4);
    assert.deepEqual(V.limit(V.vec(1, 1), 5), {x: 1, y: 1});
    assert.deepEqual(V.limit(V.vec(0, 0), 5), {x: 0, y: 0});
});

test('rotate turns clockwise on a y-down screen', () => {
    const v = V.rotate(V.vec(1, 0), Math.PI / 2);
    close(v.x, 0);
    close(v.y, 1);
});

test('lerp and normalize', () => {
    assert.deepEqual(V.lerp(V.vec(0, 0), V.vec(10, 20), 0.5), {x: 5, y: 10});
    const n = V.normalize(V.vec(0, 7));
    close(n.x, 0);
    close(n.y, 1);
    assert.deepEqual(V.normalize(V.vec(0, 0)), {x: 0, y: 0});
});
