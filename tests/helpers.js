// Shared test utilities (not a test file: node --test only runs *.test.js).

/** Deterministic PRNG so every failure is reproducible. */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Longest link divided by the rest length. */
export function stretchOf(rope) {
    let worst = 0;
    for (let i = 0; i < rope.pointCount - 1; i++) {
        const d = Math.hypot(rope.x[i + 1] - rope.x[i], rope.y[i + 1] - rope.y[i]);
        worst = Math.max(worst, d / rope.segmentLength);
    }
    return worst;
}

export function allFinite(rope) {
    for (let i = 0; i < rope.pointCount; i++) {
        if (!Number.isFinite(rope.x[i]) || !Number.isFinite(rope.y[i]))
            return false;
    }
    return true;
}

/** Steps at a fixed frame rate until the rope sleeps; returns seconds or Infinity. */
export function timeToSleep(rope, limit = 30, frame = 1 / 60) {
    for (let t = 0; t < limit; t += frame) {
        rope.step(frame);
        if (rope.isSleeping)
            return t + frame;
    }
    return Infinity;
}
