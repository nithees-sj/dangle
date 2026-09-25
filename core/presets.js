// Ready-made cord layouts. "custom" is whatever the user last arranged.

export const PRESETS = Object.freeze({
    festive: Object.freeze({
        name: 'Festive',
        cords: [
            [0.14, 150, 'temple-thread', ['builtin:diya']],
            [0.22, 195, 'gold-chain', ['builtin:temple-bell', 'builtin:jasmine']],
            [0.30, 130, 'temple-thread', ['builtin:lotus']],
            [0.70, 180, 'gold-chain', ['builtin:kolam', 'builtin:star']],
            [0.78, 125, 'temple-thread', ['builtin:evil-eye']],
        ],
    }),
    temple: Object.freeze({
        name: 'Temple',
        cords: [
            [0.16, 175, 'temple-thread', ['builtin:vel']],
            [0.24, 150, 'gold-chain', ['builtin:temple-bell', 'builtin:diya']],
            [0.76, 180, 'midnight-cord', ['builtin:aruval']],
            [0.84, 140, 'temple-thread', ['builtin:lotus', 'builtin:jasmine']],
        ],
    }),
    minimal: Object.freeze({
        name: 'Minimal',
        cords: [
            [0.30, 120, 'silver-cord', ['builtin:star']],
            [0.37, 165, 'spider-thread', ['builtin:crescent']],
        ],
    }),
    spooky: Object.freeze({
        name: 'Spooky',
        cords: [
            [0.18, 170, 'midnight-cord', ['builtin:pumpkin']],
            [0.27, 205, 'spider-thread', ['builtin:ghost', 'builtin:ghost']],
            [0.73, 140, 'spider-thread', ['builtin:crescent']],
            [0.81, 190, 'midnight-cord', ['builtin:snowflake', 'builtin:pumpkin']],
        ],
    }),
});

export const PRESET_IDS = Object.freeze(['festive', 'temple', 'minimal', 'spooky', 'custom']);
export const DEFAULT_PRESET = 'minimal';

export function presetName(id) {
    return id === 'custom' ? 'Custom' : PRESETS[id]?.name ?? 'Custom';
}

/** A fresh, mutable copy of a preset's cords (null for "custom"). */
export function presetCords(id) {
    const preset = PRESETS[id];
    return preset ? preset.cords.map(([p, l, s, c]) => [p, l, s, [...c]]) : null;
}
