// -----------------------------------------------------------------------------
// Reusable multi-part prop prefabs.
//
// Each prefab is a list of primitive descriptors around a local origin. The
// render layer merges them into one geometry per material and draws every
// instance of that prefab with an InstancedMesh.
// -----------------------------------------------------------------------------
import { box, cyl, sphere, cone } from './Primitives.js';

export const PREFABS = {
  // track ties: the strongest sense of speed in the whole scene
  sleeper: [
    box('woodDark', 0, 0.02, 0, 0.34, 0.14, 3.1),
    box('ballast', 0, -0.06, 0, 0.6, 0.1, 3.4),
    cyl('iron', 1.0, 0.12, 0.72, 0.035, 0.4, { axis: 'x', hi: true }),
    cyl('iron', 1.0, 0.12, -0.72, 0.035, 0.4, { axis: 'x', hi: true }),
  ],
  pineTall: [
    cyl('treeTrunk', 0, 1.1, 0, 0.16, 2.2),
    cone('treeFoliage', 0, 2.6, 0, 1.25, 3.0),
    cone('treeFoliage', 0, 4.0, 0, 0.95, 2.4),
    cone('treeFoliage', 0, 5.2, 0, 0.62, 1.8),
  ],
  pineWide: [
    cyl('treeTrunk', 0, 0.9, 0, 0.18, 1.8),
    cone('treeFoliageDry', 0, 2.1, 0, 1.5, 2.6),
    cone('treeFoliageDry', 0, 3.3, 0, 1.05, 2.0),
  ],
  deadTree: [
    cyl('treeTrunk', 0, 1.6, 0, 0.17, 3.2, { hi: true }),
    box('treeTrunk', 0.4, 2.7, 0, 1.0, 0.11, 0.11, { rz: 0.5 }),
    box('treeTrunk', -0.45, 2.3, 0.2, 0.9, 0.1, 0.1, { rz: -0.6, ry: 0.4 }),
    box('treeTrunk', 0.1, 3.1, -0.3, 0.8, 0.09, 0.09, { rz: 0.3, ry: -0.5 }),
  ],
  cactus: [
    cyl('bush', 0, 1.3, 0, 0.28, 2.6, { hi: true }),
    cyl('bush', 0.45, 1.7, 0, 0.16, 1.1, { axis: 'y', hi: true }),
    box('bush', 0.24, 1.7, 0, 0.45, 0.32, 0.32),
    cyl('bush', -0.4, 1.5, 0.1, 0.14, 0.9, { axis: 'y', hi: true }),
    box('bush', -0.2, 1.5, 0.1, 0.4, 0.28, 0.28),
  ],
  bush: [sphere('bush', 0, 0.32, 0, 0.55), sphere('bush', 0.4, 0.26, 0.2, 0.38)],
  rockSmall: [sphere('rock', 0, 0.35, 0, 0.65), sphere('rock', 0.4, 0.2, 0.15, 0.42)],
  rockLarge: [
    sphere('rock', 0, 1.1, 0, 1.9),
    sphere('rock', 1.2, 0.7, 0.4, 1.2),
    sphere('rock', -1.3, 0.6, -0.3, 1.0),
  ],
  mesaRock: [
    cyl('cliffFar', 0, 2.4, 0, 3.2, 4.8, { hi: true }),
    cyl('rock', 0, 4.7, 0, 2.5, 1.2, { hi: true }),
    box('rockDark', 1.8, 1.4, 0.6, 2.4, 2.8, 2.2, { ry: 0.3 }),
  ],
  telegraphPole: [
    cyl('treeTrunk', 0, 3.4, 0, 0.16, 6.8, { hi: true }),
    box('signWood', 0, 6.2, 0, 0.14, 0.14, 2.0),
    box('signWood', 0, 5.5, 0, 0.12, 0.12, 1.5),
    cyl('iron', 0, 6.62, 0.7, 0.06, 0.22),
    cyl('iron', 0, 6.62, -0.7, 0.06, 0.22),
    cyl('iron', 0, 5.86, 0.55, 0.05, 0.2),
    cyl('iron', 0, 5.86, -0.55, 0.05, 0.2),
  ],
  signalGreen: [
    cyl('ironDark', 0, 2.0, 0, 0.14, 4.0),
    box('ironDark', 0, 4.4, 0, 0.5, 1.4, 0.4),
    cyl('signGreen', 0.24, 4.6, 0, 0.16, 0.1, { axis: 'x' }),
    box('ironDark', -0.6, 3.9, 0, 1.2, 0.1, 0.1),
  ],
  signalRed: [
    cyl('ironDark', 0, 2.0, 0, 0.14, 4.0),
    box('ironDark', 0, 4.4, 0, 0.5, 1.4, 0.4),
    cyl('signRed', 0.24, 4.6, 0, 0.16, 0.1, { axis: 'x' }),
    box('ironDark', -0.6, 3.9, 0, 1.2, 0.1, 0.1),
  ],
  buildingSmall: [
    box('buildingWall', 0, 1.5, 0, 5.0, 3.0, 4.0),
    box('buildingRoof', 0, 3.3, 0, 5.6, 0.6, 4.6),
    box('woodDark', 1.6, 0.9, 2.05, 0.9, 1.8, 0.12),
    box('glass', -1.4, 1.8, 2.05, 0.9, 0.9, 0.08),
  ],
  waterTower: [
    cyl('ironDark', 0, 2.0, 0, 0.14, 4.0),
    cyl('ironDark', 1.8, 2.0, 0, 0.14, 4.0),
    cyl('ironDark', 0, 2.0, 1.4, 0.14, 4.0),
    cyl('ironDark', 1.8, 2.0, 1.4, 0.14, 4.0),
    cyl('rust', 0.9, 4.8, 0.7, 1.5, 2.0, { hi: true }),
    cone('rust', 0.9, 6.1, 0.7, 1.6, 0.7),
  ],
  wagonWreck: [
    box('wood', 0, 0.9, 0, 3.4, 1.4, 2.0, { rz: 0.12 }),
    box('woodDark', 0, 1.7, 0, 3.0, 0.3, 1.9, { rz: 0.2 }),
    cyl('wood', 0.9, 0.35, 1.1, 0.4, 0.16, { axis: 'z' }),
    cyl('wood', 0.9, 0.35, -1.1, 0.4, 0.16, { axis: 'z' }),
    cyl('wood', -1.0, 0.35, 1.1, 0.38, 0.16, { axis: 'z' }),
  ],
  grassTuft: [cone('bush', 0, 0.3, 0, 0.28, 0.6), cone('bush', 0.2, 0.24, 0.12, 0.2, 0.48)],
  fencePost: [cyl('signWood', 0, 0.8, 0, 0.09, 1.6), box('signWood', 0, 1.3, 0, 0.08, 0.08, 0.5)],
  // --- train interior / deck props -----------------------------------------
  crateStack: [
    box('wood', 0, 0.5, 0, 1.0, 1.0, 1.0),
    box('wood', 0, 1.35, 0.1, 0.7, 0.7, 0.7, { ry: 0.3 }),
  ],
  barrelSingle: [cyl('barrelRed', 0, 0.5, 0, 0.34, 1.0, { hi: true }), cyl('ironDark', 0, 0.5, 0, 0.36, 0.08)],
};

export default PREFABS;
