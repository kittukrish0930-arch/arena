// -----------------------------------------------------------------------------
// Generic object pool. Keeps allocations out of the hot loop (bullets, particles,
// tracers, damage numbers, ...).
// -----------------------------------------------------------------------------

export class ObjectPool {
  /**
   * @param {() => any} factory creates a new object
   * @param {(obj:any) => void} [onRelease]
   * @param {number} [initial] number of objects to pre-allocate
   */
  constructor(factory, onRelease = null, initial = 0) {
    this.factory = factory;
    this.onRelease = onRelease;
    this.free = [];
    this.active = [];
    for (let i = 0; i < initial; i++) this.free.push(factory());
  }

  get size() {
    return this.free.length + this.active.length;
  }

  /** Returns a reused or freshly created object (marked active). */
  acquire() {
    const obj = this.free.pop() ?? this.factory();
    this.active.push(obj);
    return obj;
  }

  /** Return an object to the free list. */
  release(obj) {
    const i = this.active.indexOf(obj);
    if (i >= 0) this.active.splice(i, 1);
    if (this.onRelease) this.onRelease(obj);
    this.free.push(obj);
  }

  /** Iterate active objects backwards so callers can release during iteration. */
  forEachActive(fn) {
    for (let i = this.active.length - 1; i >= 0; i--) fn(this.active[i], i);
  }

  releaseAll() {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const obj = this.active[i];
      if (this.onRelease) this.onRelease(obj);
      this.free.push(obj);
    }
    this.active.length = 0;
  }
}

/**
 * Fixed capacity pool backed by a single flat array of reusable records.
 * Cheaper than ObjectPool for thousands of entries because it never splices.
 */
export class FlatPool {
  constructor(size, factory) {
    this.items = new Array(size);
    for (let i = 0; i < size; i++) {
      const item = factory(i);
      item.__index = i;
      item.active = false;
      this.items[i] = item;
    }
    this.cursor = 0;
    this.capacity = size;
  }

  /** Fetches the next free slot (round-robin) and marks it active. */
  spawn() {
    for (let attempt = 0; attempt < this.capacity; attempt++) {
      const idx = (this.cursor + attempt) % this.capacity;
      const item = this.items[idx];
      if (!item.active) {
        this.cursor = (idx + 1) % this.capacity;
        item.active = true;
        return item;
      }
    }
    // Everything is busy: recycle the oldest slot.
    const item = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    item.active = true;
    return item;
  }

  release(item) {
    item.active = false;
  }

  /** Deactivates every slot (used on run restart / level change). */
  releaseAll() {
    for (let i = 0; i < this.items.length; i++) this.items[i].active = false;
    this.cursor = 0;
  }

  forEachActive(fn) {
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (item.active) fn(item, i);
    }
  }
}

export default ObjectPool;
