// -----------------------------------------------------------------------------
// Particle simulation (pure logic, no three.js).
//
// Two pools: "soft" (alpha blended dust / smoke / steam) and "additive"
// (sparks, glow, muzzle flash). The renderer (fx/EffectsSystem.js) copies the
// active records into GPU buffers each frame - no allocations in the loop.
// -----------------------------------------------------------------------------
import { FlatPool } from '../utils/ObjectPool.js';
import { EFFECTS } from '../game/Config.js';

export const ParticleKind = {
  DUST: 'dust',
  SMOKE: 'smoke',
  STEAM: 'steam',
  SPARK: 'spark',
  EMBER: 'ember',
  DEBRIS: 'debris',
  LEAF: 'leaf',
  GLOW: 'glow',
  BLOOD: 'blood',
  RING: 'ring',
};

const DEFAULTS = {
  dust: { additive: false, size0: 0.7, size1: 2.6, life: [0.55, 1.25], gravity: -1.2, drag: 1.6, alpha: [0.55, 0], color: [0.86, 0.72, 0.52] },
  smoke: { additive: false, size0: 1.1, size1: 4.2, life: [1.4, 2.6], gravity: 0.6, drag: 0.7, alpha: [0.62, 0], color: [0.28, 0.24, 0.22] },
  steam: { additive: false, size0: 0.8, size1: 3.4, life: [0.9, 1.8], gravity: 1.4, drag: 1.0, alpha: [0.6, 0], color: [0.92, 0.92, 0.95] },
  spark: { additive: true, size0: 0.16, size1: 0.03, life: [0.18, 0.5], gravity: -22, drag: 1.1, alpha: [1, 0], color: [1.0, 0.72, 0.28] },
  ember: { additive: true, size0: 0.34, size1: 0.05, life: [0.5, 1.2], gravity: -7, drag: 1.6, alpha: [1, 0], color: [1.0, 0.5, 0.16] },
  debris: { additive: false, size0: 0.26, size1: 0.18, life: [0.7, 1.5], gravity: -18, drag: 0.25, alpha: [1, 0], color: [0.5, 0.42, 0.34] },
  leaf: { additive: false, size0: 0.34, size1: 0.24, life: [1.4, 2.8], gravity: -0.7, drag: 0.9, alpha: [0.95, 0], color: [0.78, 0.62, 0.35] },
  glow: { additive: true, size0: 1.6, size1: 3.2, life: [0.12, 0.3], gravity: 0, drag: 2.5, alpha: [1, 0], color: [1.0, 0.82, 0.5] },
  blood: { additive: false, size0: 0.22, size1: 0.1, life: [0.25, 0.6], gravity: -16, drag: 1.2, alpha: [0.9, 0], color: [0.45, 0.1, 0.09] },
  ring: { additive: true, size0: 2.0, size1: 7.0, life: [0.24, 0.5], gravity: 0, drag: 1.5, alpha: [0.9, 0], color: [1.0, 0.75, 0.4] },
};

export class ParticleSim {
  constructor(scale = 1) {
    this.scale = scale;
    const softCount = Math.floor(EFFECTS.maxParticles * 0.62);
    const addCount = EFFECTS.maxParticles - softCount;
    const factory = (i) => ({
      x: 0,
      y: 0,
      z: 0,
      px: 0,
      py: 0,
      pz: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 1,
      size0: 1,
      size1: 0,
      alpha0: 1,
      drag: 1,
      gravity: 0,
      kind: 'dust',
      r: 1,
      g: 1,
      b: 1,
      additive: false,
      rot: 0,
      spin: 0,
      wind: 1,
    });
    this.soft = new FlatPool(softCount, factory);
    this.additive = new FlatPool(addCount, factory);
    this.liveCount = 0;
  }

  get capacity() {
    return this.soft.capacity + this.additive.capacity;
  }

  /** Spawns one particle of `kind` at (x,y,z). Returns the record or null. */
  spawn(kind, x, y, z, opts = {}) {
    const def = DEFAULTS[kind] || DEFAULTS.dust;
    if (Math.random() > (opts.chance ?? 1)) return null;
    const pool = def.additive ? this.additive : this.soft;
    const p = pool.spawn();
    p.kind = kind;
    p.additive = def.additive;
    p.x = x + (opts.jx ?? 0) * (Math.random() * 2 - 1);
    p.y = y + (opts.jy ?? 0) * (Math.random() * 2 - 1);
    p.z = z + (opts.jz ?? 0) * (Math.random() * 2 - 1);
    const sp = opts.speed ?? 1;
    p.vx = (opts.vx ?? 0) + (opts.spreadX ?? 0) * (Math.random() * 2 - 1) * sp;
    p.vy = (opts.vy ?? 0) + (opts.spreadY ?? 0) * (Math.random() * 2 - 1) * sp;
    p.vz = (opts.vz ?? 0) + (opts.spreadZ ?? 0) * (Math.random() * 2 - 1) * sp;
    p.maxLife = opts.life ?? lerp(def.life[0], def.life[1], Math.random());
    p.life = p.maxLife;
    const sMul = opts.size ?? 1;
    p.size0 = (opts.size0 ?? def.size0) * sMul;
    p.size1 = (opts.size1 ?? def.size1) * sMul;
    p.alpha0 = opts.alpha ?? def.alpha[0];
    p.alphaEnd = opts.alphaEnd ?? def.alpha[1];
    p.drag = opts.drag ?? def.drag;
    p.gravity = opts.gravity ?? def.gravity;
    p.wind = opts.wind ?? 1;
    const col = opts.color ?? def.color;
    p.r = col[0];
    p.g = col[1];
    p.b = col[2];
    p.rot = opts.rot ?? Math.random() * Math.PI * 2;
    p.spin = opts.spin ?? (Math.random() - 0.5) * 3;
    return p;
  }

  update(dt, ctx = {}) {
    let live = 0;
    const wind = ctx.wind ?? 0;
    const windY = ctx.windY ?? 0;
    const update = (p) => {
      if (!p.active) return;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        return;
      }
      live++;
      const dragF = Math.max(0, 1 - p.drag * dt);
      p.vx *= dragF;
      p.vz *= dragF;
      p.vy = p.vy * dragF + p.gravity * dt;
      p.vx += wind * p.wind * dt;
      p.vy += windY * p.wind * dt;
      p.px = p.x;
      p.py = p.y;
      p.pz = p.z;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
    };
    this.soft.forEachActive(update);
    this.additive.forEachActive(update);
    this.liveCount = live;
  }

  clear() {
    this.soft.releaseAll();
    this.additive.releaseAll();
    this.liveCount = 0;
  }

  // --- authored bursts -------------------------------------------------------

  dustBurst(x, y, z, count = 6, opts = {}) {
    const n = Math.max(1, Math.round(count * this.scale));
    for (let i = 0; i < n; i++) {
      this.spawn(ParticleKind.DUST, x, y, z, {
        speed: opts.speed ?? 1,
        spreadX: opts.spread ?? 2.2,
        spreadY: opts.spreadY ?? 1.1,
        spreadZ: opts.spread ?? 1.6,
        vy: opts.vy ?? 1.4,
        jx: 0.3,
        jz: 0.3,
        life: opts.life,
        size: opts.size,
        ...opts,
      });
    }
  }

  smokePuff(x, y, z, count = 3, opts = {}) {
    const n = Math.max(1, Math.round(count * this.scale));
    for (let i = 0; i < n; i++) {
      this.spawn(ParticleKind.SMOKE, x, y, z, {
        spreadX: 0.8,
        spreadY: 0.5,
        spreadZ: 0.8,
        vy: 1.2,
        jx: 0.35,
        jz: 0.35,
        ...opts,
      });
    }
  }

  sparkBurst(x, y, z, count = 8, opts = {}) {
    const n = Math.max(1, Math.round(count * this.scale));
    for (let i = 0; i < n; i++) {
      this.spawn(ParticleKind.SPARK, x, y, z, {
        speed: opts.speed ?? 5,
        spreadX: opts.spread ?? 5,
        spreadY: opts.spread ?? 4,
        spreadZ: opts.spread ?? 3,
        jx: 0.06,
        jy: 0.06,
        jz: 0.06,
        ...opts,
      });
    }
  }

  steamJet(x, y, z, count = 4, opts = {}) {
    const n = Math.max(1, Math.round(count * this.scale));
    for (let i = 0; i < n; i++) {
      this.spawn(ParticleKind.STEAM, x, y, z, {
        spreadX: 1.6,
        spreadY: 2.4,
        spreadZ: 1.6,
        vy: opts.vy ?? 3.2,
        size: opts.size ?? 1,
        ...opts,
      });
    }
  }

  debrisBurst(x, y, z, count = 8, opts = {}) {
    const n = Math.max(1, Math.round(count * this.scale));
    for (let i = 0; i < n; i++) {
      this.spawn(ParticleKind.DEBRIS, x, y, z, {
        speed: opts.speed ?? 3,
        spreadX: 4,
        spreadY: 5,
        spreadZ: 4,
        ...opts,
      });
    }
  }

  impact(x, y, z, normalDir = null) {
    this.sparkBurst(x, y, z, 7, { speed: 3.6, spread: 3.4, life: 0.32 });
    this.dustBurst(x, y, z, 3, { spread: 1.2, life: 0.6, size: 0.55 });
    if (normalDir) {
      for (let i = 0; i < 3; i++) {
        this.spawn(ParticleKind.DUST, x, y, z, {
          spreadX: 1.2,
          spreadY: 1.2,
          spreadZ: 1.2,
          life: 0.7,
          size: 0.7,
        });
      }
    }
  }

  explosion(x, y, z, scale = 1) {
    this.spawn(ParticleKind.GLOW, x, y, z, { size0: 3.4 * scale, size1: 7 * scale, life: 0.22, alpha: 1 });
    this.spawn(ParticleKind.RING, x, y, z, { size0: 2 * scale, size1: 12 * scale, life: 0.4 });
    this.sparkBurst(x, y, z, 26, { speed: 9 * scale, spread: 8 * scale, life: 0.6 });
    this.smokePuff(x, y, z, 10, { size: 1.6 * scale, spreadX: 2.5 * scale, spreadY: 2.0 * scale, spreadZ: 2.5 * scale, vy: 2.6 });
    this.debrisBurst(x, y, z, 12, { speed: 5 * scale });
  }

  muzzleFlash(x, y, z, dirX, dirZ) {
    this.spawn(ParticleKind.GLOW, x, y, z, { size0: 1.15, size1: 0.2, life: 0.09, alpha: 1 });
    for (let i = 0; i < 6; i++) {
      this.spawn(ParticleKind.SPARK, x, y, z, {
        vx: dirX * 9,
        vz: dirZ * 9,
        spreadX: 2.4,
        spreadY: 1.6,
        spreadZ: 2.4,
        life: 0.16,
        size: 0.12,
      });
    }
  }

  bloodHit(x, y, z, dirX = 0, dirZ = 0) {
    for (let i = 0; i < 6; i++) {
      this.spawn(ParticleKind.BLOOD, x, y, z, {
        vx: dirX * 2.5,
        vz: dirZ * 2.5,
        spreadX: 2.2,
        spreadY: 1.6,
        spreadZ: 2.2,
      });
    }
  }

  windDrift(x, y, z, windStrength) {
    if (Math.random() > 0.45) return;
    this.spawn(ParticleKind.LEAF, x, y, z, {
      vx: windStrength * 0.55,
      vy: 0.5,
      vz: (Math.random() - 0.5) * 1.4,
      size: 0.55,
    });
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export default ParticleSim;
