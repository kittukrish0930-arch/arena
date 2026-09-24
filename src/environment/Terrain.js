// -----------------------------------------------------------------------------
// Terrain: the static (non-scrolling) backbone of the world.
// The ground and river are big textured planes whose UVs scroll, the rails are
// real geometry and the distant ranges are instanced silhouettes.
// -----------------------------------------------------------------------------
import { box, plane, cyl, cone } from '../world/Primitives.js';

export const GROUND_SIZE = 1000;

export function buildTerrain() {
  const parts = [];

  // --- ground ---------------------------------------------------------------
  parts.push(
    plane('ground', 0, 0, 0, GROUND_SIZE, GROUND_SIZE, { rx: -Math.PI / 2, texScroll: 'ground' })
  );
  // a slightly raised sandy embankment under the track so the line reads clearly
  parts.push(box('terrainNear', 60, -0.09, 0, 1400, 0.22, 26, { texScroll: 'embankment' }));
  // ballast shoulder
  parts.push(box('ballast', 60, 0.0, 0, 1400, 0.14, 5.2, { texScroll: 'ballast' }));

  // --- rails ----------------------------------------------------------------
  for (const z of [-0.72, 0.72]) {
    parts.push(box('railSteel', 60, -0.07, z, 1400, 0.14, 0.1));
    // web + foot for a proper rail profile
    parts.push(box('ironDark', 60, -0.16, z, 1400, 0.05, 0.22));
  }

  // --- river (off to one side, parallax'd by the ground texture scroll) -----
  parts.push(plane('water', 80, 0.015, -120, 900, 160, { rx: -Math.PI / 2, texScroll: 'water' }));
  parts.push(box('rockDark', 80, -0.05, -40, 900, 0.1, 6));

  // --- distant range silhouettes (static, hide the horizon) -----------------
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const x = -600 + t * 1500;
    const h = 60 + Math.sin(i * 2.3) * 26 + (i % 3) * 14;
    const z = -520 - ((i * 37) % 90);
    parts.push(cone('mountainFar', x, h * 0.5 - 6, z, 90 + (i % 4) * 22, h));
    parts.push(cone('mountainFar', x + 60, h * 0.35 - 6, z - 40, 70, h * 0.7));
  }
  // far mesa line on the other side
  for (let i = 0; i < 16; i++) {
    const x = -400 + i * 110;
    parts.push(cone('cliffFar', x, 22, 560 + ((i * 23) % 60), 60, 54));
  }

  return parts;
}

/** Catenary-style track-side props that never move (kept minimal). */
export function buildTrackSideHandles() {
  const parts = [];
  for (const z of [-11, 11]) {
    for (let x = -200; x < 800; x += 40) {
      parts.push(cyl('signWood', x, 0.9, z, 0.1, 1.8));
    }
  }
  return parts;
}

export default buildTerrain;
