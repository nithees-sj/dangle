import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

const metadata = JSON.parse(read('extension/metadata.json'));
const schema = read('extension/schemas/org.gnome.shell.extensions.dangle.gschema.xml');

test('metadata targets GNOME Shell 50 in the user session only', () => {
    assert.equal(metadata.uuid, 'dangle@nithees');
    assert.equal(metadata.name, 'Dangle');
    assert.deepEqual(metadata['shell-version'], ['50']);
    assert.deepEqual(metadata['session-modes'], ['user']);
});

test('metadata never mentions the reference project', () => {
    assert.doesNotMatch(JSON.stringify(metadata), /hangly/i);
});

test('settings schema id and path match metadata', () => {
    const id = metadata['settings-schema'];
    assert.match(schema, new RegExp(`<schema id="${id.replaceAll('.', '\\.')}"`));
    assert.match(schema, /path="\/org\/gnome\/shell\/extensions\/dangle\/"/);
});

test('schema defaults: Minimal preset with two cords, grab needs Super', () => {
    const def = key => schema.match(
        new RegExp(`<key name="${key}"[\\s\\S]*?<default>([\\s\\S]*?)</default>`))[1];
    assert.equal(def('preset'), "'minimal'");
    assert.equal(def('cords').match(/\(/g).length, 2);
    assert.equal(def('grab-modifier'), "'super'");
    assert.equal(def('grab-without-super'), 'false');
    assert.equal(def('breeze-on-battery'), 'false');
});
