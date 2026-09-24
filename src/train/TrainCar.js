// -----------------------------------------------------------------------------
// TrainCar - data driven construction of one rail car.
//
// A car builds three things:
//   1. `parts`      - static primitive descriptors (rendered as instanced meshes)
//   2. `groups`     - dynamic part groups (doors, vault mechanism) with mutable
//                     transform state that gameplay animates
//   3. collision boxes registered in the CollisionWorld
//
// Coordinates are "train space": x runs forward along the consist (car local x
// in [0, length], absolute x = x0 + local), y is up (rail head at 0), z across.
// -----------------------------------------------------------------------------
import { TRAIN } from '../game/Config.js';
import { box, cyl, sphere, cone, plane, torus, dynamicGroup } from '../world/Primitives.js';

const HALF_W = TRAIN.halfWidth;
const WALL_T = TRAIN.wallThickness;
const INNER_Z = HALF_W - WALL_T / 2;
const FLOOR_Y = TRAIN.floorY;
const CEIL_Y = FLOOR_Y + 2.6;
const ROOF_Y = TRAIN.roofY;

export class TrainCar {
  constructor(spec, x0, world) {
    this.spec = spec;
    this.type = spec.type;
    this.index = spec.index;
    this.name = spec.name || spec.type;
    this.length = spec.length;
    this.x0 = x0;
    this.x1 = x0 + spec.length;
    this.world = world;

    /** @type {Array<object>} static primitive descriptors (absolute x) */
    this.parts = [];
    /** @type {Array<object>} dynamic part groups */
    this.groups = [];
    this.colliders = [];
    this.ladders = [];
    this.lights = [];
    this.interactables = [];
    this.spawnNodes = [];
    this.explosiveBarrels = [];
    this.dynamics = {};

    this.openTop = false;
    this.hasRoof = true;
    this.floorSurfaceY = spec.floorY ?? FLOOR_Y;
    this.roofSurfaceY = ROOF_Y;
    this.doorFront = null;
    this.doorBack = null;
  }

  wx(localX) {
    return this.x0 + localX;
  }

  build() {
    const b = this._builder();
    switch (this.type) {
      case 'loco':
        this.buildLocomotive(b);
        break;
      case 'tender':
        this.buildTender(b);
        break;
      case 'vault':
        this.buildVault(b);
        break;
      case 'armored':
        this.buildArmored(b);
        break;
      case 'flatcar':
        this.buildFlatcar(b);
        break;
      case 'passenger':
        this.buildPassenger(b);
        break;
      case 'caboose':
        this.buildCaboose(b);
        break;
      case 'cargo':
      default:
        this.buildCargo(b);
        break;
    }
    this.buildUnderframe(b);
    for (const c of this.colliders) this.world.add(c);
    return this;
  }

  // ---------------------------------------------------------------------------
  // builder helpers
  // ---------------------------------------------------------------------------

  _builder() {
    const push = (part) => {
      if (part) this.parts.push(part);
      return part;
    };
    const k = { box, cyl, sphere, cone, plane, torus, dynamicGroup, push };
    return {
      /** box(material, localX, y, z, sx, sy, sz, {collide, surface, tag, data, ...}) */
      box: (m, x, y, z, sx, sy, sz, o = {}) => {
        push(box(m, this.wx(x), y, z, sx, sy, sz, o));
        if (o.collide) this.colliders.push(this._collider(x, y, z, sx, sy, sz, o));
      },
      /** box in absolute coordinates (used by helper methods that already converted) */
      boxAbs: (m, x, y, z, sx, sy, sz, o = {}) => push(box(m, x, y, z, sx, sy, sz, o)),
      cyl: (m, x, y, z, r, len, o = {}) => push(cyl(m, this.wx(x), y, z, r, len, o)),
      cylAbs: (m, x, y, z, r, len, o = {}) => push(cyl(m, x, y, z, r, len, o)),
      sphere: (m, x, y, z, r, o = {}) => push(sphere(m, this.wx(x), y, z, r, o)),
      cone: (m, x, y, z, r, h, o = {}) => push(cone(m, this.wx(x), y, z, r, h, o)),
      plane: (m, x, y, z, sx, sy, o = {}) => push(plane(m, this.wx(x), y, z, sx, sy, o)),
      group: (g) => {
        this.groups.push(g);
        return g;
      },
      k,
    };
  }

  _collider(localX, y, z, sx, sy, sz, o) {
    return {
      minX: this.wx(localX) - sx / 2,
      maxX: this.wx(localX) + sx / 2,
      minY: y - sy / 2,
      maxY: y + sy / 2,
      minZ: z - sz / 2,
      maxZ: z + sz / 2,
      solid: o.solid !== false,
      surface: o.surface !== false,
      tag: o.tag || 'train',
      owner: this,
      data: o.data || null,
    };
  }

  /** Adds a collider in absolute coordinates. */
  _colliderAbs(x, y, z, sx, sy, sz, o = {}) {
    return this._collider(x - this.x0, y, z, sx, sy, sz, o);
  }

  addFloor(b, { x0 = 0, x1 = null, y = FLOOR_Y, thickness = 0.28, width = HALF_W * 2, key = 'trainBodyDark', tag = 'floor' } = {}) {
    const x1r = x1 ?? this.length;
    const cx = (x0 + x1r) / 2;
    b.box(key, cx, y - thickness / 2, 0, x1r - x0, thickness, width, {
      collide: true,
      tag,
      surface: true,
      data: { car: this, surfaceY: y },
    });
    for (let x = x0 + 0.6; x < x1r; x += 1.6) {
      b.box('iron', x, y + 0.012, 0, 0.08, 0.02, width - 0.1);
    }
  }

  addRoof(b, { x0 = 0, x1 = null, y = ROOF_Y, thickness = 0.22, opening = null } = {}) {
    const x1r = x1 ?? this.length;
    const key = this.type === 'armored' || this.type === 'vault' ? 'armorPlate' : 'trainBody';
    const zSpan = HALF_W * 2 + 0.12;
    const roofBox = (cx, w, cz = 0, wz = zSpan) => {
      if (w < 0.02 || wz < 0.02) return;
      b.box(key, cx, y - thickness / 2, cz, w, thickness, wz, {
        collide: true,
        tag: 'roof',
        data: { car: this, surfaceY: y },
      });
    };
    if (!opening) {
      roofBox((x0 + x1r) / 2, x1r - x0);
    } else {
      const [ox0, ox1, oz0, oz1] = opening;
      const zHalf = zSpan / 2;
      roofBox((x0 + ox0) / 2, ox0 - x0);
      roofBox((ox1 + x1r) / 2, x1r - ox1);
      roofBox((ox0 + ox1) / 2, ox1 - ox0, -zHalf + (oz0 + zHalf) / 2, oz0 + zHalf);
      roofBox((ox0 + ox1) / 2, ox1 - ox0, zHalf - (zHalf - oz1) / 2, zHalf - oz1);
      // hatch lip
      const lipY = y + 0.05;
      b.box('iron', (ox0 + ox1) / 2, lipY, oz0, ox1 - ox0, 0.1, 0.12);
      b.box('iron', (ox0 + ox1) / 2, lipY, oz1, ox1 - ox0, 0.1, 0.12);
      b.box('iron', ox0, lipY, (oz0 + oz1) / 2, 0.12, 0.1, oz1 - oz0);
      b.box('iron', ox1, lipY, (oz0 + oz1) / 2, 0.12, 0.1, oz1 - oz0);
    }
    b.box('woodDark', (x0 + x1r) / 2, y + 0.06, 0, x1r - x0, 0.06, 0.5);
    for (let x = x0 + 1.4; x < x1r - 0.6; x += 2.4) {
      b.box('iron', x, y + 0.16, -1.05, 0.5, 0.22, 0.5, { ry: 0.2 });
      b.box('iron', x + 1.2, y + 0.14, 1.05, 0.4, 0.18, 0.4, { ry: -0.3 });
    }
  }

  addWindowWall(b, side, { x0 = 0, x1 = null, windows = [], sillY = 1.95, headY = 3.15, key = 'trainBody', glassKey = 'glass' } = {}) {
    const x1r = x1 ?? this.length;
    const z = INNER_Z * side;
    const wallLen = x1r - x0;
    const midX = (x0 + x1r) / 2;
    b.box(key, midX, (FLOOR_Y + sillY) / 2, z, wallLen, sillY - FLOOR_Y, WALL_T, { collide: true, tag: 'wall' });
    if (headY < CEIL_Y) {
      b.box(key, midX, (headY + CEIL_Y) / 2, z, wallLen, CEIL_Y - headY, WALL_T, { collide: true, tag: 'wall' });
    }
    let cursor = x0;
    for (const w of windows) {
      const wStart = w.x - w.width / 2;
      const wEnd = w.x + w.width / 2;
      if (wStart - cursor > 0.02) {
        b.box(key, (cursor + wStart) / 2, (FLOOR_Y + CEIL_Y) / 2, z, wStart - cursor, CEIL_Y - FLOOR_Y, WALL_T, {
          collide: true,
          tag: 'wall',
        });
      }
      b.plane(glassKey, w.x, (sillY + headY) / 2, z, w.width, headY - sillY, { ry: side > 0 ? 0 : Math.PI });
      b.box('ironDark', w.x, sillY, z, w.width + 0.06, 0.06, WALL_T + 0.04);
      b.box('ironDark', w.x, headY, z, w.width + 0.06, 0.06, WALL_T + 0.04);
      cursor = wEnd;
    }
    if (x1r - cursor > 0.02) {
      b.box(key, (cursor + x1r) / 2, (FLOOR_Y + CEIL_Y) / 2, z, x1r - cursor, CEIL_Y - FLOOR_Y, WALL_T, {
        collide: true,
        tag: 'wall',
      });
    }
  }


  /**
   * The camera-facing side of an enclosed car: a low sill plus slim pillars.
   * Keeps the car readable from the cinematic 2.5D camera (no wall blocking the
   * player) while still reading as a solid rail car from the outside.
   */
  addOpenSide(b, { x0 = 0, x1 = null, sillTop = FLOOR_Y + 0.78, spacing = 3.1, key = 'trainBody' } = {}) {
    const x1r = x1 ?? this.length;
    const z = INNER_Z;
    b.box(key, (x0 + x1r) / 2, (FLOOR_Y + sillTop) / 2, z, x1r - x0, sillTop - FLOOR_Y, WALL_T, {
      collide: true,
      tag: 'wall',
    });
    for (let x = x0 + 0.6; x < x1r - 0.2; x += spacing) {
      b.box(key, x, (FLOOR_Y + CEIL_Y) / 2, z, 0.28, CEIL_Y - FLOOR_Y, WALL_T, { collide: true, tag: 'wall' });
    }
    // horizontal belt rail at the top of the sill for detail
    b.box('ironDark', (x0 + x1r) / 2, sillTop + 0.05, z, x1r - x0, 0.1, WALL_T + 0.06);
  }

  addWall(b, side, { x0 = 0, x1 = null, y0 = FLOOR_Y, y1 = CEIL_Y, key = 'trainBody', tag = 'wall', collide = true } = {}) {
    const x1r = x1 ?? this.length;
    const z = INNER_Z * side;
    b.box(key, (x0 + x1r) / 2, (y0 + y1) / 2, z, x1r - x0, y1 - y0, WALL_T, { collide, tag });
  }

  /**
   * End wall with a doorway.
   * @param {number|'front'|'back'} which local x, or the car ends
   * @param {object} door {width, height, center, open, locked}
   */
  addEndWall(b, which, door = {}) {
    const xLocal = typeof which === 'number' ? which : which === 'front' ? this.length : 0;
    const x = this.wx(xLocal);
    const key = this.type === 'armored' || this.type === 'vault' ? 'armorPlateDark' : 'trainBodyDark';
    const t = TRAIN.endWallThickness;
    const dw = door.width ?? 1.25;
    const dh = door.height ?? 2.25;
    const dz = door.center ?? 0;
    const doorMin = dz - dw / 2;
    const doorMax = dz + dw / 2;

    if (doorMin > -HALF_W + 0.02) {
      const w = doorMin + HALF_W;
      b.box(key, xLocal, (FLOOR_Y + CEIL_Y) / 2, -HALF_W + w / 2, t, CEIL_Y - FLOOR_Y, w, { collide: true, tag: 'wall' });
    }
    if (doorMax < HALF_W - 0.02) {
      const w = HALF_W - doorMax;
      b.box(key, xLocal, (FLOOR_Y + CEIL_Y) / 2, doorMax + w / 2, t, CEIL_Y - FLOOR_Y, w, { collide: true, tag: 'wall' });
    }
    b.box(key, xLocal, (FLOOR_Y + dh + CEIL_Y) / 2, dz, t, CEIL_Y - FLOOR_Y - dh, dw + 0.24, { collide: true, tag: 'wall' });
    b.box('trim', xLocal, (FLOOR_Y + dh + 0.05) / 2, doorMin - 0.04, t + 0.06, dh + 0.1, 0.09);
    b.box('trim', xLocal, (FLOOR_Y + dh + 0.05) / 2, doorMax + 0.04, t + 0.06, dh + 0.1, 0.09);
    b.box('trim', xLocal, FLOOR_Y + dh + 0.04, dz, t + 0.06, 0.1, dw + 0.2);

    const info = { x, localX: xLocal, z: dz, width: dw, height: dh, which, open: !!door.open, locked: !!door.locked, state: null, collider: null, groupId: null };
    if (door.locked || door.open === false) {
      const mat = door.locked ? 'armorPlate' : 'woodDark';
      const g = dynamicGroup(`door_${this.index}_${xLocal.toFixed(2)}`, { x, y: FLOOR_Y + dh / 2, z: dz }, [
        box(mat, 0, 0, 0, t + 0.05, dh, dw),
        box('trim', door.locked ? 0.16 : -0.16, 0, 0, 0.04, dh * 0.8, dw * 0.85),
      ]);
      b.group(g);
      info.groupId = g.id;
      info.state = g.state;
      info.collider = this.world.add({
        minX: x - t / 2 - 0.03,
        maxX: x + t / 2 + 0.03,
        minY: FLOOR_Y,
        maxY: FLOOR_Y + dh,
        minZ: dz - dw / 2,
        maxZ: dz + dw / 2,
        tag: 'door',
        owner: this,
        surface: false,
      });
    }
    if (which === 'front') this.doorFront = info;
    else if (which === 'back') this.doorBack = info;
    else this.doorMid = info;
    return info;
  }

  /** Climbable ladder (also used to get back on the train after a fall). */
  addLadder(b, { localX, side = 1, top = ROOF_Y, bottom = FLOOR_Y, tag = 'ladder', outer = true }) {
    const z = outer ? (HALF_W + 0.16) * side : (HALF_W - 0.4) * side;
    const h = top - bottom;
    b.cyl('iron', localX, bottom + h / 2, z, 0.045, h, { hi: true });
    b.cyl('iron', localX, bottom + h / 2, z - 0.32 * side, 0.045, h, { hi: true });
    const rungs = Math.max(2, Math.floor(h / 0.42));
    for (let i = 0; i <= rungs; i++) {
      const y = bottom + (h * i) / rungs;
      b.cyl('iron', localX, y, z - 0.16 * side, 0.035, 0.34, { axis: 'z', hi: true });
    }
    const climbBox = this.world.add({
      minX: this.wx(localX) - 0.6,
      maxX: this.wx(localX) + 0.6,
      minY: bottom - 0.2,
      maxY: top + 0.35,
      minZ: Math.min(z, z - 0.4 * side) - 0.4,
      maxZ: Math.max(z, z - 0.4 * side) + 0.4,
      solid: false,
      surface: false,
      tag,
      owner: this,
      data: { top, bottom, car: this, side },
    });
    this.ladders.push(climbBox);
    return climbBox;
  }

  addLamps(b, { localX, y = CEIL_Y - 0.16, z = 0 } = {}) {
    for (const x of localX) {
      b.box('iron', x, CEIL_Y - 0.03, z, 0.5, 0.06, 0.5);
      b.box('lampGlass', x, y, z, 0.3, 0.14, 0.3);
      this.lights.push({ x: this.wx(x), y: y - 0.25, z, color: 0xffca7a });
    }
  }

  /** Cargo crate: solid, shootable-looking, occasionally holds loot. */
  addCrate(b, { x, y = FLOOR_Y, z = 0, size = 1.0, key = 'wood', tag = 'crate', loot = null }) {
    const s = size;
    b.box(key, x, y + s / 2, z, s, s, s, { collide: true, tag, data: { car: this, loot, surfaceY: y + s } });
    b.box('woodDark', x, y + s * 0.72, z, s * 1.02, 0.07, s * 1.02);
    b.box('woodDark', x, y + s * 0.26, z, s * 1.02, 0.07, s * 1.02);
    if (loot) {
      const lootDef = LOOT_TABLE[loot] || LOOT_TABLE.money;
      this.interactables.push({
        type: 'loot',
        x: this.wx(x),
        y: y + s * 0.9,
        z,
        radius: 1.6,
        loot: { ...lootDef, id: `loot_${this.index}_${x.toFixed(1)}_${z.toFixed(1)}` },
        taken: false,
      });
    }
  }

  addBarrel(b, { x, y = FLOOR_Y, z = 0, explosive = false, radius = 0.34, height = 0.95 }) {
    const key = explosive ? 'explosive' : Math.abs(x) % 2 < 1 ? 'barrelRed' : 'barrelGreen';
    b.cyl(key, x, y + height / 2, z, radius, height, { hi: true });
    b.cyl('ironDark', x, y + height * 0.25, z, radius * 1.05, 0.06);
    b.cyl('ironDark', x, y + height * 0.75, z, radius * 1.05, 0.06);
    const boxRef = this.world.add({
      minX: this.wx(x) - radius,
      maxX: this.wx(x) + radius,
      minY: y,
      maxY: y + height,
      minZ: z - radius,
      maxZ: z + radius,
      tag: explosive ? 'explosiveBarrel' : 'barrel',
      owner: this,
      data: { car: this, explosive, x: this.wx(x), y: y + height / 2, z, alive: true },
    });
    if (explosive) this.explosiveBarrels.push({ box: boxRef, x: this.wx(x), y: y + height / 2, z });
    return boxRef;
  }

  addHandrail(b, { x0, x1, z, y = CEIL_Y + 0.15 }) {
    b.cyl('trim', (x0 + x1) / 2, y, z, 0.035, x1 - x0, { axis: 'x', hi: true });
    for (let x = x0 + 0.4; x < x1; x += 1.4) {
      b.cyl('trim', x, y - 0.35, z, 0.03, 0.7);
      b.cyl('trim', x, y - 0.7, 0, 0.03, Math.abs(z) * 2, { axis: 'z' });
    }
  }

  addSideDoors(b, side, { localX, width = 1.3, height = 2.1, key = 'woodDark' }) {
    const z = INNER_Z * side;
    b.box(key, localX, FLOOR_Y + height / 2, z + 0.02 * side, width, height, 0.06);
    b.box('ironDark', localX, FLOOR_Y + height * 0.62, z + 0.04 * side, width * 0.9, 0.07, 0.05);
  }

  buildUnderframe(b) {
    const L = this.length;
    b.box('ironDark', L / 2, 0.78, 0, L, 0.34, HALF_W * 1.7, { collide: true, tag: 'chassis', surface: false });
    for (const bx of [2.4, L - 2.4]) {
      b.box('ironDark', bx, 0.62, 0, 2.6, 0.3, 1.9, { collide: true, tag: 'bogie', surface: false });
      b.box('iron', bx, 0.5, 0, 3.0, 0.12, 2.0);
      b.box('rust', bx, 0.55, 1.02, 1.6, 0.5, 0.12);
      b.box('rust', bx, 0.55, -1.02, 1.6, 0.5, 0.12);
    }
    b.cyl('rust', L * 0.5, 0.62, -1.15, 0.22, 1.5, { axis: 'x' });
    b.cyl('ironDark', L * 0.32, 0.6, 1.1, 0.16, 1.2, { axis: 'x' });
  }

  // ---------------------------------------------------------------------------
  // car types
  // ---------------------------------------------------------------------------

  buildCargo(b) {
    const L = this.length;
    this.addFloor(b);
    const windows = [{ x: L * 0.28, width: 1.0 }, { x: L * 0.72, width: 1.0 }];
    this.addWindowWall(b, -1, { x0: 0, x1: L, windows, sillY: 2.6, headY: 3.35 });
    this.addOpenSide(b, { x0: 0, x1: L, sillTop: FLOOR_Y + 0.8 });
    this.addEndWall(b, 'back', { open: true, width: 1.3 });
    this.addEndWall(b, 'front', { open: true, width: 1.3 });
    this.addRoof(b, { opening: [L * 0.42, L * 0.62, -0.7, 0.7] });
    this.addHandrail(b, { x0: 0.5, x1: L - 0.5, z: HALF_W + 0.08 });
    this.addHandrail(b, { x0: 0.5, x1: L - 0.5, z: -HALF_W - 0.08 });
    this.addLamps(b, { localX: [L * 0.3, L * 0.7] });
    this.addLadder(b, { localX: L * 0.52, side: -1, top: ROOF_Y, bottom: FLOOR_Y, outer: false, tag: 'roofLadder' });

    this.addCrate(b, { x: L * 0.22, z: -0.7, size: 1.1, loot: 'money' });
    this.addCrate(b, { x: L * 0.22, y: FLOOR_Y + 1.1, z: -0.7, size: 0.8 });
    this.addCrate(b, { x: L * 0.34, z: 0.95, size: 1.0, key: 'crateBlue' });
    this.addCrate(b, { x: L * 0.78, z: -0.95, size: 1.0, key: 'crateBlue' });
    this.addCrate(b, { x: L * 0.86, z: 0.8, size: 1.15, loot: 'jewelry' });
    this.addBarrel(b, { x: L * 0.55, z: 1.1, explosive: true });
    this.addBarrel(b, { x: L * 0.6, z: -1.15 });
    this.addBarrel(b, { x: L * 0.48, z: -1.1 });
  }

  buildPassenger(b) {
    const L = this.length;
    this.addFloor(b, { key: 'woodDark' });
    const windows = [];
    for (let i = 0; i < 6; i++) windows.push({ x: 1.6 + i * 1.85, width: 1.15 });
    this.addWindowWall(b, -1, { x0: 0, x1: L, windows, sillY: 2.05, headY: 3.2 });
    this.addOpenSide(b, { x0: 0, x1: L, sillTop: FLOOR_Y + 0.7, spacing: 2.9 });
    this.addEndWall(b, 'back', { open: true, width: 1.28 });
    this.addEndWall(b, 'front', { open: true, width: 1.28 });
    this.addRoof(b, { opening: [L * 0.45, L * 0.62, -0.65, 0.65] });
    this.addHandrail(b, { x0: 0.6, x1: L - 0.6, z: HALF_W + 0.08 });
    this.addHandrail(b, { x0: 0.6, x1: L - 0.6, z: -HALF_W - 0.08 });
    this.addLamps(b, { localX: [L * 0.25, L * 0.5, L * 0.75] });
    this.addLadder(b, { localX: L * 0.53, side: 1, top: ROOF_Y, bottom: FLOOR_Y, outer: false, tag: 'roofLadder' });

    for (let i = 0; i < 5; i++) {
      const x = 1.9 + i * 2.2;
      for (const side of [-1, 1]) {
        b.box('wood', x, FLOOR_Y + 0.28, side * 0.95, 1.7, 0.16, 0.85, {
          collide: true,
          tag: 'bench',
          data: { car: this, surfaceY: FLOOR_Y + 0.36 },
        });
        b.box('woodDark', x, FLOOR_Y + 0.6, side * 1.3, 1.7, 0.66, 0.14);
        b.box('ironDark', x - 0.7, FLOOR_Y + 0.14, side * 0.95, 0.1, 0.28, 0.8);
        b.box('ironDark', x + 0.7, FLOOR_Y + 0.14, side * 0.95, 0.1, 0.28, 0.8);
      }
    }
    for (let i = 0; i < 5; i++) {
      const x = 2.4 + i * 2.2;
      b.box('woodDark', x, CEIL_Y - 0.55, 1.24, 2.0, 0.08, 0.5);
      b.box('woodDark', x, CEIL_Y - 0.55, -1.24, 2.0, 0.08, 0.5);
      b.box('woodDark', x, CEIL_Y - 0.28, 1.5, 2.0, 0.5, 0.05);
      b.box('woodDark', x, CEIL_Y - 0.28, -1.5, 2.0, 0.5, 0.05);
    }
    this.addCrate(b, { x: 1.0, z: 0.9, size: 0.75, loot: 'documents' });
    this.addCrate(b, { x: L - 1.2, z: -0.9, size: 0.8, loot: 'money' });
    this.addSideDoors(b, 1, { localX: L * 0.5 });
    this.addSideDoors(b, -1, { localX: L * 0.5 });
  }

  buildFlatcar(b) {
    const L = this.length;
    this.openTop = true;
    this.hasRoof = false;
    this.addFloor(b, { key: 'wood', thickness: 0.3 });
    for (let x = 0.6; x < L; x += 1.4) {
      b.box('ironDark', x, FLOOR_Y + 0.55, HALF_W - 0.12, 0.14, 1.1, 0.14, { collide: true, tag: 'post' });
      b.box('ironDark', x, FLOOR_Y + 0.55, -HALF_W + 0.12, 0.14, 1.1, 0.14, { collide: true, tag: 'post' });
    }
    b.box('wood', 0.25, FLOOR_Y + 0.85, 0, 0.3, 1.7, HALF_W * 2, { collide: true, tag: 'wall' });
    b.box('wood', L - 0.25, FLOOR_Y + 0.85, 0, 0.3, 1.7, HALF_W * 2, { collide: true, tag: 'wall' });
    this.addCrate(b, { x: L * 0.3, z: -0.75, size: 1.35, loot: 'artifact' });
    this.addCrate(b, { x: L * 0.3, y: FLOOR_Y + 1.35, z: -0.75, size: 0.9 });
    this.addCrate(b, { x: L * 0.62, z: 0.8, size: 1.2, key: 'crateBlue' });
    this.addBarrel(b, { x: L * 0.5, z: -1.0, explosive: true });
    this.addBarrel(b, { x: L * 0.72, z: -0.6 });
    this.addHandrail(b, { x0: 0.4, x1: L - 0.4, z: HALF_W + 0.05, y: FLOOR_Y + 1.15 });
  }

  buildArmored(b) {
    const L = this.length;
    this.addFloor(b, { key: 'armorPlateDark', thickness: 0.34 });
    const slits = [{ x: L * 0.3, width: 0.4 }, { x: L * 0.68, width: 0.4 }];
    this.addWindowWall(b, -1, { x0: 0, x1: L, windows: slits, sillY: 2.25, headY: 2.8, key: 'armorPlate' });
    this.addOpenSide(b, { x0: 0, x1: L, sillTop: FLOOR_Y + 0.95, spacing: 2.6, key: 'armorPlate' });
    this.addEndWall(b, 'back', { open: true, width: 1.3 });
    this.addEndWall(b, 'front', { locked: true, width: 1.3, height: 2.3 });
    this.addRoof(b, {});
    this.addLamps(b, { localX: [L * 0.3, L * 0.7] });
    b.box('armorPlateDark', L / 2, FLOOR_Y + 1.3, 1.42, L - 0.6, 2.2, 0.12);
    b.box('armorPlateDark', L / 2, FLOOR_Y + 1.3, -1.42, L - 0.6, 2.2, 0.12);
    this.addCrate(b, { x: L * 0.32, z: -0.7, size: 1.15, key: 'armorPlateDark', loot: 'gold' });
    this.addCrate(b, { x: L * 0.34, y: FLOOR_Y + 1.15, z: -0.7, size: 0.8, key: 'armorPlateDark' });
    this.addCrate(b, { x: L * 0.68, z: 0.85, size: 1.05, key: 'armorPlateDark' });
    for (let i = 0; i < 4; i++) {
      b.box('rust', L * 0.5 + i * 0.5 - 0.75, FLOOR_Y + 0.22, -1.1, 0.7, 0.44, 0.55, {
        collide: true,
        tag: 'sandbag',
        data: { car: this, surfaceY: FLOOR_Y + 0.44 },
      });
    }
    b.box('armorPlateDark', L - 1.1, ROOF_Y + 0.5, 0, 1.6, 1.1, 2.4);
  }

  buildVault(b) {
    const L = this.length;
    this.addFloor(b, { key: 'armorPlateDark', thickness: 0.34 });
    this.addWall(b, -1, { key: 'armorPlate' });
    this.addOpenSide(b, { x0: 0, x1: L, sillTop: FLOOR_Y + 0.95, spacing: 2.6, key: 'armorPlate' });
    this.addEndWall(b, 'back', { open: true, width: 1.3 });
    this.addRoof(b, {});
    this.addLamps(b, { localX: [L * 0.45, L * 0.7] });
    for (let x = 1.0; x < L; x += 1.6) {
      b.box('armorPlateDark', x, CEIL_Y - 0.2, 0, 0.35, 0.4, HALF_W * 2 - 0.3);
      b.box('armorPlateDark', x, FLOOR_Y + 0.2, 0, 0.35, 0.4, HALF_W * 2 - 0.3);
    }

    // ---- vault bulkhead with a circular door ---------------------------------
    const vaultX = L * 0.42;
    const OPEN_W = 0.85;
    const OPEN_TOP = 3.2;
    b.box('armorPlateDark', vaultX, (FLOOR_Y + CEIL_Y) / 2, -HALF_W + (HALF_W - OPEN_W) / 2, 0.45, CEIL_Y - FLOOR_Y, HALF_W - OPEN_W, {
      collide: true,
      tag: 'wall',
    });
    b.box('armorPlateDark', vaultX, (FLOOR_Y + CEIL_Y) / 2, HALF_W - (HALF_W - OPEN_W) / 2, 0.45, CEIL_Y - FLOOR_Y, HALF_W - OPEN_W, {
      collide: true,
      tag: 'wall',
    });
    b.box('armorPlateDark', vaultX, (OPEN_TOP + CEIL_Y) / 2, 0, 0.45, CEIL_Y - OPEN_TOP, OPEN_W * 2, { collide: true, tag: 'wall' });

    const doorR = 1.15;
    const doorGroup = dynamicGroup(
      `vaultDoor_${this.index}`,
      { x: this.wx(vaultX), y: FLOOR_Y + 1.0, z: 0 },
      [
        torus('armorPlateDark', 0, 0, 0, doorR, 0.1, { ry: Math.PI / 2 }),
        cyl('vaultDoor', 0, 0, 0, doorR - 0.04, 0.22, { axis: 'x', hi: true }),
        cyl('armorPlateDark', 0.14, 0, 0, doorR - 0.02, 0.08, { axis: 'x', hi: true }),
      ]
    );
    doorGroup.state.ry = 0;
    b.group(doorGroup);
    this.dynamics.vaultDoor = doorGroup;

    // wheel + spokes (own group so it can spin independently)
    const wheelGroup = dynamicGroup(`vaultWheel_${this.index}`, { x: this.wx(vaultX) - 0.22, y: FLOOR_Y + 1.0, z: 0 }, [
      torus('trim', 0, 0, 0, 0.55, 0.07, { ry: Math.PI / 2 }),
      box('trim', 0, 0, 0, 0.05, 1.1, 0.05, { rx: Math.PI / 4 }),
      box('trim', 0, 0, 0, 0.05, 1.1, 0.05, { rx: -Math.PI / 4 }),
      cyl('trim', 0, 0, 0, 0.14, 0.2, { axis: 'x' }),
    ]);
    b.group(wheelGroup);
    this.dynamics.vaultWheel = wheelGroup;

    const clamps = dynamicGroup(`vaultClamps_${this.index}`, { x: this.wx(vaultX) + 0.28, y: FLOOR_Y + 1.0, z: 0 }, []);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      clamps.parts.push(box('ironDark', 0, Math.cos(a) * 1.34, Math.sin(a) * 1.34, 0.28, 0.26, 0.26, { rx: -a, ry: Math.PI / 2 }));
    }
    b.group(clamps);
    this.dynamics.vaultClamps = clamps;
    this.clampBaseX = this.wx(vaultX) + 0.28;

    this.vaultCollider = this.world.add({
      minX: this.wx(vaultX) - 0.28,
      maxX: this.wx(vaultX) + 0.28,
      minY: FLOOR_Y,
      maxY: OPEN_TOP,
      minZ: -OPEN_W,
      maxZ: OPEN_W,
      tag: 'vaultDoor',
      owner: this,
      surface: false,
    });
    this.vaultX = this.wx(vaultX);
    this.treasureSpawn = { x: this.wx(L * 0.12), y: FLOOR_Y + 0.75, z: 0 };
    this.interactables.push({
      type: 'vault',
      x: this.wx(vaultX) - 0.9,
      y: FLOOR_Y + 0.8,
      z: 0,
      radius: 2.8,
      label: 'OPEN VAULT',
      opened: false,
    });
    b.box('armorPlateDark', L * 0.12, FLOOR_Y + 0.35, 0, 2.2, 0.7, 2.6, { collide: true, tag: 'pedestal' });
    b.box('gold', L * 0.12, FLOOR_Y + 0.72, 0, 2.0, 0.06, 2.2);
    this.addEndWall(b, 'front', { open: true, width: 1.3 });
  }

  buildLocomotive(b) {
    const L = this.length;
    this.addFloor(b, { key: 'ironDark' });
    const cabX0 = L - 4.6;
    this.addWindowWall(b, -1, { x0: cabX0, x1: L, windows: [{ x: cabX0 + 1.7, width: 1.0 }], sillY: 2.1, headY: 3.0 });
    this.addOpenSide(b, { x0: cabX0, x1: L, sillTop: FLOOR_Y + 0.7, spacing: 1.8 });
    this.addEndWall(b, 'back', { open: true, width: 1.3 });
    this.addEndWall(b, 'front', { locked: true, width: 1.3, height: 2.2 });
    // the roof stops short of the firebox so the crew can drop into the cab
    this.addRoof(b, { x0: cabX0 + 1.0, x1: L });
    this.addHandrail(b, { x0: cabX0, x1: L - 0.5, z: HALF_W + 0.08 });
    this.addHandrail(b, { x0: cabX0, x1: L - 0.5, z: -HALF_W - 0.08 });
    this.addLamps(b, { localX: [L - 2.4] });
    this.addLadder(b, { localX: L - 0.7, side: -1, top: ROOF_Y, bottom: FLOOR_Y });

    const boilerLen = cabX0 - 1.6;
    b.cyl('trainBody', 1.6 + boilerLen / 2, 2.5, 0, 1.15, boilerLen, { axis: 'x', hi: true });
    b.cyl('iron', 1.6 + boilerLen / 2, 2.5, 0, 1.25, 0.12, { axis: 'x', hi: true });
    b.box('ironDark', 1.6 + boilerLen / 2, 1.75, 0, boilerLen, 0.5, 2.6);
    this.world.add({
      minX: this.wx(0.6),
      maxX: this.wx(cabX0 - 0.2),
      minY: FLOOR_Y - 0.3,
      maxY: 3.9,
      minZ: -1.3,
      maxZ: 1.3,
      tag: 'boiler',
      owner: this,
      surface: false,
    });
    b.cyl('ironDark', 2.5, 4.2, 0, 0.42, 1.5, { hi: true });
    b.cone('ironDark', 2.5, 5.15, 0, 0.62, 0.6);
    b.cyl('trainBody', 5.4, 3.9, 0, 0.6, 0.8, { hi: true });
    b.cyl('trainBody', 8.2, 3.85, 0, 0.45, 0.7, { hi: true });
    b.cyl('brass', 11.0, 3.7, 0.9, 0.12, 0.8);
    b.box('ironDark', 0.9, 1.6, 0, 1.6, 0.6, 2.4);
    for (let i = 0; i < 7; i++) {
      b.box('iron', 0.3, 0.95 + i * 0.06, -1.4 + i * 0.46, 1.5, 0.1, 0.09, { rx: -0.5 });
    }
    b.cyl('ironDark', 0.85, 3.6, 0, 0.36, 0.5, { axis: 'x', hi: true });
    b.cyl('lampGlass', 0.6, 3.6, 0, 0.3, 0.06, { axis: 'x', hi: true });
    b.box('brass', L - 1.2, FLOOR_Y + 0.65, 0.85, 0.5, 0.6, 0.5);
    b.box('ironDark', L - 2.6, FLOOR_Y + 0.5, -1.0, 0.9, 0.9, 0.7, { collide: true, tag: 'console' });
    this.addLadder(b, { localX: 0.7, side: 1, top: 3.9, bottom: FLOOR_Y });

    // walkway along the boiler so the crew can reach the cab from the rear
    b.box('ironDark', 1.6 + boilerLen / 2, 3.72, 0, boilerLen, 0.14, 1.7, {
      collide: true,
      tag: 'catwalk',
      data: { car: this, surfaceY: 3.79 },
    });
    b.box('woodDark', 1.6 + boilerLen / 2, 3.8, -0.85, boilerLen, 0.05, 0.24);
    b.box('woodDark', 1.6 + boilerLen / 2, 3.8, 0.85, boilerLen, 0.05, 0.24);

    this.escapePoint = { x: this.wx(L - 1.2), y: FLOOR_Y, z: 0 };
    this.interactables.push({
      type: 'escape',
      x: this.wx(L - 2.4),
      y: FLOOR_Y + 0.6,
      z: 0,
      radius: 3.2,
      label: 'JUMP!',
      armed: false,
    });
  }

  buildTender(b) {
    const L = this.length;
    this.openTop = true;
    this.hasRoof = false;
    this.addFloor(b, { key: 'ironDark' });
    this.addWall(b, -1, { y0: FLOOR_Y, y1: FLOOR_Y + 1.5, key: 'ironDark' });
    this.addWall(b, 1, { y0: FLOOR_Y, y1: FLOOR_Y + 1.5, key: 'ironDark' });
    b.box('ironDark', 0.2, FLOOR_Y + 0.75, 0, 0.4, 1.5, HALF_W * 2, { collide: true, tag: 'wall' });
    b.box('ironDark', L - 0.2, FLOOR_Y + 0.75, 0, 0.4, 1.5, HALF_W * 2, { collide: true, tag: 'wall' });
    b.box('ironDark', L * 0.45, FLOOR_Y + 0.35, 0, L * 0.5, 0.7, 2.6, { collide: true, tag: 'coal' });
    b.box('ironDark', L * 0.45, FLOOR_Y + 0.8, 0, L * 0.35, 0.3, 1.8, { collide: true, tag: 'coal' });
    b.box('trainBody', L * 0.82, FLOOR_Y + 0.9, 0, 2.0, 1.8, HALF_W * 2);
    b.cyl('iron', L * 0.82, FLOOR_Y + 1.4, 0.9, 0.14, 0.5, { axis: 'x' });
    this.addLadder(b, { localX: 0.6, side: 1, top: FLOOR_Y + 1.5, bottom: FLOOR_Y });
  }

  buildCaboose(b) {
    const L = this.length;
    const cabinX1 = L * 0.66;
    this.addFloor(b, { x0: 0, x1: cabinX1, key: 'woodDark' });
    this.addFloor(b, { x0: cabinX1, x1: L, key: 'wood' });
    this.addWindowWall(b, -1, { x0: 0, x1: cabinX1, windows: [{ x: L * 0.3, width: 1.1 }], sillY: 2.1, headY: 3.0 });
    this.addOpenSide(b, { x0: 0, x1: cabinX1, sillTop: FLOOR_Y + 0.7, spacing: 2.2 });
    this.addEndWall(b, 'back', { open: true, width: 1.3 });
    this.addEndWall(b, cabinX1, { open: true, width: 1.3 });
    this.addEndWall(b, 'front', { open: true, width: 1.3 });
    this.addRoof(b, { x0: 0, x1: cabinX1 });
    this.addLamps(b, { localX: [L * 0.3] });
    for (let i = 0; i < 3; i++) {
      const x = cabinX1 + 0.5 + i * 0.6;
      b.cyl('trim', x, 2.2, HALF_W - 0.1, 0.03, 1.0);
      b.cyl('trim', x, 2.2, -HALF_W + 0.1, 0.03, 1.0);
    }
    b.cyl('trim', L - 0.35, 2.7, 0, 0.035, HALF_W * 2 - 0.2, { axis: 'z', hi: true });
    b.cyl('trim', cabinX1, 2.7, 0, 0.035, HALF_W * 2 - 0.2, { axis: 'z', hi: true });
    b.cyl('ironDark', L - 0.2, 1.6, 0, 0.09, HALF_W * 1.4, { axis: 'z' });
    b.sphere('lampGlass', L - 0.5, 2.9, 0.7, 0.16);
    this.lights.push({ x: this.wx(L - 0.5), y: 2.9, z: 0.7, color: 0xffb060 });
    this.boardingPoint = { x: this.wx(L - 1.0), y: FLOOR_Y, z: 0 };
    this.interactables.push({ type: 'board', x: this.wx(L - 1.0), y: FLOOR_Y + 0.6, z: 0, radius: 3.4, label: 'BOARD' });
    this.addCrate(b, { x: L * 0.3, z: -1.0, size: 0.85, loot: 'money' });
    this.addBarrel(b, { x: L * 0.55, z: 1.05 });
  }

  addNode(x, z, y = null, opts = {}) {
    this.spawnNodes.push({ x: this.wx(x), y: y ?? this.floorSurfaceY, z, ...opts });
  }

  /** Dynamic group by id (render layer + gameplay animation). */
  getGroup(id) {
    return this.groups.find((g) => g.id === id) || null;
  }
}

/** Loot table shared by crates, safes and the vault. */
export const LOOT_TABLE = {
  money: { type: 'money', label: 'MONEY BAG', value: 750 },
  jewelry: { type: 'jewelry', label: 'JEWELRY', value: 1400 },
  gold: { type: 'gold', label: 'GOLD BARS', value: 2200 },
  documents: { type: 'documents', label: 'DOCUMENTS', value: 500 },
  artifact: { type: 'artifact', label: 'RARE ARTIFACT', value: 3200 },
  treasure: { type: 'treasure', label: 'THE PAYROLL', value: 12000 },
};

export default TrainCar;
