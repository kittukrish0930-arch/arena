// -----------------------------------------------------------------------------
// PlayerController - turns raw input into intents and aim state.
//
// Movement axes map to the train: W/S run along the consist (world x), A/D cross
// the car (world z). Aiming follows the mouse through the cinematic camera's
// ray, with a small aim-assist cone so the angled 2.5D view stays comfortable.
// -----------------------------------------------------------------------------
import { clamp } from '../utils/MathUtils.js';

export class PlayerController {
  constructor(player, input, camera, ctx = {}) {
    this.player = player;
    this.input = input;
    this.camera = camera;
    this.ctx = ctx;
    this.intent = {
      moveDir: { x: 0, z: 0 },
      moveLength: 0,
      moveX: 0,
      moveY: 0,
      jump: false,
      jumpPressed: false,
      sprint: false,
      crouch: false,
      dodge: false,
      fire: false,
      aim: false,
      interact: false,
      reload: false,
    };
    this.aimDistance = 26;
    this._ray = { x: 0, y: 0, z: 0 };
    this._aimPoint = { x: 0, y: 0, z: 0 };
  }

  get muzzle() {
    return this.player.getMuzzlePosition?.() ?? {
      x: this.player.pos.x,
      y: this.player.pos.y + 1.2,
      z: this.player.pos.z,
    };
  }

  update(dt) {
    const input = this.input;
    const player = this.player;
    const axis = input.getMoveAxis(this.intent.moveDir ? { x: 0, y: 0 } : { x: 0, y: 0 });
    // axis.x = strafe (A/D) -> world z, axis.y = forward (W/S) -> world x
    this.intent.moveX = axis.y;
    this.intent.moveY = axis.y;
    this.intent.moveDir.x = axis.y;
    this.intent.moveDir.z = axis.x;
    this.intent.moveLength = Math.hypot(axis.x, axis.y);
    this.intent.jump = input.isDown('jump');
    this.intent.jumpPressed = input.wasPressed('jump');
    this.intent.sprint = input.isDown('sprint');
    this.intent.crouch = input.isDown('crouch');
    this.intent.interact = input.wasPressed('interact');
    this.intent.reload = input.wasPressed('reload');
    this.intent.fire = input.mouse.left;
    this.intent.aim = input.mouse.right || input.mouse.left;
    this.intent.dodge = input.wasPressed('dodge');

    // --- aim ----------------------------------------------------------------
    this._updateAim();

    if (!player.alive) return this.intent;

    if (this.intent.dodge) player.startDodge(this.intent);
    if (this.intent.jumpPressed) {
      // grabbing back onto the train takes priority over ladders
      if (player.canRecover) player.tryRecover();
    }
    player.aiming = this.intent.aim || player.shootTimer > 0;
    return this.intent;
  }

  _updateAim() {
    const camera = this.camera;
    const player = this.player;
    const ray = camera.rayFromScreen(this.input.mouse.nx, this.input.mouse.ny, this._ray);
    const origin = camera.origin;
    const t = this.aimDistance;
    const px = origin.x + ray.x * t;
    const py = origin.y + ray.y * t;
    const pz = origin.z + ray.z * t;

    const muzzle = this.muzzle;
    let dx = px - muzzle.x;
    let dy = py - muzzle.y;
    let dz = pz - muzzle.z;
    let len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;

    // --- aim assist ---------------------------------------------------------
    const targets = this.ctx.getTargets?.() || [];
    const assist = this.ctx.aimAssist ?? 0;
    if (targets.length) {
      let bestDot = 0.985;
      let bestDir = null;
      for (const tgt of targets) {
        const tp = tgt.pos;
        let tx = tp.x - muzzle.x;
        let ty = tp.y - muzzle.y;
        let tz = tp.z - muzzle.z;
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl;
        ty /= tl;
        tz /= tl;
        const dot = tx * dx + ty * dy + tz * dz;
        if (dot > bestDot) {
          bestDot = dot;
          bestDir = { x: tx, y: ty, z: tz };
        }
      }
      if (bestDir) {
        const k = clamp(assist * 1.6, 0, 0.65);
        dx += (bestDir.x - dx) * k;
        dy += (bestDir.y - dy) * k;
        dz += (bestDir.z - dz) * k;
        len = Math.hypot(dx, dy, dz) || 1;
        dx /= len;
        dy /= len;
        dz /= len;
      }
    }

    player.aimDir.x = dx;
    player.aimDir.y = dy;
    player.aimDir.z = dz;
    player.aimPoint.x = px;
    player.aimPoint.y = py;
    player.aimPoint.z = pz;
    player.aimPitch = Math.asin(clamp(dy, -1, 1)) * 0.9;
    player.facing = dx >= 0 ? 1 : -1;
    return player.aimDir;
  }
}

export default PlayerController;
