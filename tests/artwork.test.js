import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

import {BUILTIN_CHARMS} from '../core/charms.js';
import {PRESETS, presetCords} from '../core/presets.js';

const charmsDir = new URL('../extension/charms/', import.meta.url);
const read = name => readFileSync(new URL(`${name}.svg`, charmsDir), 'utf8');

for (const {id, name} of BUILTIN_CHARMS) {
    const file = id.replace('builtin:', '');
    test(`${name}: original 256×256 SVG with a hanging loop`, () => {
        const svg = read(file);
        assert.match(svg, /<svg[^>]*viewBox="0 0 256 256"/);
        assert.match(svg, /<circle cx="128" cy="16" r="9"/, 'loop at the top centre (where the rope ties on)');
        assert.match(svg, new RegExp(`<title>${name}</title>`));
        assert.doesNotMatch(svg, /<script|<image|xlink:href|href="http|<foreignObject/i, 'self-contained, no scripts or embedded images');
        assert.doesNotMatch(svg, /hangly/i);
    });
}

test('no stray files in charms/', () => {
    const expected = BUILTIN_CHARMS.map(c => `${c.id.replace('builtin:', '')}.svg`).sort();
    assert.deepEqual(readdirSync(charmsDir).sort(), expected);
});

test('every built-in charm used by a preset has artwork', () => {
    for (const id of Object.keys(PRESETS)) {
        for (const [, , , charms] of presetCords(id)) {
            for (const charm of charms)
                assert.ok(read(charm.replace('builtin:', '')).length > 0, charm);
        }
    }
});

test('the symbolic icon is a 16×16 SVG', () => {
    const icon = readFileSync(new URL('../extension/icons/dangle-symbolic.svg', import.meta.url), 'utf8');
    assert.match(icon, /viewBox="0 0 16 16"/);
});
