import {test} from 'node:test';
import assert from 'node:assert/strict';

import {BUILTIN_CHARMS, DEFAULT_CHARM, parseCharmId, isCharmId, charmName, customFileNameFor, isCustomFileName} from '../core/charms.js';

test('twelve built-in charms with unique ids', () => {
    assert.equal(BUILTIN_CHARMS.length, 12);
    assert.equal(new Set(BUILTIN_CHARMS.map(c => c.id)).size, 12);
    assert.ok(isCharmId(DEFAULT_CHARM));
});

test('ids parse into kind and name', () => {
    assert.deepEqual(parseCharmId('builtin:lotus'), {kind: 'builtin', name: 'lotus'});
    assert.deepEqual(parseCharmId('custom:cat-lq3x9a.png'), {kind: 'custom', name: 'cat-lq3x9a.png'});
});

test('malformed or unsafe ids are rejected', () => {
    for (const bad of [
        'lotus', 'builtin:nope', 'custom:../../etc/passwd', 'custom:a/b.png', 'custom:.hidden.png',
        'custom:cat.svg', 'custom:', 'other:x', null, 42, 'custom:..png',
    ])
        assert.equal(isCharmId(bad), false, String(bad));
});

test('display names', () => {
    assert.equal(charmName('builtin:evil-eye'), 'Evil Eye');
    assert.equal(charmName('custom:my-cat-lq3x9a.png'), 'my cat');
    assert.equal(charmName('garbage'), 'Charm');
});

test('imported file names are safe and unique', () => {
    const name = customFileNameFor('../My Cat (2).JPG', 'lq3x9a');
    assert.equal(name, 'my-cat-2-lq3x9a.png');
    assert.ok(isCustomFileName(name));
    assert.ok(isCharmId(`custom:${name}`));
    assert.equal(customFileNameFor('////', 'x1'), 'charm-x1.png');
    assert.ok(isCustomFileName(customFileNameFor('ಕಮಲ.svg', 'abc')));
});
