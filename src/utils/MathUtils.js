// -----------------------------------------------------------------------------
// Small math helpers shared across gameplay systems.
// -----------------------------------------------------------------------------

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

export const lerp = (a, b, t) => a + (b - a) * t;

/** Framerate independent exponential smoothing. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export const smoothstep = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

export const invLerp = (a, b, v) => (b === a ? 0 : clamp((v - a) / (b - a), 0, 1));

export const randRange = (min, max) => min + Math.random() * (max - min);

export const randSign = () => (Math.random() < 0.5 ? -1 : 1);

export const deg = (r) => (r * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;

/** Shortest signed angular distance from a to b. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const dampAngle = (a, b, lambda, dt) => a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));

export const isFiniteVec = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/** Axis aligned box helpers (plain objects: {minX,maxX,minY,maxY,minZ,maxZ}). */
export function boxFromCenterSize(cx, cy, cz, sx, sy, sz) {
  return {
    minX: cx - sx / 2,
    maxX: cx + sx / 2,
    minY: cy - sy / 2,
    maxY: cy + sy / 2,
    minZ: cz - sz / 2,
    maxZ: cz + sz / 2,
  };
}

export function expandBox(box, amount) {
  return {
    minX: box.minX - amount,
    maxX: box.maxX + amount,
    minY: box.minY - amount,
    maxY: box.maxY + amount,
    minZ: box.minZ - amount,
    maxZ: box.maxZ + amount,
  };
}

export function pointInBox(x, y, z, b) {
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ;
}

export function boxesOverlap(a, b) {
  return (
    a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minY <= b.maxY &&
    a.maxY >= b.minY &&
    a.minZ <= b.maxZ &&
    a.maxZ >= b.minZ
  );
}

export function boxCenter(b) {
  return {
    x: (b.minX + b.maxX) / 2,
    y: (b.minY + b.maxY) / 2,
    z: (b.minZ + b.maxZ) / 2,
  };
}

/** Slab method ray/box intersection. Returns distance or -1. */
export function rayBox(ox, oy, oz, dx, dy, dz, b, maxDist = Infinity) {
  const invx = 1 / (dx || 1e-9);
  const invy = 1 / (dy || 1e-9);
  const invz = 1 / (dz || 1e-9);
  let t1 = (b.minX - ox) * invx;
  let t2 = (b.maxX - ox) * invx;
  let tmin = Math.min(t1, t2);
  let tmax = Math.max(t1, t2);
  t1 = (b.minY - oy) * invy;
  t2 = (b.maxY - oy) * invy;
  tmin = Math.max(tmin, Math.min(t1, t2));
  tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (b.minZ - oz) * invz;
  t2 = (b.maxZ - oz) * invz;
  tmin = Math.max(tmin, Math.min(t1, t2));
  tmax = Math.min(tmax, Math.max(t1, t2));
  if (tmax < 0 || tmin > tmax || tmin > maxDist) return -1;
  return tmin < 0 ? 0 : tmin;
}

/** Formats a number like 8_500 -> "8,500". */
export function formatNumber(n) {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Formats seconds like 522 -> "08:42". */
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function formatMoney(n) {
  return '$' + formatNumber(n);
}
