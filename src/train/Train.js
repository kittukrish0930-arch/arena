// -----------------------------------------------------------------------------
// Train - owns the consist, the wheels and every animated train part.
//
// The train never actually moves: the environment scrolls past it at `speed`
// and gameplay stays near the world origin (classic treadmill trick), which
// keeps float precision and collision stable over a long run.
//
// This class is three.js free: it exposes geometry descriptors (`parts`),
// animated part groups (`groups`) and plain state that the render layer reads.
// -----------------------------------------------------------------------------
import { TRAIN } from '../game/Config.js';
import { box, cyl } from '../world/Primitives.js';
import { generateTrain, buildConsistSpec, findCarByType } from './TrainGenerator.js';

export class Train {
  constructor(world) {
    this.world = world;
    this.spec = buildConsistSpec();
    this.cars = generateTrain(world, this.spec);

    /** static geometry descriptors in world space */
    this.parts = [];
    for (const car of this.cars) this.parts.push(...car.parts);

    /** dynamic part groups */
    this.groups = [];
    for (const car of this.cars) this.groups.push(...car.groups);
    this.groupsById = new Map(this.groups.map((g) => [g.id, g]));

    this.rearX = Math.min(...this.cars.map((c) => c.x0));
    this.frontX = Math.max(...this.cars.map((c) => c.x1));
    this.length = this.frontX - this.rearX;

    this.baseSpeed = TRAIN.baseSpeed;
    this.speed = TRAIN.baseSpeed;
    this.targetSpeed = TRAIN.baseSpeed;
    this.wheelAngle = 0;
    this.wheelPositions = [];
    for (const car of this.cars) {
      for (const bx of [2.4, car.length - 2.4]) {
        for (const bz of [-0.78, 0.78]) this.wheelPositions.push({ x: car.wx(bx), y: 0.46, z: bz });
      }
    }

    this._buildCouplers();
    this._addDecor();

    this.caboose = findCarByType(this.cars, 'caboose');
    this.vaultCar = findCarByType(this.cars, 'vault');
    this.armoredCar = findCarByType(this.cars, 'armored');
    this.flatCar = findCarByType(this.cars, 'flatcar');
    this.passengerCar = findCarByType(this.cars, 'passenger');
    this.locomotive = findCarByType(this.cars, 'loco');
    const cargoCars = this.cars.filter((c) => c.type === 'cargo');
    this.boxCar = cargoCars[0] || null; // the first cargo car after the caboose
    this.bombCar = cargoCars[cargoCars.length - 1] || null; // the explosive one


    this.doorAnimations = [];
    this.elapsed = 0;
    this.smokeTimer = 0;
    this.steamTimer = 0;
  }

  _buildCouplers() {
    for (let i = 0; i < this.cars.length - 1; i++) {
      const a = this.cars[i];
      const b = this.cars[i + 1];
      const x0 = a.x1;
      const x1 = b.x0;
      const mid = (x0 + x1) / 2;
      const len = x1 - x0 + 0.5;
      this.parts.push(box('ironDark', mid, 0.95, 0, len, 0.16, 0.24));
      for (const side of [-0.55, 0.55]) {
        this.parts.push(cyl('ironDark', mid, 0.98, side, 0.22, 0.14, { axis: 'x' }));
      }
      this.parts.push(box('ironDark', mid, 0.72, 0.42, len, 0.05, 0.05));
      this.parts.push(box('ironDark', mid, 0.72, -0.42, len, 0.05, 0.05));
      // safety chains + hand grips between cars
      this.parts.push(cyl('trim', mid, 3.4, 1.55, 0.03, len, { axis: 'x' }));
      this.parts.push(cyl('trim', mid, 3.4, -1.55, 0.03, len, { axis: 'x' }));
    }
  }

  /** Roof signals, vents and piping that make the consist read as a real train. */
  _addDecor() {
    for (const car of this.cars) {
      if (!car.hasRoof) continue;
      const y = car.roofSurfaceY;
      // roof-mounted brake wheel at one end
      this.parts.push(cyl('ironDark', car.x0 + 0.7, y + 0.35, -1.1, 0.05, 0.7));
      this.parts.push(box('ironDark', car.x0 + 0.7, y + 0.7, -1.1, 0.45, 0.12, 0.12));
      // vents
      this.parts.push(box('iron', car.x0 + car.length * 0.5, y + 0.22, 0.6, 0.6, 0.4, 0.6));
      this.parts.push(cyl('iron', car.x1 - 1.1, y + 0.2, 0.9, 0.18, 0.44));
    }
  }

  // ---------------------------------------------------------------------------
  // queries
  // ---------------------------------------------------------------------------

  get speedNorm() {
    return Math.min(1.4, this.speed / 40);
  }

  carAt(x) {
    for (const car of this.cars) {
      if (x >= car.x0 && x <= car.x1) return car;
    }
    let best = this.cars[0];
    let bestD = Infinity;
    for (const car of this.cars) {
      const d = Math.min(Math.abs(x - car.x0), Math.abs(x - car.x1));
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  carIndexAt(x) {
    return this.carAt(x).index;
  }

  isBetweenCars(x) {
    for (let i = 0; i < this.cars.length - 1; i++) {
      if (x > this.cars[i].x1 && x < this.cars[i + 1].x0) return true;
    }
    return x > this.frontX + 0.1 || x < this.rearX - 0.1;
  }

  /** True when the point is inside an enclosed car interior. */
  isInsideCar(x, y, z) {
    if (y < TRAIN.floorY - 0.8 || y > TRAIN.roofY + 0.2) return false;
    for (const car of this.cars) {
      if (!car.hasRoof) continue;
      if (x >= car.x0 && x <= car.x1 && Math.abs(z) < TRAIN.halfWidth + 0.1) return true;
    }
    return false;
  }

  /** True when the player is exposed on top of the train. */
  isOnRoof(x, y) {
    return y > TRAIN.floorY + 2.6;
  }

  nodesByRole(...roles) {
    const out = [];
    for (const car of this.cars) {
      for (const n of car.spawnNodes) {
        if (roles.length === 0 || roles.includes(n.role)) out.push({ ...n, car });
      }
    }
    return out;
  }

  allNodes() {
    return this.nodesByRole();
  }

  allInteractables() {
    const out = [];
    for (const car of this.cars) for (const i of car.interactables) out.push({ ...i, car });
    return out;
  }

  getLockedDoors() {
    const out = [];
    for (const car of this.cars) {
      if (car.doorFront?.locked) out.push({ car, door: car.doorFront });
      if (car.doorBack?.locked) out.push({ car, door: car.doorBack });
    }
    return out;
  }

  /** Pooled interior light slots for the render layer. */
  getLightSlots(playerPos, count = 3) {
    const out = [];
    if (!playerPos) return out;
    const idx = this.cars.indexOf(this.carAt(playerPos.x));
    for (let i = 0; i < count; i++) {
      const car = this.cars[Math.max(0, Math.min(this.cars.length - 1, idx + i - 1))];
      if (!car.lights.length) continue;
      const l = car.lights[i % car.lights.length];
      out.push({ x: l.x, y: l.y, z: l.z, color: l.color, intensity: playerPos.y < TRAIN.roofY - 0.2 ? 6.5 : 1.2 });
    }
    return out;
  }

  group(id) {
    return this.groupsById.get(id) || null;
  }

  // ---------------------------------------------------------------------------
  // animation
  // ---------------------------------------------------------------------------

  /** Slides a door open and clears its collider. */
  openDoor(doorInfo, duration = 1.1) {
    if (!doorInfo || doorInfo.opening || doorInfo.open) return false;
    doorInfo.opening = true;
    doorInfo.open = true;
    if (doorInfo.state) {
      this.doorAnimations.push({
        kind: 'door',
        state: doorInfo.state,
        t: 0,
        duration,
        from: { z: doorInfo.state.z },
        to: { z: doorInfo.state.z + doorInfo.width * 0.95 },
      });
    }
    if (doorInfo.collider) {
      this.world.remove(doorInfo.collider);
      doorInfo.collider = null;
    }
    return true;
  }

  /** Registers a raw tween on a dynamic group state (used by the vault cinematic). */
  tweenGroup(group, to, duration, delay = 0) {
    if (!group) return null;
    const anim = {
      kind: 'tween',
      state: group.state,
      t: -delay,
      duration,
      from: { x: group.state.x, y: group.state.y, z: group.state.z, rx: group.state.rx, ry: group.state.ry, rz: group.state.rz },
      to,
    };
    this.doorAnimations.push(anim);
    return anim;
  }

  update(dt, effects, playerPos) {
    this.elapsed += dt;
    this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * 0.8);
    this.wheelAngle -= (this.speed / 0.46) * dt;

    for (let i = this.doorAnimations.length - 1; i >= 0; i--) {
      const a = this.doorAnimations[i];
      a.t += dt;
      if (a.t < 0) continue;
      const t = Math.min(1, a.t / a.duration);
      const e = t * t * (3 - 2 * t);
      if (a.kind === 'door') {
        a.state.z = a.from.z + (a.to.z - a.from.z) * e;
      } else {
        for (const key of ['x', 'y', 'z', 'rx', 'ry', 'rz']) {
          if (a.to[key] === undefined) continue;
          a.state[key] = a.from[key] + (a.to[key] - a.from[key]) * e;
        }
      }
      if (t >= 1) {
        a.onComplete?.();
        this.doorAnimations.splice(i, 1);
      }
    }

    // chimney smoke + steam while rolling
    if (effects) {
      const loco = this.locomotive;
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.055;
        effects.sim.smokePuff(loco.wx(2.5), 5.5, 0, 1, {
          size: 1.05,
          vy: 1.8,
          vx: -1.2 * this.speedNorm,
          vz: -0.8 * this.speedNorm,
          life: 2.8,
          spreadX: 0.4,
          spreadZ: 0.35,
        });
      }
      this.steamTimer -= dt;
      if (this.steamTimer <= 0) {
        this.steamTimer = 0.34;
        effects.sim.steamJet(loco.wx(4.6), 1.7, -1.25, 2, { size: 0.85, vy: 1.1, vx: -1.0 * this.speedNorm });
      }
    }
  }
}

export default Train;
