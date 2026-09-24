// -----------------------------------------------------------------------------
// CharacterRig - procedural limb animation (three.js free).
//
// Every character (player, guards, boss) uses the same rig: the simulation
// writes a flat pose object every frame and the render layer maps it onto a
// THREE.Group hierarchy of bones. No skeletal animation data needed.
// -----------------------------------------------------------------------------

export function createPose() {
  return {
    yaw: 0,
    lean: 0, // torso pitch (radians)
    twist: 0, // torso yaw offset
    bob: 0, // vertical offset of the hips
    hipY: 0,
    rootRoll: 0, // barrel roll (dodge / death)
    rootPitch: 0,
    rootYaw: 0,
    headPitch: 0,
    headYaw: 0,
    armL: { x: 0, y: 0, z: 0 },
    armR: { x: 0, y: 0, z: 0 },
    foreL: { x: 0, y: 0, z: 0 },
    foreR: { x: 0, y: 0, z: 0 },
    legL: { x: 0, y: 0, z: 0 },
    legR: { x: 0, y: 0, z: 0 },
    shinL: { x: 0, y: 0, z: 0 },
    shinR: { x: 0, y: 0, z: 0 },
    weaponPitch: 0,
    scaleY: 1,
  };
}

export function resetPose(p) {
  p.yaw = 0;
  p.lean = 0;
  p.twist = 0;
  p.bob = 0;
  p.hipY = 0;
  p.rootRoll = 0;
  p.rootPitch = 0;
  p.rootYaw = 0;
  p.headPitch = 0;
  p.headYaw = 0;
  setVec(p.armL, 0, 0, 0);
  setVec(p.armR, 0, 0, 0);
  setVec(p.foreL, 0, 0, 0);
  setVec(p.foreR, 0, 0, 0);
  setVec(p.legL, 0, 0, 0);
  setVec(p.legR, 0, 0, 0);
  setVec(p.shinL, 0, 0, 0);
  setVec(p.shinR, 0, 0, 0);
  p.weaponPitch = 0;
  p.scaleY = 1;
  return p;
}

function setVec(v, x, y, z) {
  v.x = x;
  v.y = y;
  v.z = z;
}

const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

/**
 * Shared locomotion + combat posing. `s` describes the character:
 *   { speed, maxSpeed, onGround, vy, aiming, aimPitch, yaw, state, stateTime,
 *     shootTimer, reloadTimer, hitTimer, hurtDir, dead, deadTimer, climbing,
 *     dodgeTimer, crouch, moveDir }
 * Animations blend via `anim.blend` so transitions never snap.
 */
export function animateCharacter(pose, s, anim, dt, time) {
  resetPose(pose);
  const speed = Math.abs(s.speed ?? 0);
  const walkT = speed / Math.max(0.001, s.maxSpeed ?? 6);
  const moving = speed > 0.35;
  const stride = (anim.stride = (anim.stride || 0) + speed * dt * 3.4);

  // --- base facing ---------------------------------------------------------
  pose.yaw = s.yaw ?? 0;
  pose.hipY = s.crouch ? -0.28 : 0;

  // --- legs / arms depending on state -------------------------------------
  const climb = !!s.climbing;
  const airborne = !s.onGround && !climb;

  if (s.dead) {
    const t = Math.min(1, (s.deadTimer || 0) / 0.7);
    const e = t * t * (3 - 2 * t);
    pose.rootRoll = -Math.PI / 2 * e;
    pose.hipY = -0.5 * e;
    pose.lean = 0.2 * e;
    setVec(pose.armL, -0.9 * e, 0, 0.5 * e);
    setVec(pose.armR, 0.7 * e, 0, -0.4 * e);
    setVec(pose.legL, 0.35 * e, 0, 0.2 * e);
    setVec(pose.legR, -0.2 * e, 0, -0.1 * e);
    return pose;
  }

  if (climb) {
    const c = stride * 1.1;
    const a = Math.sin(c);
    setVec(pose.armL, -2.2 + a * 0.5, 0, 0.35);
    setVec(pose.armR, -2.2 - a * 0.5, 0, -0.35);
    setVec(pose.foreL, -0.5 - a * 0.3, 0, 0);
    setVec(pose.foreR, -0.5 + a * 0.3, 0, 0);
    setVec(pose.legL, -0.5 - a * 0.5, 0, 0.12);
    setVec(pose.legR, -0.5 + a * 0.5, 0, -0.12);
    setVec(pose.shinL, 0.9 + a * 0.3, 0, 0);
    setVec(pose.shinR, 0.9 - a * 0.3, 0, 0);
    pose.lean = -0.18;
    pose.rootPitch = Math.PI * 0.02;
    return pose;
  }

  if (airborne) {
    const rising = (s.vy ?? 0) > 0;
    const k = rising ? 1 : 0.6;
    setVec(pose.armL, -1.5 * k, 0, 0.9 * k);
    setVec(pose.armR, -1.1 * k, 0, -0.6 * k);
    setVec(pose.foreL, -0.7 * k, 0, 0);
    setVec(pose.foreR, -0.5 * k, 0, 0);
    setVec(pose.legL, rising ? -1.0 : -0.3, 0, 0.15);
    setVec(pose.legR, rising ? -0.4 : -0.8, 0, -0.15);
    setVec(pose.shinL, rising ? 1.3 : 0.4, 0, 0);
    setVec(pose.shinR, rising ? 0.7 : 1.1, 0, 0);
    pose.lean = rising ? -0.12 : 0.16;
    pose.bob = 0.02;
    return pose;
  }

  if (s.state === 'dodge' || s.state === 'roll') {
    const t = Math.min(1, (s.stateTime || 0) / Math.max(0.0001, s.dodgeDuration || 0.42));
    pose.rootRoll = -TAU * t * (s.dodgeSign ?? 1);
    const curl = Math.sin(t * Math.PI);
    pose.hipY = -0.42 * curl;
    setVec(pose.armL, -1.6 * curl, 0, 0.7 * curl);
    setVec(pose.armR, -1.6 * curl, 0, -0.7 * curl);
    setVec(pose.foreL, -1.1 * curl, 0, 0);
    setVec(pose.foreR, -1.1 * curl, 0, 0);
    setVec(pose.legL, -1.2 * curl, 0, 0.2);
    setVec(pose.legR, -1.2 * curl, 0, -0.2);
    setVec(pose.shinL, 1.6 * curl, 0, 0);
    setVec(pose.shinR, 1.6 * curl, 0, 0);
    return pose;
  }

  // --- ground locomotion ---------------------------------------------------
  const runBlend = Math.min(1, walkT * 1.15);
  const swing = Math.sin(stride);
  const swing2 = Math.sin(stride + Math.PI);
  const legAmp = lerp(0.45, 0.95, runBlend);
  const armAmp = lerp(0.35, 0.75, runBlend);

  setVec(pose.legL, swing * legAmp, 0, 0.06);
  setVec(pose.legR, swing2 * legAmp, 0, -0.06);
  setVec(pose.shinL, Math.max(0, -swing) * legAmp * 1.5, 0, 0);
  setVec(pose.shinR, Math.max(0, -swing2) * legAmp * 1.5, 0, 0);
  setVec(pose.armL, swing2 * armAmp - 0.15, 0, 0.22);
  setVec(pose.armR, swing * armAmp - 0.15, 0, -0.22);
  setVec(pose.foreL, -0.35 - Math.max(0, swing) * 0.4, 0, 0);
  setVec(pose.foreR, -0.35 - Math.max(0, swing2) * 0.4, 0, 0);
  pose.bob = moving ? Math.abs(Math.sin(stride)) * lerp(0.03, 0.075, runBlend) : Math.sin(time * 1.6) * 0.012;
  pose.lean = lerp(0, 0.22, runBlend);
  pose.twist = moving ? -swing * 0.16 * runBlend : 0;

  if (s.crouch) {
    setVec(pose.legL, -0.9, 0, 0.15);
    setVec(pose.legR, -0.9, 0, -0.15);
    setVec(pose.shinL, 1.5, 0, 0);
    setVec(pose.shinR, 1.5, 0, 0);
    pose.lean = 0.35;
    pose.bob = -0.1;
  }

  // --- upper body combat overrides ----------------------------------------
  if (s.reloadTimer > 0 && s.reloadTotal > 0) {
    const t = 1 - s.reloadTimer / s.reloadTotal;
    const spin = Math.sin(t * Math.PI) * 1.0;
    setVec(pose.armL, -1.5 - spin * 0.4, 0, 0.9 - t * 0.6);
    setVec(pose.foreL, -1.2 - spin * 0.6, 0, 0);
    setVec(pose.armR, -0.6 - t * 0.5, 0, -0.4);
    setVec(pose.foreR, -0.9, 0, 0);
    pose.weaponPitch = -0.5 - t * 0.5;
    pose.twist = -0.25;
  } else if (s.aiming || s.shootTimer > 0) {
    const recoil = s.shootTimer > 0 ? Math.sin((s.shootTimer / 0.14) * Math.PI) : 0;
    const pitch = s.aimPitch ?? 0;
    setVec(pose.armR, -1.5 + pitch + recoil * 0.35, 0, -0.32);
    setVec(pose.foreR, -0.25 - recoil * 0.3, 0, 0);
    setVec(pose.armL, -1.25 + pitch * 0.8 + recoil * 0.2, 0, 0.55);
    setVec(pose.foreL, -0.95, 0, 0.1);
    pose.twist = -0.14 * (s.aimFacing ?? 1);
    pose.weaponPitch = pitch * 0.8;
  }

  if (s.hitTimer > 0) {
    const k = Math.min(1, s.hitTimer / 0.25);
    pose.lean -= 0.4 * k;
    pose.headPitch = -0.25 * k;
    setVec(pose.armL, pose.armL.x - 0.5 * k, 0, pose.armL.z + 0.3 * k);
    pose.rootPitch = -0.12 * k * (s.hurtDir ?? 1);
  }

  pose.headPitch += (s.headPitch ?? 0);
  pose.headYaw = s.headYaw ?? 0;
  return pose;
}

export default { createPose, resetPose, animateCharacter };
