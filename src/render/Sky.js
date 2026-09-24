// -----------------------------------------------------------------------------
// Sky + lighting rig.
//
// A sunset sky dome (procedural gradient shader), a low warm sun with shadows,
// hemisphere fill light and drifting clouds. `setTimeOfDay` moves the whole rig
// from golden hour towards dusk and finally night as the heist progresses.
// -----------------------------------------------------------------------------
import * as THREE from 'three';

const SKY_VERT = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uSunSize;
varying vec3 vWorldPos;
void main() {
  vec3 dir = normalize(vWorldPos);
  float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  float t = smoothstep(0.42, 0.62, h);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.35, h));
  col = mix(col, uTop, t);
  float sun = max(dot(dir, normalize(uSunDir)), 0.0);
  col += uSunColor * pow(sun, 220.0) * 3.0;
  col += uSunColor * pow(sun, 6.0) * 0.28;
  // dusty haze band near the horizon
  col += vec3(0.35, 0.2, 0.1) * pow(1.0 - abs(dir.y), 8.0) * 0.35;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor(scene, { quality = 'high' } = {}) {
    this.scene = scene;
    this.quality = quality;

    // --- dome --------------------------------------------------------------
    const geo = new THREE.SphereGeometry(600, 32, 16);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(0x1b2a5a) },
        uMid: { value: new THREE.Color(0xd8632c) },
        uHorizon: { value: new THREE.Color(0xffb765) },
        uSunColor: { value: new THREE.Color(0xffd9a0) },
        uSunDir: { value: new THREE.Vector3(-0.55, 0.18, -0.6) },
        uSunSize: { value: 1 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(geo, this.material);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    // --- lights ------------------------------------------------------------
    this.sun = new THREE.DirectionalLight(0xffc98a, 2.4);
    this.sun.position.set(-60, 46, -44);
    this.sun.castShadow = quality !== 'low';
    const size = quality === 'low' ? 1024 : quality === 'medium' ? 1536 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.camera.left = -46;
    this.sun.shadow.camera.right = 46;
    this.sun.shadow.camera.top = 30;
    this.sun.shadow.camera.bottom = -16;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 190;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    scene.add(this.sun);
    this.sunTarget = new THREE.Object3D();
    this.sunTarget.position.set(60, 0, 0);
    scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;

    this.hemi = new THREE.HemisphereLight(0xffb27a, 0x6b4a2f, 0.85);
    scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0x5566aa, 0.35);
    scene.add(this.ambient);

    this.rim = new THREE.DirectionalLight(0x8090ff, 0.5);
    this.rim.position.set(40, 20, 60);
    scene.add(this.rim);

    // --- clouds -------------------------------------------------------------
    this.clouds = [];
    const cloudGeo = new THREE.SphereGeometry(1, 8, 6);
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffc9a0, transparent: true, opacity: 0.55, fog: false });
    this.cloudGroup = new THREE.Group();
    for (let i = 0; i < 26; i++) {
      const c = new THREE.Mesh(cloudGeo, cloudMat);
      const scale = 12 + Math.random() * 24;
      c.scale.set(scale, scale * 0.22, scale * 0.6);
      c.position.set(-300 + Math.random() * 900, 70 + Math.random() * 60, -240 + Math.random() * 480);
      this.cloudGroup.add(c);
      this.clouds.push({ mesh: c, speed: 3 + Math.random() * 5 });
    }
    scene.add(this.cloudGroup);

    // --- sun glow sprite ----------------------------------------------------
    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: null,
        color: 0xffd9a0,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    this.sunSprite.scale.set(120, 120, 1);
    scene.add(this.sunSprite);

    this.timeOfDay = 0; // 0 = golden hour, 1 = night
    this.setTimeOfDay(0);
  }

  /** 0 golden hour -> 0.5 dusk -> 1 night. */
  setTimeOfDay(t) {
    this.timeOfDay = Math.max(0, Math.min(1, t));
    const k = this.timeOfDay;
    const mix = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), k);
    this.material.uniforms.uTop.value = mix(0x1b2a5a, 0x080a18);
    this.material.uniforms.uMid.value = mix(0xd8632c, 0x2a1c3a);
    this.material.uniforms.uHorizon.value = mix(0xffb765, 0x6b3550);
    this.material.uniforms.uSunColor.value = mix(0xffd9a0, 0xa0a8d8);
    this.sun.color = mix(0xffc98a, 0x4a5a9a);
    this.sun.intensity = 2.4 - k * 1.9;
    this.hemi.color = mix(0xffb27a, 0x27305a);
    this.hemi.intensity = 0.85 - k * 0.45;
    this.ambient.intensity = 0.35 + k * 0.15;
    this.rim.intensity = 0.5 + k * 0.35;
  }

  update(dt, { distance = 0, darkness = 0, camera = null } = {}) {
    // clouds drift with the train
    for (const cloud of this.clouds) {
      cloud.mesh.position.x -= cloud.speed * dt;
      if (cloud.mesh.position.x < -400) cloud.mesh.position.x += 1200;
    }
    const sunDir = new THREE.Vector3(-0.55, 0.18, -0.6).normalize();
    this.dome.position.set(camera ? camera.position.x : 60, 0, camera ? camera.position.z : 0);
    this.sunSprite.position.set(
      this.dome.position.x + sunDir.x * 420,
      sunDir.y * 420,
      this.dome.position.z + sunDir.z * 420
    );
    this.sunSprite.material.opacity = 0.5 * (1 - this.timeOfDay * 0.7);
    // tunnel darkness dims the whole rig briefly (driven by gameplay)
    if (darkness > 0) {
      this.sun.intensity *= 1 - darkness * 0.75;
      this.hemi.intensity *= 1 - darkness * 0.7;
      this.ambient.intensity += darkness * 0.15;
    }
  }
}

export default Sky;
