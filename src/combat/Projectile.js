// -----------------------------------------------------------------------------
// Projectile system.
//
// Bullets are hitscan (a raycast happens the instant a weapon fires) but every
// shot also pushes a projectile record into this pool so the render layer can
// draw a travelling tracer, and so gameplay can react to the *travelling* bullet
// for boss/elite weapons that should be dodgeable.
// -----------------------------------------------------------------------------
import { rayBox } from '../utils/MathUtils.js';
import { raySphere } from '../physics/CollisionWorld.js';

export class ProjectileSystem {
  constructor(world, { capacity = 96 } = {}) {
    this.world = world;
    this.capacity = capacity;
    this.items = [];
    for (let i = 0; i < capacity; i++) {
      this.items.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        damage: 0,
        owner: null,
        team: 0,
        color: 0xffd27a,
        hitPos: { x: 0, y: 0, z: 0 },
        traveled: 0,
        maxDistance: 60,
        source: null,
      });
    }
    this.cursor = 0;
    this.onHit = null; // (projectile, target, point) => void
    this.onExpire = null;
  }

  /**
   * Fires a hitscan bullet that keeps travelling for visuals.
   * Damage is applied by the caller (immediately) - this record drives tracers
   * and delayed impact effects.
   */
  spawn({ x, y, z, dir, distance, damage, owner, team, color, source = null, speedFactor = 1 }) {
    const p = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = (dir.x / len) * 160 * speedFactor;
    p.vy = (dir.y / len) * 160 * speedFactor;
    p.vz = (dir.z / len) * 160 * speedFactor;
    p.life = 1.1;
    p.damage = damage;
    p.owner = owner;
    p.team = team;
    p.color = color ?? 0xffd27a;
    p.maxDistance = distance;
    p.traveled = 0;
    p.source = source;
    return p;
  }

  update(dt) {
    for (const p of this.items) {
      if (!p.active) continue;
      p.life -= dt;
      const dx = p.vx * dt;
      const dy = p.vy * dt;
      const dz = p.vz * dt;
      let hit = null;
      // world collision
      const dist = Math.hypot(dx, dy, dz);
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;
      let best = dist;
      for (const box of this.world.all()) {
        if (!box.solid) continue;
        const d = rayBox(p.x, p.y, p.z, nx, ny, nz, box, best);
        if (d >= 0 && d < best) {
          best = d;
          hit = { box, point: { x: p.x + nx * d, y: p.y + ny * d, z: p.z + nz * d } };
        }
      }
      p.x += nx * best;
      p.y += ny * best;
      p.z += nz * best;
      p.traveled += best;
      if (hit) {
        this.onHit?.(p, hit);
        p.active = false;
        continue;
      }
      if (p.life <= 0 || p.traveled > p.maxDistance) {
        this.onExpire?.(p);
        p.active = false;
      }
    }
  }

  clear() {
    for (const p of this.items) p.active = false;
  }

  get count() {
    let n = 0;
    for (const p of this.items) if (p.active) n++;
    return n;
  }
}

/** Sphere test used by projectile/AI code. */
export function spheresOverlap(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  const r = (a.radius ?? 0) + (b.radius ?? 0);
  return dx * dx + dy * dy + dz * dz <= r * r;
}

export function raySphereHit(origin, dir, center, radius, maxDist = Infinity) {
  return raySphere(origin, dir, center, radius, maxDist);
}

export default ProjectileSystem;
