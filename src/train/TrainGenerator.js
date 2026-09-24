// -----------------------------------------------------------------------------
// TrainGenerator - describes the consist and builds it.
//
// Axis convention: the train drives towards +x, so the locomotive sits at the
// HIGHEST x and the caboose at the lowest. `index` ascends in the direction of
// travel (1 = caboose ... 8 = locomotive), which is what the objective and
// garrison systems walk forward through:
//
//   CABOOSE | CARGO(box) | PASSENGER | CARGO(bomb) | FLATCAR | ARMORED | VAULT | LOCO
//
// The player boards at the very back (the caboose) and fights forward, which
// matches the objective flow: board -> cargo -> passenger -> rooftop -> flat car
// -> armored car -> boss/vault -> escape off the locomotive.
//
// Car specs are deterministic so a run always produces the same train.
// -----------------------------------------------------------------------------
import { TRAIN } from '../game/Config.js';
import { TrainCar } from './TrainCar.js';

/** Full consist definition, ordered from the locomotive backwards. */
export function buildConsistSpec() {
  const L = TRAIN.carLength;
  // rear -> front (direction of travel)
  const specs = [
    { type: 'caboose', length: L.caboose, name: 'CABOOSE' },
    { type: 'cargo', length: L.cargo, name: 'BOX CAR' },
    { type: 'passenger', length: L.passenger, name: 'PASSENGER CAR' },
    { type: 'cargo', length: L.cargo, name: 'BOMB CAR' },
    { type: 'flatcar', length: L.flatcar, name: 'FLAT CAR' },
    { type: 'armored', length: L.armored, name: 'ARMORED CAR' },
    { type: 'vault', length: L.vault, name: 'VAULT CAR' },
    { type: 'loco', length: L.loco, name: 'LOCOMOTIVE' },
  ];
  let x = 0;
  return specs.map((s, i) => {
    const entry = { ...s, index: i + 1, x0: x };
    x += s.length + (i === specs.length - 1 ? 0 : TRAIN.gap);
    return entry;
  });
}

/** Enemy patrol / cover nodes distributed across the consist. */
export function buildCarNodes(car) {
  const L = car.length;
  switch (car.type) {
    case 'caboose':
      car.addNode(L * 0.35, 0, null, { cover: [-1.2, 1.2], role: 'patrol' });
      car.addNode(L * 0.8, 0, null, { cover: [1.2], role: 'patrol' });
      break;
    case 'passenger':
      for (let i = 0; i < 4; i++) {
        car.addNode(1.6 + i * 3.1, i % 2 === 0 ? 0.5 : -0.5, null, { cover: [0.9, -0.9], role: 'patrol' });
      }
      break;
    case 'cargo':
      car.addNode(L * 0.2, 0.3, null, { cover: [-1.0, 1.0], role: 'patrol' });
      car.addNode(L * 0.5, -0.3, null, { cover: [-1.0, 1.0], role: 'patrol' });
      car.addNode(L * 0.8, 0.9, null, { cover: [1.1], role: 'guard' });
      break;
    case 'flatcar':
      car.addNode(L * 0.25, -0.8, null, { cover: [-1.2], role: 'guard' });
      car.addNode(L * 0.7, 0.9, null, { cover: [1.2], role: 'guard' });
      break;
    case 'armored':
      car.addNode(L * 0.25, 0, null, { cover: [-0.9, 0.9], role: 'heavy' });
      car.addNode(L * 0.6, 0, null, { cover: [-0.9, 0.9], role: 'heavy' });
      car.addNode(L * 0.9, 0, null, { cover: [0], role: 'elite' });
      break;
    case 'vault':
      car.addNode(L * 0.75, 0, null, { cover: [-1.1, 1.1], role: 'boss' });
      break;
    default:
      car.addNode(L * 0.5, 0, null, {});
      break;
  }
  // roof guards (used by the rooftop section)
  car.addNode(L * 0.35, 0, car.roofSurfaceY, { role: 'roof', roof: true });
  car.addNode(L * 0.7, 0, car.roofSurfaceY, { role: 'roof', roof: true });
  return car;
}

/**
 * Builds every car of the consist, registers its collision boxes and returns
 * the list of TrainCar instances (ordered rear-most first).
 */
export function generateTrain(world, spec = buildConsistSpec()) {
  const cars = spec.map((s, i) => {
    const car = new TrainCar({ ...s, index: s.index ?? i + 1 }, s.x0, world);
    buildCarNodes(car);
    car.build();
    return car;
  });
  return cars;
}

/** Index helpers used by the objective / camera systems. */
export function findCarByType(cars, type, from = 0) {
  for (let i = from; i < cars.length; i++) if (cars[i].type === type) return cars[i];
  return null;
}

export default generateTrain;
