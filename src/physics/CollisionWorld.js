// -----------------------------------------------------------------------------
// Lightweight collision world.
//
// The train is authored as a set of axis aligned boxes ("solids") in train space
// (x runs along the consist, y up, z across the car). Boxes flagged `surface`
// can be stood on, boxes flagged `solid` block movement. Nothing here depends on
// three.js, so the movement stack is fully unit-testable headlessly.
// -----------------------------------------------------------------------------
import { PLAYER } from '../game/Config.js';
import { rayBox } from '../utils/MathUtils.js';

let nextId = 1;

export class CollisionWorld {
  constructor() {
    /** @type {Array<object>} static solid boxes */
    this.solids = [];
    /** @type {Map<number, object>} movable boxes keyed by id */
    this.dynamic = new Map();
    this._allCache = null;
  }

  clear() {
    this.solids.length = 0;
    this.dynamic.clear();
    this._allCache = null;
  }

  /**
   * @param {object} opts minX,maxX,minY,maxY,minZ,maxZ, solid, surface, tag, owner, dynamic
   */
  add(opts) {
    const box = {
      id: nextId++,
      minX: opts.minX,
      maxX: opts.maxX,
      minY: opts.minY,
      maxY: opts.maxY,
      minZ: opts.minZ,
      maxZ: opts.maxZ,
      solid: opts.solid !== false,
      surface: opts.surface !== false,
      oneWay: !!opts.oneWay,
      tag: opts.tag || 'world',
      owner: opts.owner || null,
      data: opts.data || null,
      dynamic: !!opts.dynamic,
    };
    this._allCache = null;
    if (box.dynamic) this.dynamic.set(box.id, box);
    else this.solids.push(box);
    return box;
  }

  addFromCenter(cx, cy, cz, sx, sy, sz, opts = {}) {
    return this.add({
      minX: cx - sx / 2,
      maxX: cx + sx / 2,
      minY: cy - sy / 2,
      maxY: cy + sy / 2,
      minZ: cz - sz / 2,
      maxZ: cz + sz / 2,
      ...opts,
    });
  }

  remove(box) {
    if (!box) return;
    this._allCache = null;
    if (box.dynamic) this.dynamic.delete(box.id);
    const i = this.solids.indexOf(box);
    if (i >= 0) this.solids.splice(i, 1);
  }

  removeByOwner(owner) {
    this._allCache = null;
    for (let i = this.solids.length - 1; i >= 0; i--) {
      if (this.solids[i].owner === owner) this.solids.splice(i, 1);
    }
    for (const [id, box] of this.dynamic) if (box.owner === owner) this.dynamic.delete(id);
  }

  moveBox(box, cx, cy, cz) {
    const hx = (box.maxX - box.minX) / 2;
    const hy = (box.maxY - box.minY) / 2;
    const hz = (box.maxZ - box.minZ) / 2;
    box.minX = cx - hx;
    box.maxX = cx + hx;
    box.minY = cy - hy;
    box.maxY = cy + hy;
    box.minZ = cz - hz;
    box.maxZ = cz + hz;
  }

  /** All boxes (static + movable) as a flat array (cached per frame-ish). */
  all() {
    if (!this._allCache || this._allCache.length !== this.solids.length + this.dynamic.size) {
      this._allCache = this.dynamic.size
        ? this.solids.concat(Array.from(this.dynamic.values()))
        : this.solids.slice();
    }
    return this._allCache;
  }

  invalidate() {
    this._allCache = null;
  }

  get count() {
    return this.solids.length + this.dynamic.size;
  }

  // ---------------------------------------------------------------------------
  // Actor movement
  // ---------------------------------------------------------------------------

  /**
   * Moves an actor through the world, resolving one axis at a time.
   * @param {object} actor {pos:{x,y,z}, vel:{x,y,z}, width, height}
   * @returns {object} { ground, ceiling, wallX, wallZ, stepUp, groundBox }
   */
  moveActor(actor, dt, opts = {}) {
    const width = actor.width ?? PLAYER.radius * 2;
    const height = actor.height ?? PLAYER.height;
    const stepHeight = opts.stepHeight ?? PLAYER.stepHeight;
    const gravity = opts.gravity ?? PLAYER.gravity;
    const halfW = width / 2;
    const pos = actor.pos;
    const vel = actor.vel;
    const result = {
      ground: false,
      ceiling: false,
      wallX: 0,
      wallZ: 0,
      groundBox: null,
      ceilingBox: null,
      stepUp: 0,
    };

    // --- vertical ------------------------------------------------------------
    vel.y -= gravity * dt;
    if (vel.y < -PLAYER.maxFallSpeed) vel.y = -PLAYER.maxFallSpeed;
    const dy = vel.y * dt;
    if (dy !== 0) {
      let ny = pos.y + dy;
      if (dy < 0) {
        const landing = this._highestTop(pos.x, pos.z, halfW, pos.y, ny, height);
        if (landing) {
          result.ground = true;
          result.groundBox = landing.box;
          const impactSpeed = vel.y;
          ny = landing.y;
          vel.y = 0;
          actor.onLand?.(impactSpeed, landing.box);
        }
      } else {
        const ceiling = this._lowestBottom(pos.x, pos.z, halfW, pos.y, height, ny + height);
        if (ceiling) {
          result.ceiling = true;
          result.ceilingBox = ceiling.box;
          ny = ceiling.y - height - 0.002;
          vel.y = Math.min(0, vel.y);
          actor.onCeiling?.(ceiling.box);
        }
      }
      pos.y = ny;
    }

    // Safety: if the actor somehow ended up inside geometry, push it out upward.
    if (this._overlapsAny(pos.x, pos.y, pos.z, halfW, height)) {
      this._resolvePenetration(pos, halfW, height);
    }

    // --- horizontal X --------------------------------------------------------
    if (vel.x !== 0) {
      const from = pos.x;
      const target = pos.x + vel.x * dt;
      const hit = this._resolveAxis('x', pos, target, halfW, height, result.ground, stepHeight);
      if (hit.blocked) {
        pos.x = hit.resolved;
        result.wallX = hit.normal;
        vel.x = 0;
      } else {
        pos.x = target;
        if (hit.stepY > 0) {
          result.stepUp = Math.max(result.stepUp, hit.stepY);
          pos.y = hit.stepY + 0.002;
        }
      }
      if (pos.x === from && Math.abs(vel.x) < 1e-6) vel.x = 0;
    }

    // --- horizontal Z --------------------------------------------------------
    if (vel.z !== 0) {
      const target = pos.z + vel.z * dt;
      const hit = this._resolveAxis('z', pos, target, halfW, height, result.ground, stepHeight);
      if (hit.blocked) {
        pos.z = hit.resolved;
        result.wallZ = hit.normal;
        vel.z = 0;
      } else {
        pos.z = target;
        if (hit.stepY > 0) {
          result.stepUp = Math.max(result.stepUp, hit.stepY);
          pos.y = hit.stepY + 0.002;
        }
      }
    }

    return result;
  }

  _resolveAxis(axis, pos, target, halfW, height, allowStep, stepHeight) {
    const dirRaw = target - (axis === 'x' ? pos.x : pos.z);
    const dir = dirRaw > 0 ? 1 : -1;
    const yMin = pos.y + 0.06;
    const yMax = pos.y + height - 0.02;
    const oMin = (axis === 'x' ? pos.z : pos.x) - halfW;
    const oMax = (axis === 'x' ? pos.z : pos.x) + halfW;
    const aMin = target - halfW;
    const aMax = target + halfW;
    let wallResolved = null;
    let stepTop = 0;

    for (const box of this.all()) {
      if (!box.solid) continue;
      if (box.maxY <= yMin || box.minY >= yMax) continue;
      const bMin = axis === 'x' ? box.minZ : box.minX;
      const bMax = axis === 'x' ? box.maxZ : box.maxX;
      if (bMin >= oMax || bMax <= oMin) continue;
      const aBMin = axis === 'x' ? box.minX : box.minZ;
      const aBMax = axis === 'x' ? box.maxX : box.maxZ;
      if (aBMin >= aMax || aBMax <= aMin) continue;

      if (allowStep && box.maxY - pos.y <= stepHeight + 0.02) {
        if (box.maxY > stepTop) stepTop = box.maxY;
        continue;
      }
      const resolved = dir > 0 ? aBMin - halfW - 0.002 : aBMax + halfW + 0.002;
      if (wallResolved === null) wallResolved = resolved;
      else if (dir > 0 ? resolved < wallResolved : resolved > wallResolved) wallResolved = resolved;
    }

    if (wallResolved !== null) return { blocked: true, resolved: wallResolved, normal: -dir, stepY: 0 };
    return { blocked: false, stepY: stepTop };
  }

  _overlapsAny(x, y, z, halfW, height) {
    const yMin = y + 0.05;
    const yMax = y + height - 0.05;
    for (const b of this.all()) {
      if (!b.solid) continue;
      if (b.maxX <= x - halfW || b.minX >= x + halfW) continue;
      if (b.maxY <= yMin || b.minY >= yMax) continue;
      if (b.maxZ <= z - halfW || b.minZ >= z + halfW) continue;
      return b;
    }
    return null;
  }

  _resolvePenetration(pos, halfW, height) {
    for (let iter = 0; iter < 3; iter++) {
      const box = this._overlapsAny(pos.x, pos.y, pos.z, halfW, height);
      if (!box) return;
      // Push out along the axis with the smallest overlap.
      const overlapX = Math.min(box.maxX - (pos.x - halfW), pos.x + halfW - box.minX);
      const overlapZ = Math.min(box.maxZ - (pos.z - halfW), pos.z + halfW - box.minZ);
      if (overlapX < overlapZ) {
        pos.x += pos.x < (box.minX + box.maxX) / 2 ? -overlapX - 0.01 : overlapX + 0.01;
      } else {
        pos.z += pos.z < (box.minZ + box.maxZ) / 2 ? -overlapZ - 0.01 : overlapZ + 0.01;
      }
    }
  }

  /** Highest surface top the actor can land on between fromY and toY. */
  _highestTop(x, z, halfW, fromY, toY, height) {
    let best = null;
    for (const b of this.all()) {
      if (!b.surface) continue;
      if (b.maxX < x - halfW || b.minX > x + halfW) continue;
      if (b.maxZ < z - halfW || b.minZ > z + halfW) continue;
      const top = b.maxY;
      if (top > fromY + 0.02) continue; // above feet: not a landing surface
      if (top < toY) continue; // we are below it already
      if (!best || top > best.y) best = { y: top, box: b };
    }
    return best;
  }

  _lowestBottom(x, z, halfW, fromY, height, toY) {
    let best = null;
    for (const b of this.all()) {
      if (!b.solid) continue;
      if (b.maxX < x - halfW || b.minX > x + halfW) continue;
      if (b.maxZ < z - halfW || b.minZ > z + halfW) continue;
      const bottom = b.minY;
      if (bottom < fromY + height - 0.02) continue;
      if (bottom > toY + height + 0.02) continue;
      if (!best || bottom < best.y) best = { y: bottom, box: b };
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Raycasting
  // ---------------------------------------------------------------------------

  /**
   * @param {{x,y,z}} origin
   * @param {{x,y,z}} dir normalised
   * @param {number} maxDist
   * @param {Array<{pos:{x,y,z},radius:number,target:any,multiplier?:number,headshot?:boolean}>|null} sphereTargets
   * @param {(box:object)=>boolean|null} ignorePredicate returns true to skip the box
   */
  raycast(origin, dir, maxDist = 100, sphereTargets = null, ignorePredicate = null) {
    let best = { hit: false, distance: maxDist, box: null, target: null, point: null, multiplier: 1 };
    for (const b of this.all()) {
      if (!b.solid) continue;
      if (ignorePredicate && ignorePredicate(b)) continue;
      const d = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, b, best.distance);
      if (d >= 0 && d <= best.distance) {
        best = { hit: true, distance: d, box: b, target: b.owner, point: null, multiplier: 1 };
      }
    }
    if (sphereTargets) {
      for (const s of sphereTargets) {
        const d = raySphere(origin, dir, s.pos, s.radius, best.distance);
        if (d >= 0 && d <= best.distance) {
          best = {
            hit: true,
            distance: d,
            box: null,
            target: s.target,
            point: null,
            multiplier: s.multiplier ?? 1,
            headshot: !!s.headshot,
          };
        }
      }
    }
    if (best.hit) {
      best.point = {
        x: origin.x + dir.x * best.distance,
        y: origin.y + dir.y * best.distance,
        z: origin.z + dir.z * best.distance,
      };
    }
    return best;
  }

  /** True when the segment a->b is unobstructed. */
  lineOfSight(ax, ay, az, bx, by, bz, ignoreOwner = null) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-4) return true;
    const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
    const hit = this.raycast({ x: ax, y: ay, z: az }, dir, dist - 0.08, null, (b) => {
      if (!b.solid) return true;
      if (ignoreOwner && b.owner === ignoreOwner) return true;
      return false;
    });
    return !hit.hit;
  }

  /** All boxes matching a tag (used by hazards / objectives). */
  findByTag(tag) {
    const out = [];
    for (const b of this.all()) if (b.tag === tag) out.push(b);
    return out;
  }

  /** True when the point is inside a solid box. */
  pointBlocked(x, y, z, ignoreOwner = null) {
    for (const b of this.all()) {
      if (!b.solid) continue;
      if (ignoreOwner && b.owner === ignoreOwner) continue;
      if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ) return true;
    }
    return false;
  }

  /**
   * Bullets must not start inside geometry (a muzzle clipping into cover would
   * otherwise "hit" the wall at zero distance). Walks the origin forward along
   * the shot until it is clear.
   */
  clearRayOrigin(origin, dir, maxPush = 1.8, ignoreOwner = null) {
    if (!this.pointBlocked(origin.x, origin.y, origin.z, ignoreOwner)) return origin;
    const step = 0.15;
    for (let d = step; d <= maxPush; d += step) {
      const x = origin.x + dir.x * d;
      const y = origin.y + dir.y * d;
      const z = origin.z + dir.z * d;
      if (!this.pointBlocked(x, y, z, ignoreOwner)) {
        origin.x = x;
        origin.y = y;
        origin.z = z;
        return origin;
      }
    }
    return origin;
  }

  /** Overlapping boxes for a point (debug + interaction volumes). */
  pointOverlaps(x, y, z) {
    const out = [];
    for (const b of this.all()) {
      if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ) out.push(b);
    }
    return out;
  }
}

export function raySphere(origin, dir, center, radius, maxDist) {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq;
  if (t < 0 || t > maxDist) return -1;
  return t;
}

export default CollisionWorld;
