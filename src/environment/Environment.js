// -----------------------------------------------------------------------------
// Environment - the scrolling world around the train.
//
// The train stays at the origin while props, terrain textures and structures
// stream backwards at `speed`. Parallax factors give the distant ranges a
// slower apparent motion. This class is three.js free: it produces descriptors
// and mutates plain numbers.
// -----------------------------------------------------------------------------
import { RNG } from '../utils/RNG.js';
import { buildTerrain } from './Terrain.js';
import { buildProps, PROP_SCROLL, scrollSpan } from './Props.js';
import { createStructure } from './Structures.js';
import { dynamicGroup } from '../world/Primitives.js';

export class Environment {
  constructor(world, { seed = 9871, density = 1, journeyDistance = 3400 } = {}) {
    this.world = world;
    this.rng = new RNG(seed);
    this.journeyDistance = journeyDistance;

    /** static geometry (ground, rails, rivers, distant ranges) */
    this.staticParts = buildTerrain();
    /** scrolling instances */
    this.props = buildProps(seed, { density });
    /** scrolling landmark structures (dynamic groups) */
    this.structures = [];
    this.groups = [];
    this._structureId = 0;

    this.scroll = 0;
    this.groundScroll = 0;
    this.waterScroll = 0;
    this.distance = 0;
    this.dustTimer = 0;
    this.elapsed = 0;

    /** weather (0..1) */
    this.windStrength = 0.25;
    this.rain = 0;
    this.dustStorm = 0;

    /** darkness factor applied by the render layer when inside a tunnel */
    this.darkness = 0;
    this.activeTunnel = null;
    this.tunnelTimer = 0;
  }

  get span() {
    return scrollSpan();
  }

  /** Spawns a landmark ahead of the train. Returns the structure record. */
  spawnStructure(kind, { x = 560, opts = {}, parallax = 1, hazard = null } = {}) {
    const def = createStructure(kind, opts);
    const id = `struct_${kind}_${this._structureId++}`;
    const group = dynamicGroup(id, { x, y: 0, z: 0 }, def.parts);
    this.groups.push(group);
    const record = {
      id,
      kind,
      group,
      x,
      parallax,
      length: def.length,
      hazard: hazard ?? def.hazard,
      roofClearance: def.roofClearance ?? null,
      triggered: false,
      warned: false,
      dead: false,
    };
    this.structures.push(record);
    return record;
  }

  /** Removes a structure from the world (used when it falls behind). */
  removeStructure(record) {
    record.dead = true;
    const i = this.structures.indexOf(record);
    if (i >= 0) this.structures.splice(i, 1);
    const gi = this.groups.indexOf(record.group);
    if (gi >= 0) this.groups.splice(gi, 1);
  }

  /** Is the point inside the currently active tunnel bore? */
  updateTunnelState(trainMidX) {
    let inside = null;
    for (const s of this.structures) {
      if (s.kind !== 'tunnel') continue;
      const x0 = s.group.state.x;
      const x1 = x0 + s.length;
      if (trainMidX > x0 && trainMidX < x1) inside = s;
    }
    this.activeTunnel = inside;
    const target = inside ? 1 : 0;
    this.darkness += (target - this.darkness) * 0.06;
    return inside;
  }

  update(dt, train, effects, player) {
    this.elapsed += dt;
    const speed = train.speed;
    const move = speed * dt;
    this.distance += move;
    this.scroll += move;
    this.groundScroll += move;
    this.waterScroll += move * 0.9;

    // --- props ---------------------------------------------------------------
    const span = this.span;
    for (const p of this.props) {
      const step = move * (p.parallax ?? 1);
      p.x -= step;
      if (p.x < PROP_SCROLL.min) p.x += span;
    }

    // --- structures ----------------------------------------------------------
    for (let i = this.structures.length - 1; i >= 0; i--) {
      const s = this.structures[i];
      s.group.state.x -= move * s.parallax;
      if (s.group.state.x < PROP_SCROLL.min - 120) this.removeStructure(s);
    }

    // --- ambient particles ---------------------------------------------------
    if (effects) {
      // ballast dust kicked up by the wheels
      this.dustTimer -= dt;
      if (this.dustTimer <= 0) {
        this.dustTimer = 0.03;
        const car = train.carAt(this.rng.range(train.frontX, train.rearX));
        const x = car ? this.rng.range(car.x0, car.x1) : 60;
        effects.sim.spawn('dust', x, 0.25, this.rng.sign() * 1.6, {
          spreadX: 1.2,
          spreadY: 1.4,
          spreadZ: 0.8,
          vx: -speed * 0.35,
          vy: 0.7,
          life: 1.3,
          size: 1.1,
          alpha: 0.32,
        });
        // sparks off the rails
        if (this.rng.chance(0.10)) {
          effects.sim.sparkBurst(x, 0.12, this.rng.sign() * 0.72, 2, { speed: 2.2, life: 0.28, size: 0.09 });
        }
      }
    }

    // tunnel darkness
    const midX = (train.frontX + train.rearX) / 2;
    this.updateTunnelState(midX);

    // weather drift
    this.windStrength = 0.25 + 0.5 * this.dustStorm + 0.3 * this.rain;
  }

  /** Wind vector used by particles and the roof section. */
  windVec(speedNorm = 1) {
    return {
      x: -1.4 * speedNorm - this.windStrength * 2.2,
      y: this.dustStorm * 0.6 - this.rain * 0.2,
      z: (Math.sin(this.elapsed * 0.3) * 0.6 + this.windStrength) * -0.4,
    };
  }

  /** Prop instances grouped by kind (render layer builds one mesh per kind). */
  propsByKind() {
    const map = new Map();
    for (const p of this.props) {
      let arr = map.get(p.kind);
      if (!arr) {
        arr = [];
        map.set(p.kind, arr);
      }
      arr.push(p);
    }
    return map;
  }
}

export default Environment;
