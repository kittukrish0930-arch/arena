// -----------------------------------------------------------------------------
// Shared material + geometry library.
// All game objects pull materials from here so draw calls stay cheap and
// nothing is re-created every frame. Textures are procedural (see
// ProceduralTextures.js) so the game ships without external assets.
// -----------------------------------------------------------------------------
import * as THREE from 'three';
import {
  woodTexture,
  metalTexture,
  paintedSteelTexture,
  groundTexture,
  ballastTexture,
  radialSpriteTexture,
  streakTexture,
  sparkTexture,
} from './ProceduralTextures.js';

const mat = (params) => {
  const m = new THREE.MeshStandardMaterial(params);
  m.userData.shared = true;
  return m;
};

function tiled(texture, x, y) {
  const t = texture.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(x, y);
  return t;
}

export const Materials = {
  _built: false,

  build() {
    if (this._built) return this;
    this._built = true;

    // --- Train ---------------------------------------------------------------
    this.trainBody = mat({
      color: 0x6d3226,
      map: tiled(metalTexture(11, [120, 62, 48]), 3, 1),
      roughness: 0.75,
      metalness: 0.32,
    });
    this.trainBodyDark = mat({
      color: 0x40201a,
      map: tiled(metalTexture(12, [70, 40, 34]), 3, 1),
      roughness: 0.85,
      metalness: 0.25,
    });
    this.trim = mat({ color: 0xc79a3e, roughness: 0.38, metalness: 0.85 });
    this.iron = mat({
      color: 0x4a4c52,
      map: tiled(metalTexture(14, [100, 104, 112]), 2, 2),
      roughness: 0.62,
      metalness: 0.7,
    });
    this.ironDark = mat({ color: 0x2b2d32, roughness: 0.7, metalness: 0.6 });
    this.rust = mat({
      color: 0x8c4a25,
      map: tiled(metalTexture(16, [150, 90, 55]), 2, 2),
      roughness: 0.92,
      metalness: 0.2,
    });
    this.armorPlate = mat({
      color: 0x555a63,
      map: tiled(paintedSteelTexture(21, [104, 110, 120]), 3, 2),
      roughness: 0.45,
      metalness: 0.8,
    });
    this.armorPlateDark = mat({
      color: 0x33373e,
      map: tiled(paintedSteelTexture(22, [62, 66, 74]), 3, 2),
      roughness: 0.5,
      metalness: 0.8,
    });
    this.vaultDoor = mat({ color: 0x767c86, roughness: 0.3, metalness: 0.95 });
    this.gold = mat({
      color: 0xffb733,
      roughness: 0.22,
      metalness: 1.0,
      emissive: 0x3a1d00,
      emissiveIntensity: 1,
    });
    this.brass = mat({
      color: 0xd9a94a,
      roughness: 0.3,
      metalness: 0.92,
      emissive: 0x2a1a00,
      emissiveIntensity: 0.5,
    });
    this.glass = mat({
      color: 0x2a3b44,
      roughness: 0.12,
      metalness: 0.05,
      transparent: true,
      opacity: 0.55,
    });
    this.lampGlass = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    this.lampGlass.userData.shared = true;

    // --- Wood / props --------------------------------------------------------
    this.wood = mat({
      color: 0x7a4a24,
      map: tiled(woodTexture(3), 2, 2),
      roughness: 0.9,
      metalness: 0.02,
    });
    this.woodDark = mat({
      color: 0x53341a,
      map: tiled(woodTexture(4), 2, 2),
      roughness: 0.92,
      metalness: 0.0,
    });
    this.crateBlue = mat({ color: 0x3d5a6c, roughness: 0.85, metalness: 0.05 });
    this.barrelRed = mat({ color: 0x8e2028, roughness: 0.55, metalness: 0.3 });
    this.barrelGreen = mat({ color: 0x3f5c3a, roughness: 0.6, metalness: 0.3 });
    this.explosive = mat({
      color: 0xb03a1e,
      roughness: 0.5,
      metalness: 0.3,
      emissive: 0x2a0800,
      emissiveIntensity: 1,
    });

    // --- Characters ----------------------------------------------------------
    this.skin = mat({ color: 0xd9a175, roughness: 0.85 });
    this.skinDark = mat({ color: 0xa9714c, roughness: 0.85 });
    this.hatBrown = mat({ color: 0x4a3623, roughness: 0.9 });
    this.coatPlayer = mat({ color: 0x7a3b2a, roughness: 0.88 });
    this.coatPlayerDark = mat({ color: 0x55271b, roughness: 0.9 });
    this.shirtPlayer = mat({ color: 0xd8c9a8, roughness: 0.9 });
    this.pantsPlayer = mat({ color: 0x3b3a44, roughness: 0.9 });
    this.boots = mat({ color: 0x2a2019, roughness: 0.8 });
    this.guardCoat = mat({ color: 0x2f3f57, roughness: 0.85 });
    this.guardCoatDark = mat({ color: 0x1f2b3d, roughness: 0.88 });
    this.guardShirt = mat({ color: 0x9aa7b5, roughness: 0.9 });
    this.eliteCoat = mat({ color: 0x2a1a2c, roughness: 0.7, metalness: 0.15 });
    this.armorHeavy = mat({ color: 0x4b4f57, roughness: 0.4, metalness: 0.85 });
    this.armorHeavyDark = mat({ color: 0x2f3239, roughness: 0.45, metalness: 0.85 });
    this.bossArmor = mat({ color: 0x3a2b2b, roughness: 0.35, metalness: 0.9, emissive: 0x1a0505 });
    this.bossTrim = mat({ color: 0xd8a129, roughness: 0.3, metalness: 0.95 });
    this.gunMetal = mat({ color: 0x35383d, roughness: 0.42, metalness: 0.85 });

    // --- Environment ---------------------------------------------------------
    this.ground = mat({
      color: 0xbba06f,
      map: tiled(groundTexture(5), 60, 60),
      roughness: 1.0,
      metalness: 0,
    });
    this.terrainNear = mat({
      color: 0xc09062,
      map: tiled(groundTexture(6), 26, 26),
      roughness: 1.0,
    });
    this.ballast = mat({
      color: 0x8b8478,
      map: tiled(ballastTexture(8), 4, 90),
      roughness: 1.0,
    });
    this.rock = mat({
      color: 0x9c7350,
      map: tiled(metalTexture(31, [150, 118, 92]), 2, 2),
      roughness: 0.98,
      metalness: 0.05,
      flatShading: true,
    });
    this.rockDark = mat({ color: 0x6b5238, roughness: 1.0, flatShading: true });
    this.cliffFar = mat({ color: 0x8a6b57, roughness: 1, flatShading: true });
    this.mountainFar = mat({ color: 0x6d5a63, roughness: 1, flatShading: true });
    this.treeFoliage = mat({ color: 0x4f6b3a, roughness: 1, flatShading: true });
    this.treeFoliageDry = mat({ color: 0x6d7a3c, roughness: 1, flatShading: true });
    this.treeTrunk = mat({ color: 0x53381f, roughness: 1 });
    this.bush = mat({ color: 0x6a6b3d, roughness: 1, flatShading: true });
    this.railSteel = mat({ color: 0x8f939b, roughness: 0.3, metalness: 0.9 });
    this.sleeper = mat({ color: 0x4a3524, roughness: 1 });
    this.signRed = mat({ color: 0xa8231f, roughness: 0.6 });
    this.signGreen = mat({ color: 0x2f7a3a, roughness: 0.6 });
    this.signWood = mat({ color: 0x6a4a2c, roughness: 1 });
    this.water = mat({
      color: 0x2c4a58,
      roughness: 0.15,
      metalness: 0.6,
      transparent: true,
      opacity: 0.85,
    });
    this.buildingWall = mat({ color: 0xa98868, roughness: 1 });
    this.buildingRoof = mat({ color: 0x7c4a33, roughness: 1 });
    this.bridgeSteel = mat({ color: 0x5a4a44, roughness: 0.6, metalness: 0.7 });
    this.tunnelStone = mat({ color: 0x6a5a4c, roughness: 1, flatShading: true });

    // --- FX ------------------------------------------------------------------
    this.dustSprite = new THREE.SpriteMaterial({
      map: radialSpriteTexture('rgba(226,196,150,1)', 'rgba(226,196,150,0)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      opacity: 0.85,
    });
    this.dustSprite.userData.shared = true;
    this.smokeSprite = new THREE.SpriteMaterial({
      map: radialSpriteTexture('rgba(70,60,56,1)', 'rgba(60,52,48,0)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.7,
    });
    this.smokeSprite.userData.shared = true;
    this.steamSprite = new THREE.SpriteMaterial({
      map: radialSpriteTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
    this.steamSprite.userData.shared = true;
    this.sparkSprite = new THREE.SpriteMaterial({
      map: sparkTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sparkSprite.userData.shared = true;
    this.glowSprite = new THREE.SpriteMaterial({
      map: radialSpriteTexture('rgba(255,214,140,1)', 'rgba(255,140,40,0)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glowSprite.userData.shared = true;
    this.leafSprite = new THREE.SpriteMaterial({
      map: radialSpriteTexture('rgba(198,160,90,1)', 'rgba(198,160,90,0)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    });
    this.leafSprite.userData.shared = true;
    this.streakSprite = new THREE.SpriteMaterial({
      map: streakTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.5,
    });
    this.streakSprite.userData.shared = true;

    return this;
  },
};

/** Reusable unit geometries (scaled per-instance to avoid geometry churn). */
export const Geo = {
  _built: false,
  build() {
    if (this._built) return this;
    this._built = true;
    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.plane = new THREE.PlaneGeometry(1, 1);
    this.cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
    this.cylinderHi = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
    this.sphere = new THREE.SphereGeometry(0.5, 12, 8);
    this.cone = new THREE.ConeGeometry(0.5, 1, 8);
    this.torus = new THREE.TorusGeometry(0.5, 0.12, 6, 14);
    this.capsule = new THREE.CapsuleGeometry(0.4, 0.6, 4, 8);
    return this;
  },
};

export function buildSharedAssets() {
  Materials.build();
  Geo.build();
  return { Materials, Geo };
}
