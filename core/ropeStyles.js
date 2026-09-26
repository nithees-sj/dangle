// The nine rope styles: each is a set of solver values plus how it is drawn.
//
// Physics profiles and palette values are ported from Hangly for Windows
// (MIT, see NOTICE.md). Iteration budgets are re-tuned for GNOME Shell's main
// thread (≤ 48 passes), and the two softest ropes' stretch ceilings are lowered
// so no style can exceed 1.02× its rest length.

/** Solver values shared by every style. Units: pixels and seconds, y down. */
export const DEFAULTS = Object.freeze({
    segmentCount: 20,
    gravity: 2000,
    damping: 0.999,
    iterations: 16,
    stretchPasses: 8,
    tolerance: 0.1,
    maxStretch: 1.02,
    fixedStep: 1 / 240,
    maxFrame: 0.05,
    maxSpeed: 6000,
    reachRatio: 0.98,
    sleepAfter: 0.25,
    initialAngle: 0.38,
});

const rgb = (r, g, b) => Object.freeze([r, g, b]);

// palette: base (body), shade (twist/under-strand), deep (outline), light (sheen)
const palette = (base, shade, deep, light) => Object.freeze({base, shade, deep, light});

const texture = (kind, pitch = 0, offset = 0) => Object.freeze({kind, pitch, offset});

function style(id, name, physics, appearance) {
    return Object.freeze({
        id,
        name,
        physics: Object.freeze(physics),
        appearance: Object.freeze(appearance),
    });
}

export const STYLES = Object.freeze([
    style('thread', 'Thread', {
        gravityScale: 1.0, damping: 0.999, maxStretch: 1.02,
        iterations: 16, stretchPasses: 8, charmMassScale: 1.0,
    }, {
        palette: palette(rgb(0.47, 0.34, 0.11), rgb(0.31, 0.22, 0.06), rgb(0.16, 0.11, 0.03), rgb(0.78, 0.62, 0.30)),
        widthScale: 0.046, minWidth: 1.5, texture: texture('twist', 1.5, 0.20), glow: 0,
    }),
    // Stiffer and quicker to settle; barely stretches.
    style('leather', 'Leather', {
        gravityScale: 1.08, damping: 0.9955, maxStretch: 1.006,
        iterations: 18, stretchPasses: 8, charmMassScale: 1.05,
    }, {
        palette: palette(rgb(0.36, 0.22, 0.13), rgb(0.25, 0.15, 0.08), rgb(0.11, 0.06, 0.03), rgb(0.63, 0.45, 0.30)),
        widthScale: 0.058, minWidth: 1.7, texture: texture('braid', 2.3, 0.26), glow: 0,
    }),
    // The heavy one: slow to start, slow to turn round.
    style('gold-chain', 'Gold Chain', {
        gravityScale: 0.72, damping: 0.9992, maxStretch: 1.004,
        iterations: 20, stretchPasses: 10, charmMassScale: 1.40,
    }, {
        palette: palette(rgb(0.72, 0.55, 0.19), rgb(0.50, 0.36, 0.10), rgb(0.24, 0.16, 0.04), rgb(0.97, 0.86, 0.53)),
        widthScale: 0.088, minWidth: 2.2, texture: texture('links', 2.05, 0.62), glow: 0,
    }),
    // A lighter-gauge chain with more life in it.
    style('silver-chain', 'Silver Chain', {
        gravityScale: 0.84, damping: 0.9988, maxStretch: 1.005,
        iterations: 20, stretchPasses: 10, charmMassScale: 1.25,
    }, {
        palette: palette(rgb(0.69, 0.72, 0.77), rgb(0.47, 0.50, 0.55), rgb(0.21, 0.23, 0.27), rgb(0.97, 0.98, 1.00)),
        widthScale: 0.082, minWidth: 2.1, texture: texture('links', 1.95, 0.60), glow: 0,
    }),
    // Barely there: quickest to react, the most give (capped at 1.018).
    style('neon', 'Neon', {
        gravityScale: 1.22, damping: 0.9997, maxStretch: 1.018,
        iterations: 12, stretchPasses: 8, charmMassScale: 0.78,
    }, {
        palette: palette(rgb(0.29, 0.92, 1.00), rgb(0.16, 0.60, 0.95), rgb(0.05, 0.16, 0.40), rgb(0.88, 1.00, 1.00)),
        widthScale: 0.040, minWidth: 1.4, texture: texture('smooth'), glow: 1.0,
    }),
    // Silk: very light and very strong.
    style('spider-thread', 'Spider Thread', {
        gravityScale: 1.16, damping: 0.9996, maxStretch: 1.004,
        iterations: 20, stretchPasses: 10, charmMassScale: 0.80,
    }, {
        palette: palette(rgb(0.94, 0.95, 0.97), rgb(0.74, 0.77, 0.82), rgb(0.33, 0.36, 0.42), rgb(1.00, 1.00, 1.00)),
        widthScale: 0.038, minWidth: 1.55, texture: texture('web', 1.55, 0.28), glow: 0.26,
    }),
    // A heavy dark braid that absorbs a swing.
    style('midnight-cord', 'Midnight Cord', {
        gravityScale: 0.78, damping: 0.9986, maxStretch: 1.007,
        iterations: 18, stretchPasses: 8, charmMassScale: 1.32,
    }, {
        palette: palette(rgb(0.16, 0.18, 0.29), rgb(0.09, 0.10, 0.18), rgb(0.03, 0.03, 0.07), rgb(0.42, 0.46, 0.62)),
        widthScale: 0.068, minWidth: 1.9, texture: texture('braid', 2.1, 0.24), glow: 0,
    }),
    // Hand-twisted cotton in saffron and vermilion: soft, with some give (capped at 1.016).
    style('temple-thread', 'Temple Thread', {
        gravityScale: 1.04, damping: 0.9982, maxStretch: 1.016,
        iterations: 14, stretchPasses: 8, charmMassScale: 0.92,
    }, {
        palette: palette(rgb(0.87, 0.51, 0.09), rgb(0.66, 0.20, 0.07), rgb(0.29, 0.07, 0.03), rgb(1.00, 0.82, 0.38)),
        widthScale: 0.052, minWidth: 1.6, texture: texture('twist', 1.15, 0.26), glow: 0,
    }),
    // Woven silver: a chain's shine with a cord's quickness.
    style('silver-cord', 'Silver Cord', {
        gravityScale: 0.94, damping: 0.9990, maxStretch: 1.009,
        iterations: 16, stretchPasses: 8, charmMassScale: 1.08,
    }, {
        palette: palette(rgb(0.80, 0.83, 0.88), rgb(0.58, 0.62, 0.69), rgb(0.26, 0.28, 0.33), rgb(1.00, 1.00, 1.00)),
        widthScale: 0.054, minWidth: 1.7, texture: texture('twist', 1.35, 0.22), glow: 0,
    }),
]);

export const STYLE_IDS = Object.freeze(STYLES.map(s => s.id));
export const DEFAULT_STYLE = 'thread';

const byId = new Map(STYLES.map(s => [s.id, s]));

/** The style record for an id, falling back to thread for anything unknown. */
export const styleOf = id => byId.get(id) ?? byId.get(DEFAULT_STYLE);
export const physicsOf = id => styleOf(id).physics;
export const appearanceOf = id => styleOf(id).appearance;
export const styleName = id => styleOf(id).name;

/** Drawn rope width in pixels for a charm of the given radius. */
export function ropeWidth(id, charmRadius, thickness = 1) {
    const a = appearanceOf(id);
    return Math.max(a.minWidth, charmRadius * a.widthScale) * thickness;
}
