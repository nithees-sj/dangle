import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {PRESETS, PRESET_IDS, DEFAULT_PRESET, presetName, presetCords} from '../core/presets.js';
import {normalizeCords, MAX_CORDS} from '../core/cords.js';
import {STYLE_IDS} from '../core/ropeStyles.js';
import {isCharmId} from '../core/charms.js';

test('preset ids match the schema choices', () => {
    assert.deepEqual(PRESET_IDS, ['festive', 'temple', 'minimal', 'spooky', 'custom']);
    const schema = readFileSync(new URL('../extension/schemas/org.gnome.shell.extensions.dangle.gschema.xml', import.meta.url), 'utf8');
    const choices = [...schema.match(/<key name="preset"[\s\S]*?<\/key>/)[0].matchAll(/<choice value="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(choices, PRESET_IDS);
    assert.equal(DEFAULT_PRESET, 'minimal');
    assert.equal(presetName('custom'), 'Custom');
    assert.equal(presetCords('custom'), null);
});

for (const [id, preset] of Object.entries(PRESETS)) {
    test(`${id}: valid, already normal, 1–5 cords with 1–3 charms`, () => {
        assert.equal(presetName(id), preset.name);
        const cords = presetCords(id);
        assert.ok(cords.length >= 1 && cords.length <= MAX_CORDS);
        for (const [pos, len, style, charms] of cords) {
            assert.ok(pos > 0 && pos < 1);
            assert.ok(len >= 40 && len <= 320);
            assert.ok(STYLE_IDS.includes(style), style);
            assert.ok(charms.length >= 1 && charms.length <= 3);
            assert.ok(charms.every(isCharmId));
        }
        assert.deepEqual(normalizeCords(cords), cords, 'normalizing changes nothing');
    });
}

test('presetCords returns a copy', () => {
    const a = presetCords('minimal');
    a[0][3].push('builtin:ghost');
    assert.equal(presetCords('minimal')[0][3].length, 1);
});

test('the schema default cords are exactly the Minimal preset', () => {
    const schema = readFileSync(new URL('../extension/schemas/org.gnome.shell.extensions.dangle.gschema.xml', import.meta.url), 'utf8');
    for (const key of ['cords', 'custom-cords']) {
        const text = schema.match(new RegExp(`<key name="${key}"[\\s\\S]*?<default>([\\s\\S]*?)</default>`))[1];
        const parsed = JSON.parse(text.replaceAll('(', '[').replaceAll(')', ']').replaceAll("'", '"'));
        assert.deepEqual(parsed, presetCords('minimal'), key);
    }
});
