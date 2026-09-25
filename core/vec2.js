// Small immutable 2D vector helpers for code outside the solver's hot loop.
// Screen convention: origin top-left, y grows downward.

export const vec = (x = 0, y = 0) => ({x, y});
export const add = (a, b) => ({x: a.x + b.x, y: a.y + b.y});
export const sub = (a, b) => ({x: a.x - b.x, y: a.y - b.y});
export const scale = (a, k) => ({x: a.x * k, y: a.y * k});
export const length = a => Math.hypot(a.x, a.y);
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a, b, t) => ({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t});

export function normalize(a) {
    const len = Math.hypot(a.x, a.y);
    return len > 0 ? {x: a.x / len, y: a.y / len} : {x: 0, y: 0};
}

/** Clamps the magnitude to `max`, keeping the direction. */
export function limit(a, max) {
    const len = Math.hypot(a.x, a.y);
    return len > max && len > 0 ? {x: a.x * max / len, y: a.y * max / len} : {x: a.x, y: a.y};
}

/** Rotates by `angle` radians; positive turns clockwise on a y-down screen. */
export function rotate(a, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return {x: a.x * c - a.y * s, y: a.x * s + a.y * c};
}
