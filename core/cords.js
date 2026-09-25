// The cord list as stored in GSettings (`a(ddsas)`): pure helpers shared by
// the overlay, the Quick Settings menu and the preferences window.
//
// A cord is a 4-tuple [position 0–1, length px, style id, charm ids top-down].

import {DEFAULT_CHARM, isCharmId} from './charms.js';
import {STYLE_IDS, DEFAULT_STYLE} from './ropeStyles.js';
import {MAX_CHARMS} from './charmLayout.js';

export const MAX_CORDS = 5;
export const MIN_LENGTH = 40;
export const MAX_LENGTH = 320;
export const DEFAULT_LENGTH = 140;
export const MIN_POSITION = 0.02;
export const MAX_POSITION = 0.98;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Returns a clean copy of one cord, repairing anything out of range. */
export function normalizeCord(cord) {
    const [position, length, style, charms] = Array.isArray(cord) ? cord : [];
    let list = Array.isArray(charms) ? charms.filter(isCharmId).slice(0, MAX_CHARMS) : [];
    if (list.length === 0)
        list = [DEFAULT_CHARM];
    return [
        clamp(Number.isFinite(position) ? position : 0.5, MIN_POSITION, MAX_POSITION),
        clamp(Number.isFinite(length) ? length : DEFAULT_LENGTH, MIN_LENGTH, MAX_LENGTH),
        STYLE_IDS.includes(style) ? style : DEFAULT_STYLE,
        list,
    ];
}

/** Returns a clean copy of a cord list: at most five valid cords. */
export function normalizeCords(cords) {
    return (Array.isArray(cords) ? cords : []).slice(0, MAX_CORDS).map(normalizeCord);
}

export const cordsEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Where a new cord should hang: the middle of the widest free gap. */
export function freePosition(cords) {
    const taken = cords.map(c => c[0]).sort((a, b) => a - b);
    const edges = [0.06, ...taken, 0.94];
    let best = 0.5, widest = -1;
    for (let i = 0; i < edges.length - 1; i++) {
        const gap = edges[i + 1] - edges[i];
        if (gap > widest) {
            widest = gap;
            best = (edges[i] + edges[i + 1]) / 2;
        }
    }
    return clamp(Math.round(best * 1000) / 1000, MIN_POSITION, MAX_POSITION);
}

/** Adds a cord in the widest free gap (no-op at MAX_CORDS). */
export function addCord(cords, charm = DEFAULT_CHARM) {
    const list = normalizeCords(cords);
    if (list.length >= MAX_CORDS)
        return list;
    const style = list.at(-1)?.[2] ?? DEFAULT_STYLE;
    list.push([freePosition(list), DEFAULT_LENGTH, style, [charm]]);
    return list;
}

/** Removes the last cord, keeping at least one. */
export function removeCord(cords) {
    const list = normalizeCords(cords);
    if (list.length > 1)
        list.pop();
    return list;
}

/** Hangs every cord on the same rope style. */
export function setAllStyles(cords, style) {
    return normalizeCords(cords).map(([p, l, , c]) => [p, l, style, c]);
}

/** The style every cord shares, or null when they differ. */
export function commonStyle(cords) {
    const styles = new Set(normalizeCords(cords).map(c => c[2]));
    return styles.size === 1 ? [...styles][0] : null;
}

/** Replaces every use of `charm` (e.g. a deleted custom charm). */
export function replaceCharm(cords, charm, replacement = DEFAULT_CHARM) {
    return normalizeCords(cords).map(([p, l, s, c]) => [p, l, s, c.map(id => (id === charm ? replacement : id))]);
}

/** Sets the number of charms on one cord (1–3), repeating the last to grow. */
export function setCharmCount(cords, index, count) {
    const list = normalizeCords(cords);
    const cord = list[index];
    if (!cord)
        return list;
    const n = clamp(Math.round(count), 1, MAX_CHARMS);
    const charms = cord[3].slice(0, n);
    while (charms.length < n)
        charms.push(charms.at(-1) ?? DEFAULT_CHARM);
    cord[3] = charms;
    return list;
}

/** Moves the charm at `from` to `to` on one cord. */
export function moveCharm(cords, index, from, to) {
    const list = normalizeCords(cords);
    const charms = list[index]?.[3];
    if (!charms || from === to || from < 0 || to < 0 || from >= charms.length || to >= charms.length)
        return list;
    const [moved] = charms.splice(from, 1);
    charms.splice(to, 0, moved);
    return list;
}

/** Puts `charm` in slot `slot` of cord `index` (appending if slot is past the end). */
export function assignCharm(cords, index, slot, charm) {
    const list = normalizeCords(cords);
    const charms = list[index]?.[3];
    if (!charms || !isCharmId(charm))
        return list;
    if (slot >= 0 && slot < charms.length)
        charms[slot] = charm;
    else if (charms.length < MAX_CHARMS)
        charms.push(charm);
    return list;
}
