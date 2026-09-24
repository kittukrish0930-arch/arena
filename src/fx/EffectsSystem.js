// -----------------------------------------------------------------------------
// Runtime particle + effects renderer.
//
// Owns a ParticleSim and mirrors its live records into two Points buffers (soft
// and additive) plus tracer line segments, impact decals and transient point
// lights. Buffers are pre-allocated and only their *contents* change per frame.
// -----------------------------------------------------------------------------
import * as THREE from 'three';
import { ParticleSim } from './Particles.js';
import { Materials } from '../utils/Materials.js';
import { radialSpriteTexture, sparkTexture } from '../utils/ProceduralTextures.js';
import { EFFECTS } from '../game/Config.js';

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, aSize * (uScale / max(0.05, -mv.z)));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  float a = tex.a * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor * tex.rgb, a);
}`;

function makePointsMaterial(map, blending) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uScale: { value: 600 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending,
  });
}

export class EffectsSystem {
  constructor(scene, camera, { qualityScale = 1 } = {}) {
    this.scene = scene;
    this.camera = camera;
    this.sim = new ParticleSim(qualityScale);
    this.tmpColor = new THREE.Color();

    // --- soft particles ------------------------------------------------------
    this.softCapacity = this.sim.soft.capacity;
    this.softGeo = makeBufferGeo(this.softCapacity);
    this.softMat = makePointsMaterial(radialSpriteTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), THREE.NormalBlending);
    this.softPoints = new THREE.Points(this.softGeo, this.softMat);
    this.softPoints.frustumCulled = false;
    this.softPoints.renderOrder = 6;
    scene.add(this.softPoints);

    // --- additive particles --------------------------------------------------
    this.addCapacity = this.sim.additive.capacity;
    this.addGeo = makeBufferGeo(this.addCapacity);
    this.addMat = makePointsMaterial(radialSpriteTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), THREE.AdditiveBlending);
    this.addPoints = new THREE.Points(this.addGeo, this.addMat);
    this.addPoints.frustumCulled = false;
    this.addPoints.renderOrder = 7;
    scene.add(this.addPoints);

    // --- tracers -------------------------------------------------------------
    this.tracerCapacity = EFFECTS.maxTracers;
    this.tracers = [];
    for (let i = 0; i < this.tracerCapacity; i++) {
      this.tracers.push({ active: false, x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0, life: 0, maxLife: 0.06, width: 1 });
    }
    const tracerGeo = new THREE.BufferGeometry();
    this.tracerPos = new Float32Array(this.tracerCapacity * 6);
    this.tracerCol = new Float32Array(this.tracerCapacity * 6);
    tracerGeo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    tracerGeo.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3));
    tracerGeo.setDrawRange(0, 0);
    this.tracerLines = new THREE.LineSegments(
      tracerGeo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.tracerLines.frustumCulled = false;
    this.tracerLines.renderOrder = 8;
    scene.add(this.tracerLines);
    this.tracerGeo = tracerGeo;

    // --- impact decals -------------------------------------------------------
    this.decalCapacity = EFFECTS.maxImpacts;
    this.decals = [];
    const decalGeo = new THREE.PlaneGeometry(1, 1);
    this.decalMesh = new THREE.InstancedMesh(
      decalGeo,
      new THREE.MeshBasicMaterial({
        map: sparkTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.9,
      }),
      this.decalCapacity
    );
    this.decalMesh.frustumCulled = false;
    this.decalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.decalMesh.count = 0;
    this.decalMatrix = new THREE.Matrix4();
    this.decalQuat = new THREE.Quaternion();
    this.decalScale = new THREE.Vector3(0.3, 0.3, 0.3);
    this.decalPos = new THREE.Vector3();
    for (let i = 0; i < this.decalCapacity; i++) {
      this.decals.push({ active: false, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 1, life: 0, maxLife: 1.6, size: 0.3 });
    }
    scene.add(this.decalMesh);

    // --- dynamic lights (pooled, max 3) -------------------------------------
    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffaa55, 0, 26, 2);
      light.visible = false;
      scene.add(light);
      this.lights.push({ light, life: 0, maxLife: 0, peak: 0 });
    }

    // --- environmental streaks (wind / god rays) -----------------------------
    this.qualityScale = qualityScale;
    this.elapsed = 0;
  }

  setPixelScale(pixelHeight, fovDeg) {
    const scale = pixelHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.softMat.uniforms.uScale.value = scale;
    this.addMat.uniforms.uScale.value = scale;
  }

  /** Fire a bullet tracer (visual only). */
  tracer(x1, y1, z1, x2, y2, z2, color = 0xffd27a) {
    let slot = this.tracers.find((t) => !t.active);
    if (!slot) slot = this.tracers[0];
    slot.active = true;
    slot.x1 = x1;
    slot.y1 = y1;
    slot.z1 = z1;
    slot.x2 = x2;
    slot.y2 = y2;
    slot.z2 = z2;
    slot.maxLife = 0.075;
    slot.life = slot.maxLife;
    this.tmpColor.setHex(color);
    slot.r = this.tmpColor.r;
    slot.g = this.tmpColor.g;
    slot.b = this.tmpColor.b;
  }

  decal(x, y, z, nx, ny, nz, size = 0.3, color = 0x150d08) {
    let slot = this.decals.find((d) => !d.active);
    if (!slot) {
      slot = this.decals.reduce((a, b) => (a.life < b.life ? a : b), this.decals[0]);
    }
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.nx = nx;
    slot.ny = ny;
    slot.nz = nz;
    slot.life = slot.maxLife = 2.2;
    slot.size = size;
  }

  flashLight(x, y, z, intensity = 10, distance = 24, color = 0xffa860, life = 0.16) {
    const slot = this.lights.find((l) => l.life <= 0) || this.lights[0];
    slot.light.position.set(x, y, z);
    slot.light.color.setHex(color);
    slot.light.distance = distance;
    slot.peak = intensity;
    slot.life = slot.maxLife = life;
    slot.light.visible = true;
    slot.light.intensity = intensity;
  }

  // --- convenience wrappers --------------------------------------------------
  explosion(x, y, z, scale = 1) {
    this.sim.explosion(x, y, z, scale);
    this.flashLight(x, y + 0.6, z, 26 * scale, 30 * scale, 0xffb060, 0.32);
    this.decal(x, y, z, 0, 1, 0, 2.4 * scale);
  }

  bulletImpact(point, normal, surface = 'metal') {
    this.sim.impact(point.x, point.y, point.z, normal);
    if (surface === 'glass') this.sim.sparkBurst(point.x, point.y, point.z, 6, { speed: 3, size: 0.1 });
    this.decal(point.x, point.y, point.z, normal.x, normal.y, normal.z, 0.22);
    this.flashLight(point.x, point.y, point.z, 3.2, 8, 0xffcb8a, 0.09);
  }

  update(dt, ctx) {
    this.elapsed += dt;
    this.sim.update(dt, ctx);

    // --- soft buffer ---------------------------------------------------------
    let n = 0;
    const sp = this.softGeo.attributes.position.array;
    const sc = this.softGeo.attributes.aColor.array;
    const ss = this.softGeo.attributes.aSize.array;
    const sa = this.softGeo.attributes.aAlpha.array;
    for (const p of this.sim.soft.items) {
      if (!p.active) continue;
      const t = 1 - p.life / p.maxLife;
      const i3 = n * 3;
      sp[i3] = p.x;
      sp[i3 + 1] = p.y;
      sp[i3 + 2] = p.z;
      sc[i3] = p.r;
      sc[i3 + 1] = p.g;
      sc[i3 + 2] = p.b;
      ss[n] = p.size0 + (p.size1 - p.size0) * t;
      sa[n] = p.alpha0 + (p.alphaEnd - p.alpha0) * t;
      n++;
      if (n >= this.softCapacity) break;
    }
    this.softGeo.setDrawRange(0, n);
    if (n > 0) {
      this.softGeo.attributes.position.needsUpdate = true;
      this.softGeo.attributes.aColor.needsUpdate = true;
      this.softGeo.attributes.aSize.needsUpdate = true;
      this.softGeo.attributes.aAlpha.needsUpdate = true;
    }

    // --- additive buffer -----------------------------------------------------
    let m = 0;
    const ap = this.addGeo.attributes.position.array;
    const ac = this.addGeo.attributes.aColor.array;
    const as = this.addGeo.attributes.aSize.array;
    const aa = this.addGeo.attributes.aAlpha.array;
    for (const p of this.sim.additive.items) {
      if (!p.active) continue;
      const t = 1 - p.life / p.maxLife;
      const i3 = m * 3;
      ap[i3] = p.x;
      ap[i3 + 1] = p.y;
      ap[i3 + 2] = p.z;
      ac[i3] = p.r;
      ac[i3 + 1] = p.g;
      ac[i3 + 2] = p.b;
      as[m] = p.size0 + (p.size1 - p.size0) * t;
      aa[m] = p.alpha0 + (p.alphaEnd - p.alpha0) * t;
      m++;
      if (m >= this.addCapacity) break;
    }
    this.addGeo.setDrawRange(0, m);
    if (m > 0) {
      this.addGeo.attributes.position.needsUpdate = true;
      this.addGeo.attributes.aColor.needsUpdate = true;
      this.addGeo.attributes.aSize.needsUpdate = true;
      this.addGeo.attributes.aAlpha.needsUpdate = true;
    }

    // --- tracers -------------------------------------------------------------
    let tIdx = 0;
    for (const t of this.tracers) {
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        continue;
      }
      const fade = t.life / t.maxLife;
      const i6 = tIdx * 6;
      this.tracerPos[i6] = t.x1;
      this.tracerPos[i6 + 1] = t.y1;
      this.tracerPos[i6 + 2] = t.z1;
      this.tracerPos[i6 + 3] = t.x2;
      this.tracerPos[i6 + 4] = t.y2;
      this.tracerPos[i6 + 5] = t.z2;
      this.tracerCol[i6] = t.r * fade;
      this.tracerCol[i6 + 1] = t.g * fade;
      this.tracerCol[i6 + 2] = t.b * fade;
      this.tracerCol[i6 + 3] = t.r * fade * 0.35;
      this.tracerCol[i6 + 4] = t.g * fade * 0.35;
      this.tracerCol[i6 + 5] = t.b * fade * 0.35;
      tIdx++;
    }
    this.tracerPos.fill(0, tIdx * 6);
    this.tracerGeo.setDrawRange(0, tIdx * 2);
    this.tracerGeo.attributes.position.needsUpdate = true;
    this.tracerGeo.attributes.color.needsUpdate = true;

    // --- decals --------------------------------------------------------------
    let dIdx = 0;
    for (const d of this.decals) {
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.active = false;
        continue;
      }
      this.decalPos.set(d.x, d.y, d.z);
      const nx = d.nx || 0.0001;
      const ny = d.ny || 0.0001;
      const nz = d.nz || 0.0001;
      this.decalQuat.setFromUnitVectors(UP, TMP_NORMAL.set(nx, ny, nz).normalize());
      const fade = Math.min(1, d.life / d.maxLife);
      const s = d.size * (0.6 + fade * 0.6);
      this.decalScale.set(s, s, s);
      this.decalMatrix.compose(
        TMP_POS.copy(this.decalPos).addScaledVector(TMP_NORMAL, 0.012),
        this.decalQuat,
        this.decalScale
      );
      this.decalMesh.setMatrixAt(dIdx, this.decalMatrix);
      dIdx++;
    }
    this.decalMesh.count = dIdx;
    if (dIdx > 0) this.decalMesh.instanceMatrix.needsUpdate = true;

    // --- transient lights ----------------------------------------------------
    for (const l of this.lights) {
      if (l.life <= 0) {
        if (l.light.visible) l.light.visible = false;
        continue;
      }
      l.life -= dt;
      const t = Math.max(0, l.life / l.maxLife);
      l.light.intensity = l.peak * t * t;
      if (l.life <= 0) l.light.visible = false;
    }
  }

  clear() {
    this.sim.clear();
    for (const t of this.tracers) t.active = false;
    for (const d of this.decals) d.active = false;
    for (const l of this.lights) {
      l.life = 0;
      l.light.visible = false;
    }
    this.decalMesh.count = 0;
  }

  get particleCount() {
    return this.sim.liveCount;
  }
}

const UP = new THREE.Vector3(0, 0, 1);
const TMP_NORMAL = new THREE.Vector3();
const TMP_POS = new THREE.Vector3();

function makeBufferGeo(capacity) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100000);
  return geo;
}

export default EffectsSystem;
