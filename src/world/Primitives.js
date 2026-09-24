// -----------------------------------------------------------------------------
// Primitive descriptors.
//
// Gameplay code never touches three.js: it describes geometry as plain data and
// the render layer (render/InstancedWorld.js) turns those descriptors into
// instanced meshes grouped by material. Keeps the core simulation testable in
// plain node and keeps draw calls low.
//
// Descriptor: { g, m, x, y, z, sx, sy, sz, rx, ry, rz, alpha? }
//   g  geometry: box | cyl | sphere | cone | plane | torus | capsule
//   m  material key from utils/Materials.js
// -----------------------------------------------------------------------------

export function box(m, x, y, z, sx, sy, sz, o = {}) {
  const d = { g: 'box', m, x, y, z, sx, sy, sz, rx: o.rx || 0, ry: o.ry || 0, rz: o.rz || 0, alpha: o.alpha };
  if (o.texScroll) d.texScroll = o.texScroll;
  return d;
}

export function cyl(m, x, y, z, radius, length, o = {}) {
  const axis = o.axis || 'y';
  return {
    g: o.hi ? 'cylHi' : 'cyl',
    m,
    x,
    y,
    z,
    sx: radius * 2,
    sy: length,
    sz: radius * 2,
    rx: axis === 'z' ? Math.PI / 2 : o.rx || 0,
    rz: axis === 'x' ? Math.PI / 2 : o.rz || 0,
    ry: o.ry || 0,
    alpha: o.alpha,
  };
}

export function sphere(m, x, y, z, r, o = {}) {
  return { g: 'sphere', m, x, y, z, sx: r * 2, sy: r * 2, sz: r * 2, rx: o.rx || 0, ry: o.ry || 0, rz: o.rz || 0, alpha: o.alpha };
}

export function cone(m, x, y, z, r, h, o = {}) {
  return { g: 'cone', m, x, y, z, sx: r * 2, sy: h, sz: r * 2, rx: o.rx || 0, ry: o.ry || 0, rz: o.rz || 0, alpha: o.alpha };
}

export function plane(m, x, y, z, sx, sy, o = {}) {
  const d = { g: 'plane', m, x, y, z, sx, sy, sz: 1, rx: o.rx || 0, ry: o.ry || 0, rz: o.rz || 0, alpha: o.alpha };
  if (o.texScroll) d.texScroll = o.texScroll;
  return d;
}

export function torus(m, x, y, z, radius, tube, o = {}) {
  return { g: 'torus', m, x, y, z, sx: radius * 2, sy: radius * 2, sz: tube * 2, rx: o.rx || 0, ry: o.ry || 0, rz: o.rz || 0 };
}

/**
 * A group of parts that can move as a unit (doors, vault wheel, levers...).
 * `state` is mutated by gameplay code; the render layer copies it onto a
 * THREE.Group every frame.
 */
export function dynamicGroup(id, pivot = { x: 0, y: 0, z: 0 }, parts = []) {
  const state = { x: pivot.x, y: pivot.y, z: pivot.z, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, visible: true };
  return { id, kind: 'group', pivot: { ...pivot }, parts, state, local: true };
}

/**
 * Collects descriptors and groups them by (material, geometry) for instancing.
 */
export class PartList {
  constructor(owner = null) {
    this.owner = owner;
    this.parts = [];
    this.groups = [];
  }

  add(part) {
    if (!part) return part;
    this.parts.push(part);
    return part;
  }

  addMany(parts) {
    if (!parts) return;
    for (const p of parts) this.add(p);
  }

  addGroup(group) {
    this.groups.push(group);
    return group;
  }

  get length() {
    return this.parts.length + this.groups.reduce((n, g) => n + g.parts.length, 0);
  }

  /** Merges another PartList (already in world/local space) into this one. */
  merge(other) {
    this.addMany(other.parts);
    for (const g of other.groups) this.addGroup(g);
    return this;
  }
}

export default { box, cyl, sphere, cone, plane, torus, dynamicGroup, PartList };
