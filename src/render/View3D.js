// -----------------------------------------------------------------------------
// View3D - the three.js presentation layer.
//
// Everything gameplay related stays in the core (no three.js imports there). This
// class owns the renderer, scene, camera, sky/lighting rig, the instanced world
// and the character views, and it is entirely optional: when it is missing the
// simulation still runs (which is how the headless tests work).
// -----------------------------------------------------------------------------
import * as THREE from 'three';
import { InstancedWorld, getMaterial } from './InstancedWorld.js';
import { CharacterView } from './CharacterView.js';
import { Sky } from './Sky.js';
import { EffectsSystem } from '../fx/EffectsSystem.js';
import { PREFABS } from '../world/Prefabs.js';
import { Materials, Geo, buildSharedAssets } from '../utils/Materials.js';
import { QUALITY, CAMERA, EFFECTS } from '../game/Config.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class View3D {
  constructor(canvas, { quality = 'high', onReady = null } = {}) {
    this.canvas = canvas;
    this.quality = quality;
    this.settings = QUALITY[quality] || QUALITY.high;
    // shared materials + unit geometries must exist before anything is built
    buildSharedAssets();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality !== 'low',
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.settings.pixelRatio));
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x1a1220, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xe8a066, EFFECTS.fogNear, this.settings.fogFar);

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 16 / 9, CAMERA.near, CAMERA.far);
    this.camera.position.set(0, 8, 16);

    this.instanced = new InstancedWorld(this.scene);
    this.sky = new Sky(this.scene, { quality });
    this.effects = new EffectsSystem(this.scene, this.camera, { qualityScale: this.settings.particleScale * 1.15 });

    /** pooled car interior lights (follow the player along the consist) */
    this.lightSlots = [];
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffb070, 0, 12, 2);
      light.visible = false;
      this.scene.add(light);
      this.lightSlots.push(light);
    }

    /** @type {Map<any, CharacterView>} */
    this.characters = new Map();
    this.lootMeshes = [];
    this.barrelMeshes = [];
    this.destructibles = [];
    this.entitySpecs = new Map();

    this.stats = { partCount: 0, characterCount: 0 };
    this.clock = 0;
    this.onResize();
    if (onReady) onReady(this);
  }

  // ---------------------------------------------------------------------------
  // world construction
  // ---------------------------------------------------------------------------

  buildWorld({ train, environment, lootSystem = null, destructibles = null }) {
    // --- static geometry ------------------------------------------------------
    this.instanced.addStaticParts(train.parts, 'train');
    this.instanced.addStaticParts(environment.staticParts, 'terrain');

    // --- dynamic groups ------------------------------------------------------
    for (const group of train.groups) this.instanced.addDynamicGroup(group);
    for (const group of environment.groups) this.instanced.addDynamicGroup(group);

    // --- scrolling props -----------------------------------------------------
    this.propEntries = new Map();
    const byKind = environment.propsByKind();
    for (const [kind, props] of byKind) {
      const prefab = PREFABS[kind] || SLEEPER_PREFAB;
      const entry = this.instanced.addPropKind(kind, prefab, props.length);
      entry.props = props;
      this.propEntries.set(kind, entry);
      for (let i = 0; i < props.length; i++) this.instanced.setPropTransform(entry, i, props[i]);
      entry.count = props.length;
      for (const mesh of entry.meshes) {
        mesh.count = props.length;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }

    // --- loot props ----------------------------------------------------------
    if (lootSystem) this.buildLoot(lootSystem);

    // --- explosive barrels (individual meshes so they can be destroyed) ------
    this.buildBarrels(train, destructibles);

    this.stats.partCount = this.instanced.partCount;
    this.instanced.setShadows(this.settings.shadows);
    return this;
  }

  buildLoot(lootSystem) {
    for (const item of lootSystem.items) {
      const group = new THREE.Group();
      const isBig = item.big;
      if (item.type === 'gold') {
        for (let i = 0; i < 3; i++) {
          const bar = new THREE.Mesh(Geo.box, getMaterial('gold'));
          bar.scale.set(0.34, 0.11, 0.16);
          bar.position.set((i - 1) * 0.04, i * 0.12 - 0.16, (i % 2) * 0.06);
          bar.castShadow = true;
          group.add(bar);
        }
      } else if (item.type === 'money' || item.type === 'treasure') {
        const bag = new THREE.Mesh(Geo.sphere, getMaterial('signWood'));
        bag.scale.set(0.4, 0.42, 0.4);
        bag.castShadow = true;
        group.add(bag);
        const tie = new THREE.Mesh(Geo.cyl, getMaterial('trim'));
        tie.scale.set(0.16, 0.12, 0.16);
        tie.position.y = 0.22;
        group.add(tie);
        if (isBig) {
          group.scale.setScalar(1.6);
          const glow = new THREE.PointLight(0xffc040, 12, 9, 2);
          group.add(glow);
        }
      } else if (item.type === 'jewelry') {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12), getMaterial('gold'));
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
        const gem = new THREE.Mesh(Geo.sphere, getMaterial('glass'));
        gem.scale.setScalar(0.16);
        gem.position.y = 0.12;
        group.add(gem);
      } else {
        const stack = new THREE.Mesh(Geo.box, getMaterial('shirtPlayer'));
        stack.scale.set(0.36, 0.1, 0.26);
        group.add(stack);
        const stack2 = new THREE.Mesh(Geo.box, getMaterial('shirtPlayer'));
        stack2.scale.set(0.32, 0.1, 0.24);
        stack2.position.y = 0.11;
        group.add(stack2);
      }
      group.position.set(item.x, item.y, item.z);
      group.name = `loot_${item.id}`;
      this.scene.add(group);
      this.lootMeshes.push({ item, group });
    }
  }

  buildBarrels(train, destructibles) {
    for (const car of train.cars) {
      if (!car.explosiveBarrels) continue;
      for (const entry of car.explosiveBarrels) {
        const group = new THREE.Group();
        const body = new THREE.Mesh(Geo.cylinderHi, getMaterial('explosive'));
        body.scale.set(0.68, 0.95, 0.68);
        body.castShadow = true;
        group.add(body);
        for (const y of [-0.24, 0.24]) {
          const ring = new THREE.Mesh(Geo.cylinderHi, getMaterial('ironDark'));
          ring.scale.set(0.72, 0.07, 0.72);
          ring.position.y = y;
          group.add(ring);
        }
        const mark = new THREE.Mesh(Geo.box, getMaterial('signWood'));
        mark.scale.set(0.4, 0.24, 0.02);
        mark.position.set(0, 0.16, 0.35);
        group.add(mark);
        group.position.set(entry.x, entry.y, entry.z);
        this.scene.add(group);
        entry.box.data = entry.box.data || {};
        entry.box.data.view = group;
        this.barrelMeshes.push({ entry, group });
      }
    }
  }

  /** Adds a landmark structure that is spawned mid-run. */
  addStructure(group) {
    if (!this.instanced.groupObjects.has(group.id)) this.instanced.addDynamicGroup(group);
    return this.instanced.groupObjects.get(group.id);
  }

  /** Picks up structures the gameplay spawned since the last frame. */
  syncStructures(environment) {
    if (!environment) return;
    for (const group of environment.groups) {
      if (!this.instanced.groupObjects.has(group.id)) this.instanced.addDynamicGroup(group);
    }
    if (this._groupCount !== environment.groups.length) {
      this._groupCount = environment.groups.length;
      const live = new Set(environment.groups.map((g) => g.id));
      for (const [id, record] of this.instanced.groupObjects) {
        if (!id.startsWith('struct_')) continue;
        if (live.has(id)) continue;
        record.holder.removeFromParent();
        this.instanced.groupObjects.delete(id);
      }
    }
  }

  /** Tears down all world geometry (used when a run restarts). */
  rebuildWorld(opts) {
    for (const mesh of this.instanced.staticMeshes) {
      mesh.geometry.dispose();
      mesh.removeFromParent();
    }
    for (const entry of this.instanced.propKinds.values()) {
      for (const mesh of entry.meshes) {
        mesh.geometry.dispose();
        mesh.removeFromParent();
      }
    }
    for (const record of this.instanced.groupObjects.values()) record.holder.removeFromParent();
    this.instanced.staticMeshes.length = 0;
    this.instanced.propKinds.clear();
    this.instanced.groupObjects.clear();
    this.instanced._texScrollTargets.length = 0;
    for (const entry of this.lootMeshes) entry.group.removeFromParent();
    this.lootMeshes.length = 0;
    for (const entry of this.barrelMeshes) entry.group.removeFromParent();
    this.barrelMeshes.length = 0;
    for (const view of this.characters.values()) view.dispose();
    this.characters.clear();
    if (this.wheelMesh) {
      this.wheelMesh.removeFromParent();
      this.wheelMesh = null;
    }
    this.propEntries = null;
    return this.buildWorld(opts);
  }

  removeStructure(group) {
    const record = this.instanced.groupObjects.get(group.id);
    if (!record) return;
    record.holder.removeFromParent();
    this.instanced.groupObjects.delete(group.id);
  }

  // ---------------------------------------------------------------------------
  // characters
  // ---------------------------------------------------------------------------

  specFor(entity) {
    if (entity.type === 'player') {
      return {
        name: 'player',
        colors: { coat: 'coatPlayer', coatDark: 'coatPlayerDark', shirt: 'shirtPlayer', pants: 'pantsPlayer', hat: 'hatBrown', skin: 'skin' },
        weapon: 'revolver',
        hat: 'cowboy',
        height: 1.78,
        build: 'slim',
      };
    }
    const def = entity.def || {};
    const colors = def.colors || {};
    const weaponMap = { guardRevolver: 'revolver', rifle: 'rifle', shotgun: 'shotgun', heavy: 'heavy', bossCannon: def.isBoss ? 'cannon' : 'rifle' };
    return {
      name: entity.id,
      colors,
      weapon: weaponMap[def.weapon] || 'revolver',
      hat: def.id === 'heavy' ? 'helmet' : def.isBoss ? 'cap' : def.id === 'elite' ? 'cap' : 'cowboy',
      height: def.height ?? 1.8,
      scale: def.isBoss ? 1.14 : def.id === 'heavy' ? 1.08 : 1,
      build: def.id === 'heavy' || def.isBoss ? 'heavy' : 'slim',
    };
  }

  createCharacter(entity) {
    const spec = this.specFor(entity);
    const view = new CharacterView(spec);
    this.scene.add(view.root);
    this.characters.set(entity, view);
    this.stats.characterCount = this.characters.size;
    return view;
  }

  removeCharacter(entity) {
    const view = this.characters.get(entity);
    if (!view) return;
    view.dispose();
    this.characters.delete(entity);
    this.stats.characterCount = this.characters.size;
  }

  // ---------------------------------------------------------------------------
  // per frame
  // ---------------------------------------------------------------------------

  syncCamera(cameraController) {
    const p = cameraController.renderPosition;
    const look = cameraController.lookAt;
    this.camera.position.set(p.x, p.y, p.z);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(look.x, look.y, look.z);
    if (cameraController.roll) this.camera.rotateZ(cameraController.roll);
    if (Math.abs(this.camera.fov - cameraController.fov) > 0.001) {
      this.camera.fov = cameraController.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  update(dt, ctx) {
    this.clock += dt;
    const { cameraController, train, environment, player, enemies, effects } = ctx;

    if (cameraController) this.syncCamera(cameraController);

    // structures spawned mid-run (hazards / escape sequence)
    if (environment) this.syncStructures(environment);

    // dynamic groups
    this.instanced.updateDynamicGroups();

    // wheels
    if (train) this.syncWheels(train);

    // interior / exterior lights around the player
    if (train && player) this.syncLights(train, player);

    // props
    if (this.propEntries) {
      for (const [kind, entry] of this.propEntries) {
        for (let i = 0; i < entry.props.length; i++) this.instanced.setPropTransform(entry, i, entry.props[i]);
        for (const mesh of entry.meshes) mesh.instanceMatrix.needsUpdate = true;
      }
    }

    // ground/water texture scroll
    this.instanced.updateScroll(environment ? environment.groundScroll : 0);

    // sky + lighting
    this.sky.update(dt, {
      distance: environment ? environment.distance : 0,
      darkness: environment ? environment.darkness : 0,
      camera: this.camera,
    });
    if (environment) {
      const t = Math.min(1, environment.distance / 2600);
      this.sky.setTimeOfDay(t);
      this.scene.fog.color.copy(this.sky.material.uniforms.uHorizon.value);
      this.scene.fog.far = this.settings.fogFar - t * 40;
    }

    // characters
    for (const [entity, view] of this.characters) {
      view.sync(entity, this.camera, dt);
    }

    // loot visibility
    for (const entry of this.lootMeshes) {
      const taken = entry.item.taken;
      entry.group.visible = !taken;
      if (!taken) entry.group.rotation.y += dt * 0.8;
    }

    // effects
    if (effects) {
      effects.update(dt, { wind: ctx.wind ? ctx.wind.x : 0, windY: ctx.wind ? ctx.wind.y : 0 });
      effects.setPixelScale(this.renderer.domElement.height, this.camera.fov);
    }
  }

  /** Pooled point lights for the car the player is in (night + tunnel mood). */
  syncLights(train, player) {
    const slots = train.getLightSlots(player.pos, this.lightSlots.length);
    for (let i = 0; i < this.lightSlots.length; i++) {
      const light = this.lightSlots[i];
      const slot = slots[i];
      if (!slot) {
        light.visible = false;
        continue;
      }
      light.position.set(slot.x, slot.y, slot.z);
      light.color.setHex(slot.color ?? 0xffb070);
      light.intensity = slot.intensity ?? 4;
      light.distance = 13;
      light.visible = true;
    }
  }

  syncWheels(train) {
    if (!this.wheelMesh) {
      this.wheelMesh = new THREE.InstancedMesh(
        mergeWheelGeometry(),
        getMaterial('ironDark'),
        train.wheelPositions.length
      );
      this.wheelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.wheelMesh.castShadow = this.settings.shadows;
      this.wheelMesh.frustumCulled = false;
      this.scene.add(this.wheelMesh);
      this._wheelMatrix = new THREE.Matrix4();
      this._wheelQuat = new THREE.Quaternion();
      this._wheelPos = new THREE.Vector3();
      this._wheelScale = new THREE.Vector3(1, 1, 1);
      this._wheelAxis = new THREE.Vector3(0, 0, 1);
    }
    this._wheelQuat.setFromAxisAngle(this._wheelAxis, train.wheelAngle);
    for (let i = 0; i < train.wheelPositions.length; i++) {
      const p = train.wheelPositions[i];
      this._wheelMatrix.compose(this._wheelPos.set(p.x, p.y, p.z), this._wheelQuat, this._wheelScale);
      this.wheelMesh.setMatrixAt(i, this._wheelMatrix);
    }
    this.wheelMesh.instanceMatrix.needsUpdate = true;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  setQuality(level) {
    this.quality = level;
    this.settings = QUALITY[level] || QUALITY.high;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.settings.pixelRatio));
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.sky.sun.castShadow = this.settings.shadows;
    this.instanced.setShadows(this.settings.shadows);
    if (this.wheelMesh) this.wheelMesh.castShadow = this.settings.shadows;
    this.scene.traverse((o) => {
      if (o.isMesh && o.material && o.material.isMeshStandardMaterial) o.material.needsUpdate = true;
    });
    this.onResize();
  }

  dispose() {
    for (const view of this.characters.values()) view.dispose();
    this.characters.clear();
    this.instanced.dispose();
    this.renderer.dispose();
  }
}

const SLEEPER_PREFAB = [
  { g: 'box', m: 'sleeper', x: 0, y: 0, z: 0, sx: 0.28, sy: 0.16, sz: 3.4 },
  { g: 'box', m: 'ballast', x: 0, y: -0.1, z: 0, sx: 0.6, sy: 0.1, sz: 3.6 },
];

function mergeWheelGeometry() {
  const parts = [];
  const tyre = new THREE.CylinderGeometry(0.46, 0.46, 0.16, 14);
  tyre.rotateX(Math.PI / 2);
  parts.push(tyre);
  const hub = new THREE.CylinderGeometry(0.13, 0.13, 0.22, 8);
  hub.rotateX(Math.PI / 2);
  parts.push(hub);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.BoxGeometry(0.8, 0.07, 0.09);
    spoke.rotateZ((i * Math.PI) / 4);
    parts.push(spoke);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

export default View3D;
