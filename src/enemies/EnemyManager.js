// -----------------------------------------------------------------------------
// EnemyManager - spawning, wave pacing and lifetime for every hostile.
//
// Enemies are spawned per car ("garrison") as the player advances, plus
// reinforcements driven by the alert meter. The boss is a single special enemy
// with phases handled by BossFight.
// -----------------------------------------------------------------------------
import { Enemy, ENEMY_TYPES } from './Enemy.js';
import { TRAIN } from '../game/Config.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class EnemyManager {
  constructor(world, train, ctx = {}) {
    this.world = world;
    this.train = train;
    this.ctx = ctx;
    this.enemies = [];
    this.corpses = [];
    this.totalSpawned = 0;
    this.totalKilled = 0;
    this.killsByType = {};
    this.boss = null;
    this.reinforcementTimer = 0;
    this.onSpawn = null;
    this.onKill = null;
    this.spawnedCars = new Set();
    /** incoming fire is rate limited so a whole car cannot volley at once */
    this.shotBudget = 1.6;
    this.shotBudgetMax = 2.6;
    this.waveCooldown = 0;
    this.pendingSpawns = [];
  }

  get alive() {
    return this.enemies.filter((e) => !e.dead);
  }

  get activeCount() {
    return this.alive.length;
  }

  get all() {
    return this.enemies;
  }

  reset() {
    this.enemies.length = 0;
    this.corpses.length = 0;
    this.totalSpawned = 0;
    this.totalKilled = 0;
    this.killsByType = {};
    this.boss = null;
    this.spawnedCars.clear();
    this.pendingSpawns.length = 0;
  }

  spawn(type, opts = {}) {
    const def = typeof type === 'string' ? ENEMY_TYPES[type] : type;
    const enemy = new Enemy(def, { ...opts, manager: this });
    this.enemies.push(enemy);
    this.totalSpawned++;
    if (enemy.isBoss) this.boss = enemy;
    this.onSpawn?.(enemy);
    return enemy;
  }

  /** Spawns the guards that belong to one car, using its authored nodes. */
  spawnCarGarrison(car, { budget = 3, difficulty = 1 } = {}) {
    if (!car || this.spawnedCars.has(car.index)) return [];
    this.spawnedCars.add(car.index);
    const nodes = car.spawnNodes.filter((n) => !n.roof);
    const roofNodes = car.spawnNodes.filter((n) => n.roof);
    const roster = this.rosterFor(car, difficulty);
    const spawned = [];
    for (let i = 0; i < Math.min(budget, roster.length); i++) {
      const node = nodes[i % Math.max(1, nodes.length)];
      const type = roster[i];
      const enemy = this.spawn(type, {
        pos: { x: node ? node.x + (Math.random() * 2 - 1) * 1.5 : car.x0 + 2, y: node?.y ?? car.floorSurfaceY, z: node ? node.z : 0 },
        car,
        node,
      });
      spawned.push(enemy);
    }
    // roof garrison (used by the rooftop section)
    if (car.hasRoof && (car.type === 'cargo' || car.type === 'passenger') && roofNodes.length && difficulty > 0.6) {
      for (const node of roofNodes.slice(0, 1)) {
        spawned.push(
          this.spawn('rifle', {
            pos: { x: node.x, y: node.y, z: 0 },
            car,
            node,
          })
        );
      }
    }
    return spawned;
  }

  /** Which enemies a given car fields. */
  rosterFor(car, difficulty) {
    switch (car.type) {
      case 'caboose':
        return ['basic', 'basic'];
      case 'cargo':
        return car === this.train.bombCar ? ['shotgun', 'basic', 'heavy'] : ['basic', 'basic', 'shotgun'];
      case 'passenger':
        return ['basic', 'rifle', 'basic', 'shotgun'];
      case 'flatcar':
        return ['rifle', 'shotgun', 'basic'];
      case 'armored':
        return ['heavy', 'heavy', 'elite'];
      case 'vault':
        return []; // boss handled separately
      default:
        return ['basic'];
    }
  }

  spawnRoofWave(count = 3) {
    const roofCars = this.train.cars.filter((c) => c.hasRoof || c.type === 'flatcar');
    const out = [];
    for (let i = 0; i < count; i++) {
      const car = roofCars[Math.floor(Math.random() * roofCars.length)];
      const x = car.x0 + Math.random() * car.length;
      const y = car.hasRoof ? car.roofSurfaceY : car.floorSurfaceY;
      out.push(this.spawn(Math.random() < 0.4 ? 'rifle' : 'basic', { pos: { x, y, z: (Math.random() * 2 - 1) * 1.1 }, car, roof: true }));
    }
    return out;
  }

  /** Behind-the-player reinforcements when the alarm maxes out. */
  spawnReinforcements(player, count = 2) {
    const car = this.train.carAt(player.pos.x);
    const dir = player.facing > 0 ? -1 : 1;
    const out = [];
    for (let i = 0; i < count; i++) {
      const x = Math.max(this.train.rearX + 2, Math.min(this.train.frontX - 2, player.pos.x + dir * (10 + i * 4)));
      const spawnCar = this.train.carAt(x);
      const onRoof = player.onRoof && spawnCar.hasRoof;
      out.push(
        this.spawn(Math.random() < 0.3 ? 'shotgun' : 'basic', {
          pos: { x, y: onRoof ? spawnCar.roofSurfaceY : spawnCar.floorSurfaceY, z: (Math.random() * 2 - 1) * 1.0 },
          car: spawnCar,
          roof: onRoof,
        })
      );
    }
    return out;
  }

  update(dt, ctx) {
    this.waveCooldown = Math.max(0, this.waveCooldown - dt);

    // --- incoming fire budget ------------------------------------------------
    // Enemies share a small "shots per second" budget: fights stay readable, the
    // early cars are gentle and the pressure ramps up towards the vault. The
    // player is never deleted by a five man volley.
    const progress = clamp01(((ctx.player?.pos.x ?? 0) - this.train.rearX) / Math.max(1, this.train.length));
    const alertPart = (ctx.alerts ? Math.min(1, ctx.alerts.level / 100) : 0) * 0.5;
    this.shotBudgetMax = 0.55 + progress * 0.5 + alertPart + (this.boss ? 0.5 : 0);
    this.shotBudget = Math.min(this.shotBudgetMax, this.shotBudget + dt * this.shotBudgetMax);
    ctx.claimShot = () => {
      if (this.shotBudget < 1) return false;
      this.shotBudget -= 1;
      return true;
    };

    // deferred spawns (lets the view create meshes between frames)
    if (this.pendingSpawns.length) {
      const queue = this.pendingSpawns;
      this.pendingSpawns = [];
      for (const job of queue) this.spawn(job.type, job.opts);
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, ctx);
      if (e.dead && e.deathHandled !== true) {
        e.deathHandled = true;
        this.totalKilled++;
        this.killsByType[e.type] = (this.killsByType[e.type] ?? 0) + 1;
        this.onKill?.(e, ctx);
      }
      if (e.dead && e.deadTimer > 9) {
        this.corpses.push(e);
        this.enemies.splice(i, 1);
        this.onRemove?.(e);
      }
    }
  }

  /** Hit spheres for the player's raycasts (alive enemies only). */
  getHitSpheres() {
    const out = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const spheres = e.getHitSpheres();
      for (const s of spheres) out.push(s);
    }
    return out;
  }

  getTargets() {
    const out = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      out.push({ pos: e.head, target: e, distance: 0 });
      out.push({ pos: e.center, target: e, distance: 0 });
    }
    return out;
  }

  /** Enemies close to a point (used by explosions). */
  near(x, z, radius) {
    const out = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.pos.x - x, e.pos.z - z) <= radius) out.push(e);
    }
    return out;
  }

  clearAll({ kill = false } = {}) {
    for (const e of this.enemies) {
      if (kill && !e.dead) e.damage(e.health * 2, {});
      this.onRemove?.(e);
    }
    this.enemies.length = 0;
    this.boss = null;
  }

  spawnBoss() {
    if (this.boss) return this.boss;
    const car = this.train.vaultCar;
    const node = car.spawnNodes.find((n) => n.role === 'boss') || { x: car.x1 - 3, z: 0, y: car.floorSurfaceY };
    const boss = this.spawn('boss', {
      pos: { x: node.x, y: node.y ?? TRAIN.floorY, z: node.z ?? 0 },
      car,
      node,
    });
    boss.phase = 1;
    return boss;
  }
}

export default EnemyManager;
