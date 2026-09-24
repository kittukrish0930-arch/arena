// -----------------------------------------------------------------------------
// Render layer test (headless, no WebGL).
//
// Verifies everything the 3D layer does with plain three.js objects: material
// keys, geometry kinds, geometry merging (the risky part - a failed merge means
// an invisible world), instancing, the character rig and the sky rig.
//
//   node tools/render-test.mjs
// -----------------------------------------------------------------------------
import * as THREE from 'three';

let failures = 0;
let checks = 0;
function check(name, condition, detail = '') {
  checks++;
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function section(name) {
  console.log(`\n=== ${name}`);
}

const { Materials, Geo, buildSharedAssets } = await import('../src/utils/Materials.js');
const { InstancedWorld, unitGeometry, transformedGeometry } = await import('../src/render/InstancedWorld.js');
const { CharacterView } = await import('../src/render/CharacterView.js');
const { Sky } = await import('../src/render/Sky.js');
const { PREFABS } = await import('../src/world/Prefabs.js');
const { CollisionWorld } = await import('../src/physics/CollisionWorld.js');
const { Train } = await import('../src/train/Train.js');
const { Environment } = await import('../src/environment/Environment.js');
const { createPose, animateCharacter } = await import('../src/characters/CharacterRig.js');
const { Player } = await import('../src/player/Player.js');

buildSharedAssets();

section('materials + geometries');
const materialKeys = Object.keys(Materials).filter((k) => k !== '_built' && !k.startsWith('__') && typeof Materials[k]?.isMaterial !== 'undefined' || Materials[k]?.isMaterial);
check('materials built', materialKeys.length > 20, `keys=${materialKeys.length}`);
for (const kind of ['box', 'plane', 'cylinder', 'cylinderHi', 'sphere', 'cone', 'torus', 'capsule']) {
  check(`geometry "${kind}" exists`, !!Geo[kind]);
}
// every shared material must be a real three material
let badMaterial = null;
for (const key of materialKeys) {
  const m = Materials[key];
  if (!m || !m.isMaterial) badMaterial = key;
}
check('every material key holds a THREE material', !badMaterial, String(badMaterial));

section('world building blocks');
const world = new CollisionWorld();
const train = new Train(world);
const environment = new Environment(world, { density: 1 });

// --- collect every descriptor the game produces ------------------------------
const descriptors = [...train.parts, ...environment.staticParts];
for (const group of [...train.groups, ...environment.groups]) descriptors.push(...group.parts);
for (const [kind, parts] of Object.entries(PREFABS)) {
  for (const p of parts) descriptors.push({ ...p, __kind: kind });
}
check('descriptor count is large', descriptors.length > 800, `count=${descriptors.length}`);

const unknownGeometry = new Set();
const unknownMaterial = new Set();
for (const d of descriptors) {
  if (!unitGeometryKnown(d.g)) unknownGeometry.add(d.g);
  if (!Materials[d.m]) unknownMaterial.add(d.m);
}
function unitGeometryKnown(kind) {
  return ['box', 'cyl', 'cylHi', 'sphere', 'cone', 'plane', 'torus', 'capsule', undefined].includes(kind);
}
check('no unknown geometry kinds', unknownGeometry.size === 0, [...unknownGeometry].join(','));
check('no unknown material keys', unknownMaterial.size === 0, [...unknownMaterial].join(','));

// --- props cover the prefabs --------------------------------------------------
const byKind = environment.propsByKind();
const missingPrefabs = [...byKind.keys()].filter((k) => !PREFABS[k]);
check('every scrolling prop kind has a prefab', missingPrefabs.length === 0, missingPrefabs.join(','));
check('props are spread over several kinds', byKind.size >= 6, `kinds=${[...byKind.keys()].join(',')}`);

section('geometry merging (instanced world)');
const scene = new THREE.Scene();
const view = new InstancedWorld(scene);
view.addStaticParts(train.parts, 'train');
view.addStaticParts(environment.staticParts, 'terrain');
check('static meshes created', view.staticMeshes.length > 3, `meshes=${view.staticMeshes.length}`);
let vertices = 0;
let mergeBroken = null;
for (const mesh of view.staticMeshes) {
  const g = mesh.geometry;
  vertices += g.attributes.position?.count ?? 0;
  if (!g.attributes.position || !g.attributes.normal || !g.attributes.uv) mergeBroken = mesh.name;
  if (!Number.isFinite(g.boundingSphere?.radius)) mergeBroken = `${mesh.name} (bounds)`;
}
check('merged geometry has position/normal/uv + bounds', !mergeBroken, String(mergeBroken));
check('merged vertex count is sane', vertices > 10000 && vertices < 3_000_000, `vertices=${vertices}`);

// --- instancing ---------------------------------------------------------------
let instancedOk = true;
let propInstances = 0;
for (const [kind, props] of byKind) {
  const entry = view.addPropKind(kind, PREFABS[kind], props.length);
  if (!entry.meshes.length) instancedOk = false;
  for (let i = 0; i < props.length; i++) view.setPropTransform(entry, i, props[i]);
  for (const mesh of entry.meshes) {
    mesh.count = props.length;
    propInstances += props.length;
  }
}
check('prop kinds turned into InstancedMeshes', instancedOk);
check('prop instances written', propInstances > 200, `instances=${propInstances}`);
const sample = view.propKinds.values().next().value;
const m0 = new THREE.Matrix4();
sample.meshes[0].getMatrixAt(0, m0);
check('instance matrices are finite', m0.elements.every((v) => Number.isFinite(v)));

section('dynamic groups + wheels');
for (const group of [...train.groups, ...environment.groups]) view.addDynamicGroup(group);
check('dynamic groups registered', view.groupObjects.size >= 5, `groups=${view.groupObjects.size}`);
view.updateDynamicGroups();
const doorGroup = train.groups.find((g) => g.id.startsWith('door_'));
if (doorGroup) {
  doorGroup.state.z = 1.234;
  view.updateDynamicGroups();
  const holder = view.groupObjects.get(doorGroup.id).holder;
  check('group transforms follow gameplay state', Math.abs(holder.position.z - doorGroup.state.z) < 1e-6);
} else {
  check('a door group exists', false);
}

section('sky + lighting');
const sky = new Sky(scene, { quality: 'high' });
check('sky dome created', !!sky.dome && sky.dome.material.uniforms.uTop);
sky.setTimeOfDay(0.5);
const duskTop = sky.material.uniforms.uTop.value.getHex();
sky.setTimeOfDay(0);
const goldTop = sky.material.uniforms.uTop.value.getHex();
check('time of day changes the sky', duskTop !== goldTop, `${goldTop} vs ${duskTop}`);
let skyErr = null;
try {
  for (let i = 0; i < 30; i++) sky.update(1 / 60, { distance: i * 40, darkness: i > 10 ? 0.8 : 0, camera: null });
} catch (e) {
  skyErr = e;
}
check('sky update runs', !skyErr, skyErr?.message);
check('sun + hemi lights exist', !!sky.sun && !!sky.hemi);

section('character view');
const player = new Player(world, train, {});
const charView = new CharacterView({
  name: 'player',
  colors: { coat: 'coatPlayer', coatDark: 'coatPlayerDark', shirt: 'shirtPlayer', pants: 'pantsPlayer', hat: 'hatBrown', skin: 'skin' },
  weapon: 'revolver',
  hat: 'cowboy',
});
scene.add(charView.root);
const pose = createPose();
let poseErr = null;
try {
  for (let i = 0; i < 120; i++) {
    animateCharacter(pose, {
      speed: i % 40 === 0 ? 0 : 7,
      maxSpeed: 8.6,
      onGround: true,
      vy: 0,
      yaw: i * 0.05,
      state: 'run',
      stateTime: i / 60,
      dodgeDuration: 0.42,
      dodgeSign: 1,
      climbing: false,
      crouch: false,
      aiming: true,
      aimPitch: 0.1,
      shootTimer: i % 30 === 0 ? 0.1 : 0,
      reloadTimer: 0,
      reloadTotal: 1.6,
      hitTimer: 0,
      hurtDir: 1,
      dead: false,
      deadTimer: 0,
      headPitch: 0,
      headYaw: 0,
    }, player.anim, 1 / 60, i / 60);
    player.pos.y = 1.2;
    charView.sync({ ...player, type: 'player' }, null, 1 / 60);
  }
} catch (e) {
  poseErr = e;
}
check('character rig + view sync runs', !poseErr, poseErr?.stack?.split('\n')[1] ?? poseErr?.message);
let meshCount = 0;
charView.root.traverse((o) => {
  if (o.isMesh) meshCount++;
});
check('character is made of primitives', meshCount > 25, `meshes=${meshCount}`);
check('muzzle anchor exists', !!charView.muzzleAnchor);
check('health bar hidden for full health', charView.healthGroup.visible === false);

// enemy flavour (hats/weapons) should not throw either
const specs = ['basic', 'shotgun', 'rifle', 'heavy', 'elite', 'boss'];
let specErr = null;
for (const id of specs) {
  try {
    const v = new CharacterView({ name: id, colors: { coat: 'guardCoat', coatDark: 'guardCoatDark', shirt: 'guardShirt', hat: 'guardCoatDark' }, weapon: 'rifle', hat: id === 'heavy' ? 'helmet' : 'cowboy' });
    v.sync({ type: id, pos: { x: 0, y: 0, z: 0 }, pose, dead: false, health: 5, maxHealth: 10, deadTimer: 0, muzzleFlash: 0 }, null, 1 / 60);
  } catch (e) {
    specErr = `${id}: ${e.message}`;
  }
}
check('all enemy looks build', !specErr, specErr);

section('camera copy');
const { CameraController } = await import('../src/game/CameraController.js');
const cam = new CameraController();
const threeCamera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
cam.playShot({ pos: { x: 10, y: 5, z: 20 }, look: { x: 40, y: 2, z: 0 }, fov: 36 }, 1.0);
for (let i = 0; i < 60; i++) cam.update(1 / 60, player, train, {});
threeCamera.position.set(cam.renderPosition.x, cam.renderPosition.y, cam.renderPosition.z);
threeCamera.lookAt(cam.lookAt.x, cam.lookAt.y, cam.lookAt.z);
check('scripted camera resolves to finite numbers', Number.isFinite(threeCamera.position.x) && Number.isFinite(threeCamera.quaternion.x));

section('dispose');
let disposeErr = null;
try {
  charView.dispose();
  view.dispose();
} catch (e) {
  disposeErr = e;
}
check('disposal is safe', !disposeErr, disposeErr?.message);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} render check(s) FAILED`);
  process.exit(1);
}
console.log('RENDER TEST PASSED');
process.exit(0);
