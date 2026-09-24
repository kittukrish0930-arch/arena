// -----------------------------------------------------------------------------
// Deterministic pseudo random number generator (mulberry32) + seed helpers.
// A stable seed reproduces the same train, props and terrain layout.
// -----------------------------------------------------------------------------

export class RNG {
  constructor(seed = 1337) {
    this.seed = seed >>> 0;
    this._state = this.seed;
  }

  reset(seed = this.seed) {
    this.seed = seed >>> 0;
    this._state = this.seed;
    return this;
  }

  /** float in [0,1) */
  next() {
    this._state |= 0;
    this._state = (this._state + 0x6d2b79f5) | 0;
    let t = Math.imul(this._state ^ (this._state >>> 15), 1 | this._state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** float in [min,max) */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** integer in [min,max] inclusive */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /** true with probability p */
  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** weighted pick: [{weight, ...}] */
  weighted(entries) {
    let total = 0;
    for (const e of entries) total += e.weight ?? 1;
    let r = this.next() * total;
    for (const e of entries) {
      r -= e.weight ?? 1;
      if (r <= 0) return e;
    }
    return entries[entries.length - 1];
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}

/** Shared generator used for procedural content that must be reproducible. */
export const worldRNG = new RNG(20250924);

export default RNG;
