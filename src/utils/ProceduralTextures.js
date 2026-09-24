// -----------------------------------------------------------------------------
// Procedural textures built from plain typed arrays (no canvas / no external
// assets). Everything is deterministic so visuals stay stable between runs.
// -----------------------------------------------------------------------------
import * as THREE from 'three';
import { RNG } from './RNG.js';

const CACHE = new Map();

function makeDataTexture(size, fill, opts = {}) {
  const data = new Uint8Array(size * size * 4);
  fill(data, size);
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = opts.wrap ?? THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function noise2D(x, y, seed) {
  // cheap value noise, deterministic
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function fbm(x, y, seed, octaves = 4) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * noise2D(x * f, y * f, seed + i * 13.37);
    amp *= 0.5;
    f *= 2;
  }
  return v;
}

/** Wood plank texture: warm boards with grain streaks and dark seams. */
export function woodTexture(seed = 3) {
  return cached(`wood${seed}`, () =>
    makeDataTexture(256, (data, size) => {
      const rng = new RNG(seed * 977 + 5);
      const planks = 6;
      const shade = new Array(planks).fill(0).map(() => rng.range(0.72, 1.12));
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          const p = Math.floor((y / size) * planks);
          const seam = Math.abs(((y / size) * planks) % 1 - 0.5) > 0.46 ? 0.45 : 1;
          const grain = 0.82 + 0.34 * fbm(x * 0.09, y * 0.9, seed, 4);
          const s = shade[p] * grain * seam;
          data[i] = Math.min(255, 132 * s);
          data[i + 1] = Math.min(255, 86 * s);
          data[i + 2] = Math.min(255, 48 * s);
          data[i + 3] = 255;
        }
      }
    })
  );
}

/** Rusted / weathered metal sheet with rivet rows. */
export function metalTexture(seed = 11, tint = [92, 96, 104]) {
  return cached(`metal${seed}_${tint.join('')}`, () =>
    makeDataTexture(256, (data, size) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          let n = fbm(x * 0.05, y * 0.05, seed, 5);
          const rust = Math.max(0, fbm(x * 0.02 + 40, y * 0.02, seed + 7, 3) - 0.52) * 2.4;
          const rivetX = (x % 32) - 16;
          const rivetY = (y % 32) - 16;
          const rivet = Math.hypot(rivetX, rivetY) < 3 ? 1.35 : 1;
          const shade = (0.78 + n * 0.42) * rivet;
          const r = tint[0] * shade + rust * 120;
          const g = tint[1] * shade + rust * 58;
          const b = tint[2] * shade + rust * 22;
          data[i] = Math.min(255, r);
          data[i + 1] = Math.min(255, g);
          data[i + 2] = Math.min(255, b);
          data[i + 3] = 255;
        }
      }
    })
  );
}

/** Painted steel with subtle scratches (armored car / vault). */
export function paintedSteelTexture(seed = 21, tint = [64, 68, 78]) {
  return cached(`paint${seed}_${tint.join('')}`, () =>
    makeDataTexture(256, (data, size) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          const n = fbm(x * 0.08, y * 0.08, seed, 4);
          const scratch = noise2D(x * 0.9, y * 3.1 + x * 0.2, seed + 3) > 0.985 ? 1.5 : 1;
          const s = (0.85 + n * 0.3) * scratch;
          data[i] = Math.min(255, tint[0] * s);
          data[i + 1] = Math.min(255, tint[1] * s);
          data[i + 2] = Math.min(255, tint[2] * s);
          data[i + 3] = 255;
        }
      }
    })
  );
}

/** Dry desert ground: warm sand with pebbles and patchy dry grass. */
export function groundTexture(seed = 5) {
  return cached(`ground${seed}`, () =>
    makeDataTexture(256, (data, size) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          const n = fbm(x * 0.03, y * 0.03, seed, 5);
          const patch = fbm(x * 0.012 + 11, y * 0.012, seed + 2, 3);
          const pebble = noise2D(x * 1.7, y * 1.7, seed + 9) > 0.995 ? 0.72 : 1;
          const grass = Math.max(0, patch - 0.55) * 0.9;
          const s = (0.72 + n * 0.5) * pebble;
          data[i] = Math.min(255, (176 + grass * -40) * s);
          data[i + 1] = Math.min(255, (128 + grass * -30) * s);
          data[i + 2] = Math.min(255, (78 + grass * -20) * s);
          data[i + 3] = 255;
        }
      }
    })
  );
}

/** Coarse track ballast. */
export function ballastTexture(seed = 8) {
  return cached(`ballast${seed}`, () =>
    makeDataTexture(128, (data, size) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          const n = noise2D(x * 0.4, y * 0.4, seed) * 0.7 + fbm(x * 0.12, y * 0.12, seed + 4, 3) * 0.5;
          const s = 0.55 + n * 0.8;
          data[i] = Math.min(255, 118 * s);
          data[i + 1] = Math.min(255, 110 * s);
          data[i + 2] = Math.min(255, 100 * s);
          data[i + 3] = 255;
        }
      }
    })
  );
}

/** Soft radial sprite used for dust, smoke, glow and muzzle flashes. */
export function radialSpriteTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return cached(`radial${inner}${outer}`, () => {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    const ci = parseColor(inner);
    const co = parseColor(outer);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const dx = (x / (size - 1)) * 2 - 1;
        const dy = (y / (size - 1)) * 2 - 1;
        const d = Math.min(1, Math.hypot(dx, dy));
        const t = Math.pow(1 - d, 1.6);
        data[i] = co[0] + (ci[0] - co[0]) * t;
        data[i + 1] = co[1] + (ci[1] - co[1]) * t;
        data[i + 2] = co[2] + (ci[2] - co[2]) * t;
        data[i + 3] = (co[3] + (ci[3] - co[3]) * t) * 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  });
}

/** Vertical streak sprite for god-rays / steam bursts. */
export function streakTexture() {
  return cached('streak', () => {
    const w = 32;
    const h = 128;
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const cx = Math.abs(x / (w - 1) - 0.5) * 2;
        const cy = y / (h - 1);
        const a = Math.max(0, 1 - cx) * Math.pow(1 - cy, 1.4);
        data[i] = 255;
        data[i + 1] = 235;
        data[i + 2] = 200;
        data[i + 3] = a * 220;
      }
    }
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/** Small square used for sparks / debris quads. */
export function sparkTexture() {
  return cached('spark', () =>
    makeDataTexture(32, (data, size) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          const dx = Math.abs(x / (size - 1) - 0.5) * 2;
          const dy = Math.abs(y / (size - 1) - 0.5) * 2;
          const a = Math.max(0, 1 - Math.max(dx, dy * 0.35));
          data[i] = 255;
          data[i + 1] = 220 - dy * 80;
          data[i + 2] = 150 - dy * 110;
          data[i + 3] = a * 255;
        }
      }
    })
  );
}

function parseColor(str) {
  if (str.startsWith('#')) {
    const n = parseInt(str.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s));
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  }
  return [255, 255, 255, 1];
}

function cached(key, factory) {
  let tex = CACHE.get(key);
  if (!tex) {
    tex = factory();
    CACHE.set(key, tex);
  }
  return tex;
}

export function disposeTextureCache() {
  for (const tex of CACHE.values()) tex.dispose?.();
  CACHE.clear();
}
