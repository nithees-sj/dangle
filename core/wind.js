// An occasional gentle breeze: a short gust every 45–120 s that sweeps across
// the cords. Pure and deterministic given its random source.

export const GUST_MIN_DELAY = 45;
export const GUST_MAX_DELAY = 120;

/** Peak sideways acceleration at strength 1, px/s² (≈ 8° of lean on a still rope). */
export const MAX_GUST_ACCEL = 280;

/** Seconds between neighbouring cords feeling the same gust. */
const SWEEP_LAG = 0.12;
const MAX_CORDS = 5;

export class Breeze {
    /** @param {() => number} rng uniform random in [0, 1) */
    constructor(rng = Math.random) {
        this._rng = rng;
        this._time = 0;
        this._duration = 0;
        this._peak = 0;
        this._wobble = 0;
        this._active = false;
    }

    get active() {
        return this._active;
    }

    /** Seconds until the next gust. */
    nextDelay() {
        return GUST_MIN_DELAY + this._rng() * (GUST_MAX_DELAY - GUST_MIN_DELAY);
    }

    /** Begins a gust; strength 0–1 scales how hard it blows. */
    start(strength = 0.5) {
        const direction = this._rng() < 0.5 ? -1 : 1;
        this._duration = 1.5 + this._rng() * 2;
        this._peak = direction * MAX_GUST_ACCEL * Math.max(0, Math.min(1, strength)) * (0.6 + 0.4 * this._rng());
        this._wobble = 0.9 + this._rng() * 0.8;
        this._time = 0;
        this._active = true;
    }

    stop() {
        this._active = false;
        this._time = 0;
    }

    advance(dt) {
        if (!this._active)
            return;
        this._time += dt;
        if (this._time >= this._duration + SWEEP_LAG * (MAX_CORDS - 1))
            this.stop();
    }

    /** Sideways acceleration on cord `index` right now, px/s². */
    forceX(index) {
        if (!this._active)
            return 0;
        const t = this._time - SWEEP_LAG * index;
        if (t <= 0 || t >= this._duration)
            return 0;
        const envelope = Math.sin(Math.PI * t / this._duration) ** 2;
        const flutter = 1 + 0.25 * Math.sin(2 * Math.PI * this._wobble * t + index * 1.7);
        return this._peak * envelope * flutter;
    }
}
