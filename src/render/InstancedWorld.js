// -----------------------------------------------------------------------------
// InstancedWorld - turns primitive descriptors into GPU geometry.
//
//  * static parts (train, terrain, structures) are merged per material into a
//    handful of meshes -> a few dozen draw calls for the whole level
//  * scrolling props are drawn with one InstancedMesh per (prefab, material)
//  * dynamic groups (doors, vault mechanism, landmarks) become real THREE.Groups
//    whose transforms are copied from gameplay state every frame
// -----------------------------------------------------------------------------
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Materials, Geo } from '../utils/Materials.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export function unitGeometry(kind) {
  switch (kind) {
    case 'cyl':
      return Geo.cylinder;
    case 'cylHi':
      return Geo.cylinderHi;
    case 'sphere':
      return Geo.sphere;
    case 'cone':
      return Geo.cone;
    case 'plane':
      return Geo.plane;
    case 'torus':
      return Geo.torus;
    case 'capsule':
      return Geo.capsule;
    case 'box':
    default:
      return Geo.box;
  }
}

/** Clones `base` and bakes the descriptor transform into it. */
export function transformedGeometry(desc, base = null) {
  const geo = (base || unitGeometry(desc.g)).clone();
  _e.set(desc.rx || 0, desc.ry || 0, desc.rz || 0, 'YXZ');
  _q.setFromEuler(_e);
  _m.compose(
    _v.set(desc.x || 0, desc.y || 0, desc.z || 0),
    _q,
    _s.set(desc.sx ?? 1, desc.sy ?? 1, desc.sz ?? 1)
  );
  geo.applyMatrix4(_m);
  return geo;
}

export class InstancedWorld {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);
    this.staticMeshes = [];
    this.propKinds = new Map();
    this.groupObjects = new Map();
    this._texScrollTargets = [];
  }

  /**
   * Merges static descriptors into one mesh per material.
   * @param {Array<object>} parts
   * @param {string} name
   */
  addStaticParts(parts, name = 'static') {
    const buckets = new Map();
    for (const p of parts) {
      if (!p) continue;
      const key = p.m;
      let arr = buckets.get(key);
      if (!arr) {
        arr = [];
        buckets.set(key, arr);
      }
      arr.push(transformedGeometry(p));
      if (p.texScroll) this._texScrollTargets.push({ material: p.m, speed: p.texScroll });
    }
    for (const [matKey, geos] of buckets) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, getMaterial(matKey));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `${name}_${matKey}`;
      this.root.add(mesh);
      this.staticMeshes.push(mesh);
    }
    return this.staticMeshes;
  }

  /**
   * Builds the instanced meshes for one prefab kind.
   * @param {string} kind
   * @param {Array<object>} prefabParts descriptors in local space
   * @param {number} capacity
   */
  addPropKind(kind, prefabParts, capacity) {
    if (this.propKinds.has(kind)) return this.propKinds.get(kind);
    const buckets = new Map();
    for (const p of prefabParts) {
      let arr = buckets.get(p.m);
      if (!arr) {
        arr = [];
        buckets.set(p.m, arr);
      }
      arr.push(transformedGeometry(p));
    }
    const meshes = [];
    for (const [matKey, geos] of buckets) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const inst = new THREE.InstancedMesh(merged, getMaterial(matKey), capacity);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.frustumCulled = false; // props wrap around a huge area
      inst.count = 0;
      inst.name = `prop_${kind}_${matKey}`;
      this.root.add(inst);
      meshes.push(inst);
    }
    const entry = { kind, meshes, capacity, count: 0 };
    this.propKinds.set(kind, entry);
    return entry;
  }

  /** Writes the transform of one prop instance into every mesh of its kind. */
  setPropTransform(entry, index, prop) {
    _e.set(0, prop.rot || 0, 0, 'YXZ');
    _q.setFromEuler(_e);
    const scale = prop.scale ?? 1;
    _m.compose(_v.set(prop.x, prop.y ?? 0, prop.z), _q, _s.set(scale, scale, scale));
    for (const mesh of entry.meshes) mesh.setMatrixAt(index, _m);
  }

  /** Builds a THREE.Group for a gameplay driven dynamic group. */
  addDynamicGroup(group, { castShadow = true } = {}) {
    const holder = new THREE.Group();
    holder.name = group.id;
    const children = [];
    for (const part of group.parts) {
      const geo = unitGeometry(part.g);
      const mesh = new THREE.Mesh(geo, getMaterial(part.m));
      mesh.position.set(part.x || 0, part.y || 0, part.z || 0);
      mesh.rotation.set(part.rx || 0, part.ry || 0, part.rz || 0);
      mesh.scale.set(part.sx ?? 1, part.sy ?? 1, part.sz ?? 1);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      holder.add(mesh);
      children.push(mesh);
    }
    holder.position.set(group.state.x, group.state.y, group.state.z);
    holder.rotation.set(group.state.rx, group.state.ry, group.state.rz);
    this.root.add(holder);
    const record = { group, holder, children };
    this.groupObjects.set(group.id, record);
    return record;
  }

  updateDynamicGroups() {
    for (const record of this.groupObjects.values()) {
      const s = record.group.state;
      record.holder.position.set(s.x, s.y, s.z);
      record.holder.rotation.set(s.rx, s.ry, s.rz);
      record.holder.scale.set(s.sx ?? 1, s.sy ?? 1, s.sz ?? 1);
      record.holder.visible = s.visible !== false;
    }
  }

  /** Scrolls UVs on materials flagged with texScroll. */
  updateScroll(distance) {
    for (const target of this._texScrollTargets) {
      const mat = Materials[target.material];
      if (!mat?.map) continue;
      const repeat = mat.map.repeat;
      const scale = target.speed === 'ground' ? 0.01 : 0.02;
      mat.map.offset.x = (distance * scale) % 1;
      if (repeat.x > 1) mat.map.offset.x *= 1;
    }
  }

  setShadows(enabled) {
    for (const mesh of this.staticMeshes) {
      mesh.castShadow = enabled;
      mesh.receiveShadow = enabled;
    }
    for (const entry of this.propKinds.values()) {
      for (const mesh of entry.meshes) {
        mesh.castShadow = enabled;
      }
    }
    for (const record of this.groupObjects.values()) {
      for (const child of record.children) child.castShadow = enabled;
    }
  }

  get partCount() {
    return this.staticMeshes.length;
  }

  dispose() {
    for (const mesh of this.staticMeshes) mesh.geometry.dispose();
    for (const entry of this.propKinds.values()) {
      for (const mesh of entry.meshes) mesh.geometry.dispose();
    }
    for (const record of this.groupObjects.values()) {
      for (const child of record.children) child.geometry?.dispose?.();
    }
    this.root.removeFromParent();
  }
}

export function getMaterial(key) {
  const mat = Materials[key];
  if (mat) return mat;
  // fallback so a typo can never crash the game
  if (!Materials.__fallback) {
    Materials.__fallback = new THREE.MeshStandardMaterial({ color: 0xff00ff, roughness: 0.6 });
  }
  return Materials.__fallback;
}

export default InstancedWorld;
