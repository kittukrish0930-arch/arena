// -----------------------------------------------------------------------------
// CharacterView - a low poly humanoid built from primitives with a simple bone
// hierarchy. Gameplay writes a flat pose object (see characters/CharacterRig.js)
// and this class maps it onto the bones. No skeletal animation data needed.
// -----------------------------------------------------------------------------
import * as THREE from 'three';
import { Materials, Geo } from '../utils/Materials.js';
import { getMaterial } from './InstancedWorld.js';

const UP = new THREE.Vector3(0, 1, 0);
const ROT_X = { z: Math.PI / 2 };

function mesh(geometry, materialKey, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rot = null) {
  const m = new THREE.Mesh(geometry, getMaterial(materialKey));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  if (rot) m.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class CharacterView {
  constructor(spec = {}) {
    this.spec = spec;
    this.colors = spec.colors || {
      coat: 'coatPlayer',
      coatDark: 'coatPlayerDark',
      shirt: 'shirtPlayer',
      pants: 'pantsPlayer',
      hat: 'hatBrown',
      skin: 'skin',
    };
    const scale = spec.scale ?? 1;
    this.scale = scale;
    const heavy = spec.build === 'heavy';

    this.root = new THREE.Group();
    this.root.name = spec.name || 'character';

    // --- roll / pitch pivot --------------------------------------------------
    this.body = new THREE.Group();
    this.root.add(this.body);

    // --- hips ---------------------------------------------------------------
    this.hips = new THREE.Group();
    this.hips.position.y = 0.92 * scale;
    this.body.add(this.hips);

    // pelvis
    const pelvis = mesh(Geo.box, this.colors.pants, 0, 0, 0, 0.42 * scale * (heavy ? 1.25 : 1), 0.3 * scale, 0.34 * scale);
    this.hips.add(pelvis);

    // --- torso --------------------------------------------------------------
    this.torso = new THREE.Group();
    this.torso.position.y = 0.18 * scale;
    this.hips.add(this.torso);
    const torsoW = (heavy ? 0.86 : 0.58) * scale;
    const chest = mesh(Geo.box, this.colors.coat, 0, 0.32 * scale, 0, torsoW, 0.68 * scale, (heavy ? 0.62 : 0.46) * scale);
    this.torso.add(chest);
    // shirt / vest plate
    this.torso.add(mesh(Geo.box, this.colors.shirt, 0.12 * scale, 0.3 * scale, 0, 0.3 * scale, 0.5 * scale, (heavy ? 0.5 : 0.34) * scale));
    // shoulders
    this.torso.add(mesh(Geo.box, this.colors.coatDark, 0, 0.62 * scale, 0, torsoW + 0.16 * scale, 0.16 * scale, (heavy ? 0.62 : 0.44) * scale));
    // collar
    this.torso.add(mesh(Geo.box, this.colors.coatDark, 0, 0.74 * scale, 0, 0.3 * scale, 0.14 * scale, 0.36 * scale));
    // belt
    this.torso.add(mesh(Geo.box, 'boots', 0, -0.02 * scale, 0, torsoW * 0.95, 0.12 * scale, 0.4 * scale));

    // --- head ---------------------------------------------------------------
    this.head = new THREE.Group();
    this.head.position.y = 0.78 * scale;
    this.torso.add(this.head);
    this.head.add(mesh(Geo.sphere, this.colors.skin, 0, 0.02 * scale, 0, 0.36 * scale, 0.4 * scale, 0.36 * scale));
    // neck
    this.head.add(mesh(Geo.cyl, this.colors.skin, 0, -0.2 * scale, 0, 0.12 * scale, 0.16 * scale, 0.12 * scale));
    // eyes (tiny dark boxes) for silhouette readability
    this.head.add(mesh(Geo.box, 'ironDark', 0.16 * scale, 0.04 * scale, 0.08 * scale, 0.05 * scale, 0.05 * scale, 0.05 * scale));
    this.head.add(mesh(Geo.box, 'ironDark', 0.16 * scale, 0.04 * scale, -0.08 * scale, 0.05 * scale, 0.05 * scale, 0.05 * scale));
    if ((spec.hat ?? 'cowboy') === 'cowboy') {
      this.head.add(mesh(Geo.cyl, this.colors.hat, 0, 0.22 * scale, 0, 0.42 * scale, 0.22 * scale, 0.42 * scale));
      this.head.add(mesh(Geo.cyl, this.colors.hat, 0, 0.13 * scale, 0, 0.78 * scale, 0.05 * scale, 0.78 * scale));
    } else if (spec.hat === 'cap') {
      this.head.add(mesh(Geo.cyl, this.colors.hat, 0, 0.22 * scale, 0, 0.42 * scale, 0.16 * scale, 0.42 * scale));
      this.head.add(mesh(Geo.box, this.colors.hat, 0.2 * scale, 0.2 * scale, 0, 0.24 * scale, 0.04 * scale, 0.3 * scale));
    } else if (spec.hat === 'helmet') {
      this.head.add(mesh(Geo.sphere, this.colors.hat, 0, 0.12 * scale, 0, 0.44 * scale, 0.34 * scale, 0.44 * scale));
      this.head.add(mesh(Geo.box, this.colors.hat, 0.2 * scale, 0.06 * scale, 0, 0.1 * scale, 0.26 * scale, 0.34 * scale));
    }

    // --- arms ---------------------------------------------------------------
    const armLen = (heavy ? 0.42 : 0.38) * scale;
    this.armL = this._limb(this.torso, this.colors.coat, 0, 0.58 * scale, 0.31 * scale, armLen, 0.16 * scale);
    this.armR = this._limb(this.torso, this.colors.coat, 0, 0.58 * scale, -0.31 * scale, armLen, 0.16 * scale);

    // --- legs ---------------------------------------------------------------
    const legLen = 0.46 * scale;
    this.legL = this._limb(this.hips, this.colors.pants, 0, -0.1 * scale, 0.16 * scale, legLen, 0.19 * scale);
    this.legR = this._limb(this.hips, this.colors.pants, 0, -0.1 * scale, -0.16 * scale, legLen, 0.19 * scale);

    // --- weapon -------------------------------------------------------------
    this.weapon = new THREE.Group();
    const kind = spec.weapon || 'revolver';
    this.weapon.add(mesh(Geo.box, 'gunMetal', 0.12 * scale, 0, 0, 0.3 * scale, 0.08 * scale, 0.08 * scale));
    this.weapon.add(mesh(Geo.box, 'gunMetal', 0.02 * scale, -0.08 * scale, 0, 0.1 * scale, 0.18 * scale, 0.08 * scale));
    if (kind === 'rifle') {
      this.weapon.add(mesh(Geo.box, 'wood', -0.1 * scale, -0.02 * scale, 0, 0.4 * scale, 0.09 * scale, 0.1 * scale));
      this.weapon.add(mesh(Geo.cyl, 'gunMetal', 0.42 * scale, 0, 0, 0.05 * scale, 0.5 * scale, 0.05 * scale, ROT_X));
    } else if (kind === 'shotgun') {
      this.weapon.add(mesh(Geo.cyl, 'gunMetal', 0.36 * scale, 0.02 * scale, 0, 0.07 * scale, 0.62 * scale, 0.07 * scale, ROT_X));
      this.weapon.add(mesh(Geo.box, 'wood', -0.12 * scale, -0.04 * scale, 0, 0.36 * scale, 0.1 * scale, 0.11 * scale));
    } else if (kind === 'heavy') {
      for (let i = 0; i < 5; i++) {
        this.weapon.add(mesh(Geo.cyl, 'gunMetal', 0.42 * scale, 0, (-0.12 + i * 0.06) * scale, 0.035 * scale, 0.5 * scale, 0.035 * scale, ROT_X));
      }
      this.weapon.add(mesh(Geo.cyl, 'ironDark', 0.1 * scale, 0, 0, 0.14 * scale, 0.34 * scale, 0.14 * scale, ROT_X));
      this.weapon.add(mesh(Geo.box, 'ironDark', -0.1 * scale, -0.14 * scale, 0, 0.3 * scale, 0.2 * scale, 0.24 * scale));
    } else if (kind === 'cannon') {
      this.weapon.add(mesh(Geo.cyl, 'gunMetal', 0.46 * scale, 0.02 * scale, 0, 0.11 * scale, 0.8 * scale, 0.11 * scale, ROT_X));
      this.weapon.add(mesh(Geo.cyl, 'ironDark', 0.2 * scale, -0.02 * scale, 0, 0.16 * scale, 0.24 * scale, 0.16 * scale, ROT_X));
      this.weapon.add(mesh(Geo.box, 'ironDark', -0.12 * scale, -0.12 * scale, 0, 0.34 * scale, 0.22 * scale, 0.26 * scale));
    } else {
      this.weapon.add(mesh(Geo.cyl, 'gunMetal', 0.18 * scale, 0, 0, 0.06 * scale, 0.34 * scale, 0.06 * scale, ROT_X));
      this.weapon.add(mesh(Geo.cyl, 'brass', 0.05 * scale, -0.01 * scale, 0, 0.08 * scale, 0.12 * scale, 0.08 * scale, ROT_X));
    }
    this.weapon.position.set(0.16 * scale, -0.5 * scale, 0);
    this.muzzleAnchor = new THREE.Object3D();
    const muzzleX = kind === 'rifle' || kind === 'shotgun' || kind === 'cannon' ? 0.85 : kind === 'heavy' ? 0.72 : 0.42;
    this.muzzleAnchor.position.set(muzzleX * scale, 0, 0);
    this.weapon.add(this.muzzleAnchor);

    // attach the weapon to the right hand
    this.handR = new THREE.Group();
    this.handR.position.y = -armLen - 0.1 * scale;
    this.armR.children[this.armR.children.length - 1].add(this.handR);
    this.handR.add(this.weapon);

    // --- muzzle flash sprite -------------------------------------------------
    this.muzzleFlash = new THREE.Sprite(Materials.glowSprite.clone());
    this.muzzleFlash.material.opacity = 0;
    this.muzzleFlash.scale.set(0.85, 0.85, 0.85);
    this.muzzleAnchor.add(this.muzzleFlash);

    // --- health bar ----------------------------------------------------------
    this.healthGroup = new THREE.Group();
    this.healthGroup.position.y = (spec.height ?? 1.8) + 0.34;
    this.healthBg = mesh(Geo.plane, 'ironDark', 0, 0, 0, 0.66, 0.075, 1);
    this.healthBg.castShadow = false;
    this.healthFill = new THREE.Mesh(Geo.plane, new THREE.MeshBasicMaterial({ color: 0xd64b3a }));
    this.healthFill.scale.set(0.62, 0.045, 1);
    this.healthFill.position.set(0, 0, 0.01);
    this.healthGroup.add(this.healthBg, this.healthFill);
    this.healthGroup.visible = false;
    this.root.add(this.healthGroup);

    // Keep the shadow pass cheap: only the chunky body parts cast shadows.
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      const sc = o.scale;
      const big = Math.max(sc.x, sc.y, sc.z) * this.scale >= 0.16;
      o.castShadow = big;
      o.receiveShadow = big;
    });
    this.healthBg.castShadow = false;
    this.healthFill.castShadow = false;

    this.visible = true;
    this.time = 0;
  }

  _limb(parent, materialKey, x, y, z, length, thickness) {
    const upper = new THREE.Group();
    upper.position.set(x, y, z);
    const upperMesh = mesh(Geo.box, materialKey, 0, -length / 2, 0, thickness, length, thickness);
    upper.add(upperMesh);
    const lower = new THREE.Group();
    lower.position.y = -length;
    upper.add(lower);
    lower.add(mesh(Geo.box, materialKey, 0, -length * 0.85, 0, thickness * 0.9, length * 1.7, thickness * 0.9));
    // hand / foot block
    lower.add(mesh(Geo.box, materialKey === this.colors.pants ? 'boots' : 'skinDark', 0.02, -length * 1.75, 0, thickness * 1.1, thickness * 0.8, thickness * 1.3));
    parent.add(upper);
    return upper;
  }

  /** Applies the flat pose produced by the rig. */
  applyPose(pose) {
    if (!pose) return;
    const s = this.scale;
    this.root.rotation.y = pose.yaw ?? 0;
    this.body.rotation.z = pose.rootRoll ?? 0;
    this.body.rotation.x = pose.rootPitch ?? 0;
    this.body.position.y = (pose.bob ?? 0) + (pose.hipY ?? 0) * s;
    this.hips.position.y = 0.92 * s + (pose.hipY ?? 0) * s;
    this.torso.rotation.x = pose.lean ?? 0;
    this.torso.rotation.y = pose.twist ?? 0;
    this.head.rotation.x = pose.headPitch ?? 0;
    this.head.rotation.y = pose.headYaw ?? 0;

    const setLimb = (limb, rot) => {
      if (!limb || !rot) return;
      limb.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);
    };
    setLimb(this.armL, pose.armL);
    setLimb(this.armR, pose.armR);
    setLimb(this.legL, pose.legL);
    setLimb(this.legR, pose.legR);
    setLimb(this.armL.children[1], pose.foreL);
    setLimb(this.armR.children[1], pose.foreR);
    setLimb(this.legL.children[1], pose.shinL);
    setLimb(this.legR.children[1], pose.shinR);
    this.weapon.rotation.set(0, 0, pose.weaponPitch ? -pose.weaponPitch : 0);
  }

  sync(entity, camera, dt = 0) {
    this.time += dt;
    this.root.position.set(entity.pos.x, entity.pos.y, entity.pos.z);
    this.applyPose(entity.pose);

    // muzzle flash
    const flashing = (entity.muzzleFlash ?? 0) > 0.01 || (entity.shootTimer ?? 0) > 0.1;
    this.muzzleFlash.material.opacity = flashing ? 0.95 : 0;
    this.muzzleFlash.material.rotation = Math.random() * Math.PI;

    // health bar (enemies only)
    const isEnemy = entity.type !== 'player';
    if (isEnemy && !entity.dead && entity.health < entity.maxHealth) {
      this.healthGroup.visible = true;
      const pct = Math.max(0, entity.health / entity.maxHealth);
      this.healthFill.scale.x = 0.62 * pct;
      this.healthFill.position.x = -0.31 * (1 - pct);
      this.healthFill.material.color.setHex(pct > 0.5 ? 0x6fc04a : pct > 0.25 ? 0xd6a63a : 0xd64b3a);
      if (camera) this.healthGroup.quaternion.copy(camera.quaternion);
    } else {
      this.healthGroup.visible = false;
    }

    // fade out corpses
    if (entity.dead && entity.deadTimer > 6) {
      const t = Math.max(0, 1 - (entity.deadTimer - 6) / 3);
      this.setOpacity(t);
    }
  }

  setOpacity(value) {
    const visible = value > 0.02;
    this.body.visible = visible;
    this.healthGroup.visible = false;
  }

  setVisible(v) {
    this.root.visible = v;
  }

  get position() {
    return this.root.position;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.userData?.own) o.geometry.dispose();
    });
    this.root.removeFromParent();
  }
}

export default CharacterView;
