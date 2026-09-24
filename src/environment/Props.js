// -----------------------------------------------------------------------------
// Scrolling world props.
//
// Everything here is a lightweight instance record: { kind, x, y, z, scale, rot,
// parallax }. The environment moves them backwards past the train every frame and
// wraps them around, which is what sells the sensation of speed.
// -----------------------------------------------------------------------------
import { RNG } from '../utils/RNG.js';

export const PROP_SCROLL = {
  min: -340, // wrap threshold (behind the train)
  max: 660, // spawn threshold (ahead of the train)
};

export function scrollSpan() {
  return PROP_SCROLL.max - PROP_SCROLL.min;
}

/**
 * @param {number} seed
 * @param {object} opts { density }
 */
export function buildProps(seed = 9871, { density = 1 } = {}) {
  const rng = new RNG(seed);
  const props = [];

  const add = (kind, x, y, z, scale, rot = 0, parallax = 1, extra = null) => {
    props.push({ kind, x, y, z, scale, rot, parallax, ...(extra || {}) });
  };

  // --- sleepers / ties under the track (the strongest speed cue) ------------
  for (let x = PROP_SCROLL.min; x < PROP_SCROLL.max; x += 0.78) {
    add('sleeper', x, 0.015, 0, 1, 0, 1);
  }

  // --- telegraph poles + wire runs -----------------------------------------
  for (let x = PROP_SCROLL.min; x < PROP_SCROLL.max; x += 34) {
    add('telegraphPole', x + rng.range(-3, 3), 0, 8.6, rng.range(0.92, 1.1), 0, 1);
  }

  // --- track-side signals --------------------------------------------------
  for (let x = PROP_SCROLL.min + 40; x < PROP_SCROLL.max; x += 120) {
    add(rng.chance(0.5) ? 'signalGreen' : 'signalRed', x, 0, -7.4, 1, 0, 1);
  }

  // --- vegetation / geology ------------------------------------------------
  const nearKinds = [
    { kind: 'pineTall', weight: 2 },
    { kind: 'pineWide', weight: 2 },
    { kind: 'deadTree', weight: 1.2 },
    { kind: 'cactus', weight: 1.6 },
    { kind: 'bush', weight: 3 },
    { kind: 'rockSmall', weight: 2.4 },
    { kind: 'rockLarge', weight: 0.9 },
    { kind: 'grassTuft', weight: 4 },
  ];
  const count = Math.round(560 * density);
  for (let i = 0; i < count; i++) {
    const e = rng.weighted(nearKinds);
    const z = rng.sign() * rng.range(9, 190);
    const x = rng.range(PROP_SCROLL.min, PROP_SCROLL.max);
    const s = rng.range(0.8, 1.5) * (e.kind === 'rockLarge' ? 1.2 : 1);
    add(e.kind, x, 0, z, s, rng.range(0, Math.PI * 2), 1);
  }

  // --- mesas / rock formations --------------------------------------------
  for (let i = 0; i < 26; i++) {
    const z = rng.sign() * rng.range(150, 320);
    add('mesaRock', rng.range(PROP_SCROLL.min, PROP_SCROLL.max), 0, z, rng.range(1.2, 2.6), rng.range(0, 3.1), 0.55);
  }

  // --- distant mountain parallax layer ------------------------------------
  for (let i = 0; i < 40; i++) {
    const z = rng.sign() * rng.range(420, 700);
    add('mesaRock', rng.range(PROP_SCROLL.min, PROP_SCROLL.max), 0, z, rng.range(3.5, 7), rng.range(0, 3.1), 0.22);
  }

  // --- settlements, wrecks and junk ---------------------------------------
  for (let i = 0; i < 3; i++) {
    const townX = PROP_SCROLL.min + i * 320 + rng.range(0, 120);
    const side = rng.sign();
    for (let b = 0; b < 4 + Math.floor(rng.next() * 4); b++) {
      add('buildingSmall', townX + b * rng.range(8, 22), 0, side * rng.range(26, 70), rng.range(0.85, 1.4), rng.range(-0.3, 0.3), 1);
    }
    add('waterTower', townX + rng.range(10, 40), 0, side * rng.range(20, 40), 1, 0, 1);
    for (let f = 0; f < 10; f++) {
      add('fencePost', townX + f * 3.6, 0, side * rng.range(80, 100), 1, 0, 1);
    }
  }
  for (let i = 0; i < 14; i++) {
    add('wagonWreck', rng.range(PROP_SCROLL.min, PROP_SCROLL.max), 0, rng.sign() * rng.range(12, 40), rng.range(0.9, 1.3), rng.range(0, 6.2), 1);
  }

  // --- tunnel mouths, cuts and hidden valley entrances --------------------
  for (let i = 0; i < 6; i++) {
    add('mesaRock', rng.range(PROP_SCROLL.min, PROP_SCROLL.max), 0, rng.sign() * rng.range(60, 110), rng.range(1.6, 2.4), 0, 1);
  }

  return props;
}

export default buildProps;
