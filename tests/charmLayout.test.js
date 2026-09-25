import {test} from 'node:test';
import assert from 'node:assert/strict';

import {attachments, charmScale, resolve, MAX_CHARMS, CHARM_CLEARANCE, CHARM_MASS} from '../core/charmLayout.js';

test('attachment nodes for 1, 2 and 3 charms', () => {
    assert.deepEqual(attachments(1, 20), [20]);
    assert.deepEqual(attachments(2, 20), [10, 20]);
    assert.deepEqual(attachments(3, 20), [6, 13, 20]);
});

test('charm count is clamped to 1..3', () => {
    assert.equal(MAX_CHARMS, 3);
    assert.deepEqual(attachments(0, 20), [20]);
    assert.deepEqual(attachments(7, 20), [6, 13, 20]);
});

test('attachments stay one node apart on a short chain', () => {
    assert.deepEqual(attachments(3, 3), [1, 2, 3]);
});

test('stacked charms shrink', () => {
    assert.equal(charmScale(1), 1);
    assert.equal(charmScale(2), 0.92);
    assert.equal(charmScale(3), 0.82);
});

test('offsets along a 140 px rope match the expected positions', () => {
    const offsets = n => resolve({count: n, charmSize: 44, segmentLength: 7, segmentCount: 20})
        .map(s => s.node * 7);
    assert.deepEqual(offsets(1), [140]);
    assert.deepEqual(offsets(2), [70, 140]);
    assert.deepEqual(offsets(3), [42, 91, 140]);
});

test('radii follow the requested size and stack scale when there is room', () => {
    const one = resolve({count: 1, charmSize: 44, segmentLength: 7, segmentCount: 20});
    assert.equal(one[0].radius, 22);
    const two = resolve({count: 2, charmSize: 44, segmentLength: 7, segmentCount: 20});
    assert.ok(Math.abs(two[1].radius - 22 * 0.92) < 1e-9);
});

test('radii never crowd the rope between neighbours', () => {
    for (const count of [1, 2, 3]) {
        for (const length of [40, 60, 140, 300]) {
            for (const size of [24, 44, 96]) {
                const seg = length / 20;
                const slots = resolve({count, charmSize: size, segmentLength: seg, segmentCount: 20});
                assert.equal(slots.length, count);
                let prevNode = 0;
                slots.forEach((s, i) => {
                    const above = (s.node - prevNode) * seg;
                    assert.ok(s.radius > 0, 'positive radius');
                    assert.ok(s.radius <= CHARM_CLEARANCE * above + 1e-9, `fits above (${count}/${length}/${size})`);
                    if (i < count - 1) {
                        const below = (slots[i + 1].node - s.node) * seg;
                        assert.ok(s.radius <= CHARM_CLEARANCE * below + 1e-9, 'fits below');
                        assert.ok(s.radius + slots[i + 1].radius <= 0.9 * below + 1e-9, 'neighbours clear');
                    }
                    prevNode = s.node;
                });
            }
        }
    }
});

test('masses scale with the rope style', () => {
    const slots = resolve({count: 2, charmSize: 44, segmentLength: 7, segmentCount: 20, massScale: 1.4});
    for (const s of slots)
        assert.ok(Math.abs(s.mass - CHARM_MASS * 1.4) < 1e-12);
});
