// -----------------------------------------------------------------------------
// CameraController - the cinematic 2.5D camera.
//
// Owns the camera position/target/fov as plain numbers (so the whole thing is
// testable headlessly) and the render layer copies them onto the real camera.
// Supports: smooth follow, look-ahead, dynamic zoom, shake, and scripted
// cinematic moves (intro / boss / vault / escape / ending).
// -----------------------------------------------------------------------------
import { CAMERA } from './Config.js';
import { clamp, damp, smoothstep } from '../utils/MathUtils.js';

export const CINEMATIC = {
  introFar: { pos: { x: -46, y: 34, z: 74 }, look: { x: 70, y: 5, z: 0 }, fov: 30 },
  bossWide: { distanceScale: 0.72, fov: 34 },
  vaultClose: { pos: { x: 0, y: 3.6, z: 6.4 }, lookOffset: { x: 0.6, y: 2.2, z: 0 }, fov: 30 },
  escape: { distanceScale: 0.78, fov: 50 },
  ending: { pos: { x: 150, y: 26, z: 96 }, look: { x: 60, y: 6, z: 0 }, fov: 34 },
};

export class CameraController {
  constructor() {
    this.position = { x: CAMERA.offsetX, y: CAMERA.offsetY, z: CAMERA.offsetZ };
    this.lookAt = { x: 0, y: 2, z: 0 };
    this.fov = CAMERA.fov;
    this.near = CAMERA.near;
    this.far = CAMERA.far;
    this.aspect = 16 / 9;
    this.baseFov = CAMERA.fov;

    this.shakeEnabled = true;
    this.shake = 0;
    this.shakeDecay = CAMERA.shakeDecay;
    this.shakeOffset = { x: 0, y: 0, z: 0 };
    this.roll = 0;
    this.zoom = 1; // 1 = default framing
    this.targetZoom = 1;
    this.fovZoom = 1;
    this.targetFovZoom = 1;
    this.scripted = null;
    this.time = 0;
    this.blendWeights = { scripted: 0 };
    this._tmpA = { x: 0, y: 0, z: 0 };
  }

  setAspect(aspect) {
    this.aspect = aspect;
  }

  addShake(amount) {
    if (!this.shakeEnabled) return;
    this.shake = Math.min(2.2, this.shake + amount);
  }

  /** Zoom in gameplay (e.g. aiming, sprinting, important moments). */
  setZoom(zoom, fovZoom = 1, instant = false) {
    this.targetZoom = zoom;
    this.targetFovZoom = fovZoom;
    if (instant) {
      this.zoom = zoom;
      this.fovZoom = fovZoom;
    }
  }

  /**
   * Scripted cinematic. `shot` = {pos, look, fov} - any field may be a function
   * of `t` (0..1) for moving shots.
   */
  playShot(shot, duration, { ease = true, blend = 0.8 } = {}) {
    this.scripted = {
      shot,
      t: 0,
      duration,
      ease,
      blend,
      done: false,
    };
    return this.scripted;
  }

  stopShot() {
    this.scripted = null;
  }

  /** Default 2.5D framing computed from the player state. */
  computeFollow(player, train, dt, opts = {}) {
    const facing = player.facing ?? 1;
    const zoom = this.zoom;
    const onRoof = player.onRoof;
    const baseY = onRoof ? 3.6 : 2.6;
    const dist = (onRoof ? 17.5 : CAMERA.offsetZ) * zoom;

    // trail slightly behind the player, look ahead in the direction of travel
    const camX = player.pos.x - facing * CAMERA.offsetX * 0.55 * zoom;
    const camY = player.pos.y + baseY + 2.4;
    const camZ = player.pos.z + dist;
    const lookX = player.pos.x + facing * CAMERA.lookAhead;
    const lookY = player.pos.y + CAMERA.lookHeight;
    const lookZ = player.pos.z * 0.35;

    return { camX, camY, camZ, lookX, lookY, lookZ };
  }

  update(dt, player, train, opts = {}) {
    this.time += dt;
    const speedNorm = train ? train.speedNorm : 1;

    if (this.scripted) {
      const s = this.scripted;
      s.t += dt;
      const raw = clamp(s.t / s.duration, 0, 1);
      const t = s.ease ? smoothstep(raw) : raw;
      const shot = s.shot;
      const pos = resolve(shot.pos, t, this._tmpA);
      const look = resolve(shot.look, t, { x: 0, y: 0, z: 0 });
      const k = s.blend > 0 ? Math.min(1, raw / Math.max(0.0001, s.blend)) : 1;
      this.position.x = this.position.x + (pos.x - this.position.x) * k;
      this.position.y = this.position.y + (pos.y - this.position.y) * k;
      this.position.z = this.position.z + (pos.z - this.position.z) * k;
      this.lookAt.x += (look.x - this.lookAt.x) * k;
      this.lookAt.y += (look.y - this.lookAt.y) * k;
      this.lookAt.z += (look.z - this.lookAt.z) * k;
      if (shot.fov) this.fov = this.fov + (shot.fov - this.fov) * k;
      if (raw >= 1) {
        s.done = true;
        if (s.onComplete) s.onComplete();
        this.scripted = null;
      }
    } else {
      const target = opts.framing || this.computeFollow(player, train, dt, opts);
      const posLerp = 1 - Math.exp(-CAMERA.posLerp * dt);
      const lookLerp = 1 - Math.exp(-CAMERA.followLerp * dt);
      // camera drifts slightly with speed for a sense of momentum
      const drift = speedNorm * 0.35;
      this.position.x += (target.camX - this.position.x) * posLerp;
      this.position.y += (target.camY - this.position.y + Math.sin(this.time * 1.4) * 0.035 - drift * 0.2 - this.position.y * 0) * posLerp;
      this.position.z += (target.camZ - this.position.z) * posLerp;
      this.lookAt.x += (target.lookX - this.lookAt.x) * lookLerp;
      this.lookAt.y += (target.lookY - this.lookAt.y) * lookLerp;
      this.lookAt.z += (target.lookZ - this.lookAt.z) * lookLerp;
      this.zoom += (this.targetZoom - this.zoom) * Math.min(1, dt * 3.2);
      this.fovZoom += (this.targetFovZoom - this.fovZoom) * Math.min(1, dt * 3.2);
      this.fov += (this.baseFov * this.fovZoom - this.fov) * Math.min(1, dt * 3.2);
    }

    // shake
    if (this.shake > 0.0005) {
      const s = this.shake;
      const t = this.time * 42;
      this.shakeOffset.x = (Math.sin(t * 1.13) + Math.sin(t * 2.7)) * 0.5 * s;
      this.shakeOffset.y = (Math.sin(t * 1.7 + 1.3) + Math.sin(t * 3.1)) * 0.5 * s;
      this.shakeOffset.z = Math.sin(t * 0.9 + 2.1) * 0.35 * s;
      this.roll = Math.sin(t * 1.4) * 0.02 * s;
      this.shake = Math.max(0, this.shake - this.shakeDecay * dt * (0.6 + s));
    } else {
      this.shakeOffset.x = this.shakeOffset.y = this.shakeOffset.z = 0;
      this.roll *= 0.9;
    }
  }

  get renderPosition() {
    return {
      x: this.position.x + this.shakeOffset.x,
      y: this.position.y + this.shakeOffset.y,
      z: this.position.z + this.shakeOffset.z,
    };
  }

  // ---------------------------------------------------------------------------
  // screen <-> world helpers (used for aiming, no three.js needed)
  // ---------------------------------------------------------------------------

  getBasis() {
    const px = this.renderPosition;
    let fx = this.lookAt.x - px.x;
    let fy = this.lookAt.y - px.y;
    let fz = this.lookAt.z - px.z;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl;
    fy /= fl;
    fz /= fl;
    // right = normalize(cross(forward, worldUp))
    let rx = fz * 1 - fy * 0;
    let ry = 0;
    let rz = -fx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl;
    rz /= rl;
    ry = 0;
    // up = cross(right, forward)
    const ux = ry * fz - rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy - ry * fx;
    return { forward: { x: fx, y: fy, z: fz }, right: { x: rx, y: ry, z: rz }, up: { x: ux, y: uy, z: uz } };
  }

  /** Ray through a normalised device coordinate. */
  rayFromScreen(nx, ny, out = { x: 0, y: 0, z: 0 }) {
    const { forward, right, up } = this.getBasis();
    const tanHalf = Math.tan((this.fov * Math.PI) / 360);
    const sx = nx * this.aspect * tanHalf;
    const sy = ny * tanHalf;
    let dx = forward.x + right.x * sx + up.x * sy;
    let dy = forward.y + right.y * sx + up.y * sy;
    let dz = forward.z + right.z * sx + up.z * sy;
    const len = Math.hypot(dx, dy, dz) || 1;
    out.x = dx / len;
    out.y = dy / len;
    out.z = dz / len;
    return out;
  }

  get origin() {
    return this.renderPosition;
  }
}

function resolve(value, t, fallback) {
  if (!value) return fallback;
  if (typeof value === 'function') return value(t);
  return value;
}

export default CameraController;
