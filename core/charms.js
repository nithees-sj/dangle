// The charm catalogue and charm ids.
//
// A charm id is either `builtin:<name>` (an SVG shipped in extension/charms/)
// or `custom:<file>` (a PNG the user imported into ~/.local/share/dangle/charms/).

export const BUILTIN_CHARMS = Object.freeze([
    {id: 'builtin:evil-eye', name: 'Evil Eye'},
    {id: 'builtin:shield', name: 'Compass Shield'},
    {id: 'builtin:temple-bell', name: 'Temple Bell'},
    {id: 'builtin:lotus', name: 'Lotus'},
    {id: 'builtin:kolam', name: 'Kolam'},
    {id: 'builtin:diya', name: 'Diya'},
    {id: 'builtin:jasmine', name: 'Jasmine'},
    {id: 'builtin:star', name: 'Star'},
    {id: 'builtin:crescent', name: 'Crescent Moon'},
    {id: 'builtin:pumpkin', name: 'Pumpkin'},
    {id: 'builtin:ghost', name: 'Ghost'},
    {id: 'builtin:snowflake', name: 'Snowflake'},
].map(Object.freeze));

export const DEFAULT_CHARM = 'builtin:star';

const BUILTIN_IDS = new Set(BUILTIN_CHARMS.map(c => c.id));

/** Imported charm files: a safe basename, always PNG. */
const CUSTOM_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.png$/;

/** Splits an id into {kind: 'builtin'|'custom', name}, or null if malformed. */
export function parseCharmId(id) {
    if (typeof id !== 'string')
        return null;
    const colon = id.indexOf(':');
    if (colon < 0)
        return null;
    const kind = id.slice(0, colon), name = id.slice(colon + 1);
    if (kind === 'builtin' && BUILTIN_IDS.has(id))
        return {kind, name};
    if (kind === 'custom' && CUSTOM_FILE.test(name) && !name.includes('..'))
        return {kind, name};
    return null;
}

export const isCharmId = id => parseCharmId(id) !== null;

export const isCustomFileName = name => CUSTOM_FILE.test(name) && !name.includes('..');

/** Human-readable name for any charm id. */
export function charmName(id) {
    const builtin = BUILTIN_CHARMS.find(c => c.id === id);
    if (builtin)
        return builtin.name;
    const parsed = parseCharmId(id);
    if (parsed?.kind === 'custom') {
        // "my-cat-lq3x9a.png" → "my cat"
        return parsed.name.replace(/\.png$/, '').replace(/-[a-z0-9]{6,}$/, '').replace(/[-_.]+/g, ' ').trim() || 'Custom';
    }
    return 'Charm';
}

/**
 * Turns an arbitrary source filename into a safe custom-charm file name.
 * `stamp` keeps names unique (e.g. Date.now().toString(36)).
 */
export function customFileNameFor(sourceName, stamp) {
    const base = String(sourceName)
        .replace(/\.[^.]*$/, '')
        .normalize('NFKD')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 40) || 'charm';
    const safeStamp = String(stamp).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 16) || '0';
    return `${base}-${safeStamp}.png`;
}
