// The nine rope styles: the solver values each one overrides, how it is drawn,
// and the time-of-day profiles layered on top.
//
// Every number here is the reference value, unchanged: physics profiles, the
// four-ink palettes, widths, textures and glow are ported from Hangly for
// Windows (MIT, see NOTICE.md).

/** Base solver configuration, before a style's overrides. Units: points (= px) and seconds, y down. */
export const DEFAULTS = Object.freeze({
    segmentCount: 20,
    segmentLength: 11,
    gravity: 2000,
    damping: 0.999,
    fixedStep: 1 / 240,
    maxFrame: 0.1,
    maxSpeed: 6000,
    reachRatio: 0.98,
    restSpeed: 4.0,
    framesBeforeSleep: 60,
    initialAngle: 0.38,
    tolerance: 0.05,
    // Overridden by every style; these are Thread's.
    maxStretch: 1.02,
    iterations: 256,
    stretchPasses: 256,
});

const rgb = (r, g, b) => Object.freeze([r, g, b]);

/** The four inks: primary (body), secondary (under-strand), deep (shadow side), light (lit side). */
const palette = (primary, secondary, deep, light) => Object.freeze({primary, secondary, deep, light});

function style(id, enumName, name, physics, appearance, description) {
    return Object.freeze({
        id,
        enumName,
        name,
        physics: Object.freeze(physics),
        appearance: Object.freeze({...appearance, texture: Object.freeze(appearance.texture)}),
        description,
    });
}

const PALETTES = Object.freeze({
    Thread: palette(rgb(0.47, 0.34, 0.11), rgb(0.31, 0.22, 0.06), rgb(0.16, 0.11, 0.03), rgb(0.78, 0.62, 0.30)),
    Leather: palette(rgb(0.36, 0.22, 0.13), rgb(0.25, 0.15, 0.08), rgb(0.11, 0.06, 0.03), rgb(0.63, 0.45, 0.30)),
    GoldChain: palette(rgb(0.72, 0.55, 0.19), rgb(0.50, 0.36, 0.10), rgb(0.24, 0.16, 0.04), rgb(0.97, 0.86, 0.53)),
    SilverChain: palette(rgb(0.69, 0.72, 0.77), rgb(0.47, 0.50, 0.55), rgb(0.21, 0.23, 0.27), rgb(0.97, 0.98, 1.00)),
    Neon: palette(rgb(0.29, 0.92, 1.00), rgb(0.16, 0.60, 0.95), rgb(0.05, 0.16, 0.40), rgb(0.88, 1.00, 1.00)),
    SpiderThread: palette(rgb(0.94, 0.95, 0.97), rgb(0.74, 0.77, 0.82), rgb(0.33, 0.36, 0.42), rgb(1.00, 1.00, 1.00)),
    MidnightCord: palette(rgb(0.16, 0.18, 0.29), rgb(0.09, 0.10, 0.18), rgb(0.03, 0.03, 0.07), rgb(0.42, 0.46, 0.62)),
    TempleThread: palette(rgb(0.87, 0.51, 0.09), rgb(0.66, 0.20, 0.07), rgb(0.29, 0.07, 0.03), rgb(1.00, 0.82, 0.38)),
    SilverCord: palette(rgb(0.80, 0.83, 0.88), rgb(0.58, 0.62, 0.69), rgb(0.26, 0.28, 0.33), rgb(1.00, 1.00, 1.00)),
});

export const STYLES = Object.freeze([
    style('thread', 'Thread', 'Thread',
          {gravityScale: 1.00, damping: 0.9990, maxStretch: 1.020, iterations: 256, stretchPasses: 256, charmMassScale: 1.00},
          {
              palette: PALETTES.Thread, widthScale: 0.046, minWidth: 1.5,
              texture: {kind: 'twist', pitch: 1.50, offset: 0.20}, glowStrength: 0, beadTint: null,
          },
          'Twisted gold. The cord Dangle has always used — light, quick, and quiet.'),
    style('leather', 'Leather', 'Leather',
          {gravityScale: 1.08, damping: 0.9955, maxStretch: 1.006, iterations: 288, stretchPasses: 288, charmMassScale: 1.05},
          {
              palette: PALETTES.Leather, widthScale: 0.058, minWidth: 1.7,
              texture: {kind: 'braid', pitch: 2.30, offset: 0.26}, glowStrength: 0, beadTint: 'Leather',
          },
          'A flat braid. Stiffer than thread, and settles a little sooner.'),
    style('gold-chain', 'GoldChain', 'Gold Chain',
          {gravityScale: 0.72, damping: 0.9992, maxStretch: 1.004, iterations: 320, stretchPasses: 320, charmMassScale: 1.40},
          {
              palette: PALETTES.GoldChain, widthScale: 0.088, minWidth: 2.2,
              texture: {kind: 'links', pitch: 2.05, thickness: 0.62}, glowStrength: 0, beadTint: null,
          },
          'Linked gold. The heaviest of the five, and the slowest to swing.'),
    style('silver-chain', 'SilverChain', 'Silver Chain',
          {gravityScale: 0.84, damping: 0.9988, maxStretch: 1.005, iterations: 320, stretchPasses: 320, charmMassScale: 1.25},
          {
              palette: PALETTES.SilverChain, widthScale: 0.082, minWidth: 2.1,
              texture: {kind: 'links', pitch: 1.95, thickness: 0.60}, glowStrength: 0, beadTint: 'SilverChain',
          },
          "Linked silver. A chain's weight with a little more life in it."),
    style('neon', 'Neon', 'Neon',
          {gravityScale: 1.22, damping: 0.9997, maxStretch: 1.030, iterations: 224, stretchPasses: 224, charmMassScale: 0.78},
          {
              palette: PALETTES.Neon, widthScale: 0.040, minWidth: 1.4,
              texture: {kind: 'smooth'}, glowStrength: 1.0, beadTint: 'Neon',
          },
          'A lit filament. The lightest cord and the most responsive.'),
    style('spider-thread', 'SpiderThread', 'Spider Thread',
          {gravityScale: 1.16, damping: 0.9996, maxStretch: 1.004, iterations: 336, stretchPasses: 336, charmMassScale: 0.80},
          {
              palette: PALETTES.SpiderThread, widthScale: 0.038, minWidth: 1.55,
              texture: {kind: 'web', pitch: 1.55, offset: 0.28}, glowStrength: 0.26, beadTint: 'SpiderThread',
          },
          'Spun silk. The thinnest cord of all, and stronger than anything its weight.'),
    style('midnight-cord', 'MidnightCord', 'Midnight Cord',
          {gravityScale: 0.78, damping: 0.9986, maxStretch: 1.007, iterations: 304, stretchPasses: 304, charmMassScale: 1.32},
          {
              palette: PALETTES.MidnightCord, widthScale: 0.068, minWidth: 1.9,
              texture: {kind: 'braid', pitch: 2.10, offset: 0.24}, glowStrength: 0, beadTint: 'MidnightCord',
          },
          'A dark braid. Heavy, quiet, and slow to give a swing up.'),
    style('temple-thread', 'TempleThread', 'Temple Thread',
          {gravityScale: 1.04, damping: 0.9982, maxStretch: 1.026, iterations: 232, stretchPasses: 232, charmMassScale: 0.92},
          {
              palette: PALETTES.TempleThread, widthScale: 0.052, minWidth: 1.6,
              texture: {kind: 'twist', pitch: 1.15, offset: 0.26}, glowStrength: 0, beadTint: 'TempleThread',
          },
          'Twisted cotton in saffron and vermilion. Soft, and it has some give.'),
    style('silver-cord', 'SilverCord', 'Silver Cord',
          {gravityScale: 0.94, damping: 0.9990, maxStretch: 1.009, iterations: 272, stretchPasses: 272, charmMassScale: 1.08},
          {
              palette: PALETTES.SilverCord, widthScale: 0.054, minWidth: 1.7,
              texture: {kind: 'twist', pitch: 1.35, offset: 0.22}, glowStrength: 0, beadTint: 'SilverCord',
          },
          "Woven silver. A chain's shine with a cord's quickness."),
]);

export const STYLE_IDS = Object.freeze(STYLES.map(s => s.id));

/** The rope new installs (and anything unrecognized) hang on. */
export const DEFAULT_STYLE = 'spider-thread';

const byId = new Map(STYLES.map(s => [s.id, s]));

/** The style record for an id, falling back to the default for anything unknown. */
export const styleOf = id => byId.get(id) ?? byId.get(DEFAULT_STYLE);
export const physicsOf = id => styleOf(id).physics;
export const appearanceOf = id => styleOf(id).appearance;
export const styleName = id => styleOf(id).name;
export const styleDescription = id => styleOf(id).description;

/** Drawn cord width in points for a charm of the given radius (× the user's thickness). */
export function ropeWidth(id, charmRadius, thickness = 1) {
    const a = appearanceOf(id);
    return Math.max(a.minWidth, charmRadius * a.widthScale) * thickness;
}

// ── time of day ────────────────────────────────────────────────────────────

/** Multipliers layered on top of a style, by time of day. Afternoon is the identity. */
export const TIME_PROFILES = Object.freeze({
    morning: Object.freeze({energyLossScale: 0.80, releaseAngleScale: 1.14, restSpeedScale: 0.94}),
    afternoon: Object.freeze({energyLossScale: 1.00, releaseAngleScale: 1.00, restSpeedScale: 1.00}),
    night: Object.freeze({energyLossScale: 1.30, releaseAngleScale: 0.88, restSpeedScale: 1.10}),
});

/** Morning 5:00–11:59, afternoon 12:00–17:59, night 18:00–4:59. */
export function timeProfileAt(hour) {
    if (hour >= 5 && hour < 12)
        return 'morning';
    if (hour >= 12 && hour < 18)
        return 'afternoon';
    return 'night';
}

/**
 * A style's physics with a time profile applied: the energy lost per step,
 * (1 − damping), is scaled; so are the release angle and the rest speed.
 */
export function resolvedPhysics(id, profile = 'afternoon') {
    const p = physicsOf(id);
    const t = TIME_PROFILES[profile] ?? TIME_PROFILES.afternoon;
    return Object.freeze({
        ...p,
        gravity: DEFAULTS.gravity * p.gravityScale,
        damping: 1 - (1 - p.damping) * t.energyLossScale,
        initialAngle: DEFAULTS.initialAngle * t.releaseAngleScale,
        restSpeed: DEFAULTS.restSpeed * t.restSpeedScale,
    });
}
