// -----------------------------------------------------------------------------
// Structures: large landmarks that scroll past the train.
//
// Each factory returns { kind, length, parts } where `parts` are primitive
// descriptors in LOCAL space around the structure origin (x = 0 is where the
// structure meets the train first). The environment moves the whole thing with
// the scroll, and the hazard director watches its x to fire events.
// -----------------------------------------------------------------------------
import { box, cyl, cone, plane, sphere } from '../world/Primitives.js';

/** Rock tunnel: portal, 200m of bore with lamps, exit portal. */
export function tunnel({ length = 200 } = {}) {
  const parts = [];
  const W = 6.4; // half width of the bore opening
  const H = 7.6; // opening height
  const wallT = 2.6;

  // --- rock mass around the portal -----------------------------------------
  const portalFace = (x) => {
    const segs = [
      { y: H / 2, z: -(W + wallT / 2), sy: H, sz: wallT },
      { y: H / 2, z: W + wallT / 2, sy: H, sz: wallT },
      { y: H + wallT / 2, z: 0, sy: wallT, sz: (W + wallT) * 2 },
    ];
    for (const s of segs) {
      parts.push(box('tunnelStone', x, s.y, s.z, wallT, s.sy, s.sz));
    }
    // rough stone cap
    parts.push(cone('tunnelStone', x - 1.2, H + 3.6, 0, 13, 8));
    parts.push(sphere('tunnelStone', x, 2, -(W + 4), 5));
    parts.push(sphere('tunnelStone', x, 2, W + 4, 5));
    // warning stripes at the mouth
    parts.push(box('signRed', x + 0.05, H - 0.35, 0, 0.3, 0.35, (W + wallT) * 2));
    parts.push(box('trim', x + 0.05, H - 0.9, 0, 0.28, 0.2, (W + wallT) * 2));
  };
  portalFace(0);
  portalFace(length);

  // --- bore walls (inside) --------------------------------------------------
  parts.push(box('tunnelStone', length / 2, H + 0.6, -W, length, 1.6, 1.0));
  parts.push(box('tunnelStone', length / 2, H + 0.6, W, length, 1.6, 1.0));
  parts.push(box('tunnelStone', length / 2, H + 1.6, 0, length, 1.2, W * 2));
  for (let x = 4; x < length - 2; x += 6) {
    // soot streaks + arch ribs
    parts.push(box('tunnelStone', x, H + 0.1, -W + 0.7, 0.5, 1.4, 0.7));
    parts.push(box('tunnelStone', x, H + 0.1, W - 0.7, 0.5, 1.4, 0.7));
    parts.push(box('ironDark', x, H - 0.2, 0, 0.3, 0.3, W * 2 - 0.4));
    if (x % 12 === 4) {
      parts.push(box('lampGlass', x, H - 0.5, 0, 0.3, 0.2, 0.3));
      parts.push(cyl('ironDark', x, H - 0.3, 0, 0.06, 0.4));
    }
  }
  // signal box outside the exit
  parts.push(box('crateBlue', length + 6, 2.2, -7, 3, 4.4, 2.6));
  parts.push(box('ironDark', length + 6, 4.7, -7, 3.6, 0.5, 3.2));
  return { kind: 'tunnel', length, parts, roofClearance: null, hazard: 'tunnel' };
}

/** Low steel gantry: anything above the roofline gets taken out. */
export function gantry() {
  const parts = [];
  const CLEAR = 5.05;
  // vertical legs either side of the track
  for (const z of [-7.5, 7.5]) {
    parts.push(box('bridgeSteel', 0, CLEAR / 2 + 1.6, z, 0.75, CLEAR + 3.2, 0.75));
    parts.push(box('bridgeSteel', 0, 1.4, z, 2.6, 0.5, 2.6));
  }
  // cross beams (the hazard) + braces
  parts.push(box('bridgeSteel', 0, CLEAR + 0.2, 0, 0.9, 0.5, 15));
  parts.push(box('bridgeSteel', -2.4, CLEAR + 0.55, 0, 0.5, 0.4, 15));
  parts.push(box('bridgeSteel', 2.4, CLEAR + 0.55, 0, 0.5, 0.4, 15));
  parts.push(box('bridgeSteel', 0, CLEAR - 0.55, -6.2, 0.4, 1.1, 0.4, { rz: 0.4 }));
  parts.push(box('bridgeSteel', 0, CLEAR - 0.55, 6.2, 0.4, 1.1, 0.4, { rz: -0.4 }));
  // hanging warning board + lamp
  parts.push(box('signWood', 0, CLEAR - 0.75, 0, 0.25, 1.5, 2.6));
  parts.push(box('signRed', 0.16, CLEAR - 0.6, 0, 0.06, 0.5, 2.2));
  parts.push(box('lampGlass', 0, CLEAR - 1.7, 0, 0.28, 0.2, 0.28));
  // ladders/pipework for detail
  for (const z of [-7.5, 7.5]) {
    for (let y = 1.2; y < CLEAR; y += 0.7) parts.push(box('ironDark', -0.55, y, z, 0.12, 0.1, 1.2));
  }
  return { kind: 'gantry', length: 4, parts, roofClearance: CLEAR, hazard: 'gantry' };
}

/** Trestle bridge over a gorge: falling here is fatal. */
export function trestle({ length = 150 } = {}) {
  const parts = [];
  // river far below
  parts.push(plane('water', length / 2, -22, 0, length * 1.6, 190, { rx: -Math.PI / 2 }));
  // trestle bents
  for (let x = 0; x < length; x += 10) {
    for (const z of [-1.9, 1.9]) {
      parts.push(box('bridgeSteel', x, -11, z, 0.7, 22, 0.7));
    }
    for (let y = -4; y > -20; y -= 4) {
      parts.push(box('bridgeSteel', x, y, 0, 0.4, 0.4, 4.2, { ry: 0.1 }));
      parts.push(box('bridgeSteel', x - 3.2, y, 0, 0.35, 6, 0.35, { rz: 0.6 }));
    }
    parts.push(box('bridgeSteel', x, -1.6, 0, 2.4, 0.5, 4.6));
  }
  // abutments at both ends
  parts.push(box('tunnelStone', -3, -6, 0, 10, 14, 12));
  parts.push(box('tunnelStone', length + 3, -6, 0, 10, 14, 12));
  // hand rails along the deck
  for (const z of [-2.2, 2.2]) {
    parts.push(cyl('ironDark', length / 2, 1.5, z, 0.075, length, { axis: 'x' }));
    for (let x = 0; x < length; x += 4) parts.push(cyl('ironDark', x, 0.8, z, 0.06, 1.4));
  }
  return { kind: 'trestle', length, parts, hazard: 'bridge' };
}

/** Parallel train sweeping past on the second track (cinematic set piece). */
export function passingTrain({ cars = 5 } = {}) {
  const parts = [];
  const len = 12;
  for (let i = 0; i < cars; i++) {
    const x = i * (len + 0.8);
    parts.push(box('trainBodyDark', x + len / 2, 2.6, 0, len, 2.8, 3.0));
    parts.push(box('ironDark', x + len / 2, 1.0, 0, len, 0.5, 3.2));
    parts.push(box('trainBody', x + len / 2, 4.1, 0, len, 0.35, 3.1));
    for (let w = 0; w < 3; w++) parts.push(box('glass', x + 2 + w * 4, 3.0, 1.55, 1.3, 1.1, 0.1));
    for (const bx of [2, len - 2]) {
      for (const bz of [-1.1, 1.1]) parts.push(cyl('ironDark', x + bx, 0.5, bz, 0.5, 0.18, { axis: 'z' }));
    }
    parts.push(box('trim', x + len / 2, 1.5, 0, len, 0.15, 3.3));
  }
  parts.push(box('ironDark', cars * (len + 0.8), 3.2, 0, 3.0, 4.2, 3.0));
  parts.push(cyl('ironDark', cars * (len + 0.8), 5.6, 0, 0.4, 1.4));
  return { kind: 'passingTrain', length: cars * (len + 0.8), parts, hazard: 'incoming-train' };
}

/** Small lineside station / depot that scrolls past. */
export function station() {
  const parts = [];
  parts.push(box('wood', 0, 0.6, 12, 22, 1.2, 5.5));
  parts.push(box('buildingWall', 4, 3.2, 15, 12, 5.0, 4.0));
  parts.push(box('buildingRoof', 4, 6.0, 15, 13, 0.7, 5.0));
  for (let i = 0; i < 6; i++) parts.push(cyl('wood', -4 + i * 3, 3.4, 9.5, 0.16, 4.4));
  parts.push(box('buildingRoof', 3, 5.6, 9.5, 20, 0.4, 3.4));
  parts.push(box('signWood', 10, 4.6, 6, 0.3, 1.6, 4.0));
  parts.push(box('crateBlue', -8, 1.5, 14, 2.4, 2.4, 2.4));
  parts.push(box('crateBlue', -8, 3.2, 14, 1.8, 1.8, 1.8));
  parts.push(cyl('rust', 14, 2.2, 16, 1.6, 4.4));
  parts.push(box('lampGlass', 4, 5.4, 9.5, 0.3, 0.3, 0.3));
  return { kind: 'station', length: 30, parts, hazard: null };
}

export function rockfall() {
  const parts = [];
  // cliff face on one side with loose rock above the line
  for (let i = 0; i < 12; i++) {
    const x = i * 4;
    parts.push(sphere('cliffFar', x, 4 + (i % 3), -14 - (i % 4) * 2, 8 + (i % 3) * 2));
    parts.push(cone('tunnelStone', x, 2, -10, 5, 8));
  }
  parts.push(box('signRed', 6, 8.6, -9.5, 0.4, 1.2, 3.0));
  return { kind: 'rockfall', length: 48, parts, hazard: 'rockfall' };
}

export const STRUCTURE_FACTORY = {
  tunnel,
  gantry,
  trestle,
  passingTrain,
  station,
  rockfall,
};

export function createStructure(kind, opts = {}) {
  const factory = STRUCTURE_FACTORY[kind];
  if (!factory) throw new Error(`Unknown structure: ${kind}`);
  return factory(opts);
}

export default createStructure;
