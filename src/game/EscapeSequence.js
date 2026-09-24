// -----------------------------------------------------------------------------
// EscapeSequence - the final run for the locomotive.
//
// Raises the train speed, throws debris and hazards at the player, arms the jump
// point at the front of the locomotive and plays the ending cinematic.
// -----------------------------------------------------------------------------
export class EscapeSequence {
  constructor({ train, environment, hazards, camera, effects, audio, damage = null } = {}) {
    this.train = train;
    this.environment = environment;
    this.hazards = hazards;
    this.camera = camera;
    this.effects = effects;
    this.audio = audio;
    this.damage = damage;

    this.active = false;
    this.complete = false;
    this.time = 0;
    this.banner = null;
    this.jumpArmed = false;
    this.jumped = false;
    this.speedRamp = 0;
    this.debrisTimer = 0;
    this.spawnedBridge = false;
    this.onComplete = null;
    this.onJump = null;
    this.endingTimer = 0;
    this.endingPlaying = false;
    this.originalSpeed = train?.speed ?? 21.5;
  }

  start() {
    if (this.active) return false;
    this.active = true;
    this.time = 0;
    this.banner = 'ESCAPE! GET OFF THE TRAIN!';
    this.originalSpeed = this.train.speed;
    this.train.targetSpeed = Math.max(32, this.train.speed * 1.45);
    this.camera?.setZoom(0.94, 1.18);
    this.audio?.play('alarm', { bus: 'ui' });
    this.audio?.startLoop('wind', 0.16);
    // the bridge the player has to survive on the way to the front
    if (this.environment && !this.spawnedBridge) {
      this.spawnedBridge = true;
      const s = this.environment.spawnStructure('trestle', { x: this.train.frontX + 260, opts: { length: 150 }, parallax: 1 });
      this.hazards?.track(s, { warn: 5, hazard: true });
    }
    if (this.environment) {
      const g = this.environment.spawnStructure('gantry', { x: this.train.frontX + 420, parallax: 1 });
      this.hazards?.track(g, { warn: 4.5, hazard: true });
    }
    return true;
  }

  update(dt, ctx) {
    if (!this.active) return;
    this.time += dt;
    const player = ctx.player;

    // ramp the speed up and keep it high
    this.train.targetSpeed = Math.max(this.train.targetSpeed, 30 + Math.min(10, this.time * 0.6));

    // debris and sparks flying past
    this.debrisTimer -= dt;
    if (this.debrisTimer <= 0 && this.effects) {
      this.debrisTimer = 0.18;
      const x = player ? player.pos.x + (Math.random() * 2 - 1) * 20 : this.train.frontX;
      this.effects.sim.spawn('debris', x, 1 + Math.random() * 3, (Math.random() - 0.5) * 8, {
        vx: -this.train.speed * 1.1,
        vy: 2.4,
        spreadY: 1.2,
        size: 0.4,
        life: 1.4,
      });
      this.effects.sim.spawn('dust', x, 1.2, (Math.random() - 0.5) * 6, {
        vx: -this.train.speed * 0.9,
        size: 1.4,
        life: 1.1,
      });
    }

    // arm the jump when the player is near the front of the locomotive
    const loco = this.train.locomotive;
    if (player) {
      const near = player.pos.x > loco.x1 - 8 && !player.dead;
      this.jumpArmed = near;
      for (const inter of loco.interactables) {
        if (inter.type === 'escape' && !inter.armed) {
          inter.armed = true;
          // blow the cab's front door so the leap reads on camera
          if (loco.doorFront) this.train.openDoor(loco.doorFront, 1.2);
        }
      }
    }

    if (this.endingPlaying) {
      this.endingTimer += dt;
      if (this.endingTimer > 1.2 && !this.jumped) {
        this.jumped = true;
        this.onJump?.();
      }
      if (this.endingTimer > 5.6) {
        this.endingPlaying = false;
        this.active = false;
        this.complete = true;
        this.banner = null;
        this.onComplete?.();
      }
    }
  }

  /** Player triggered the leap. */
  triggerJump(ctx = {}) {
    if (!this.active || this.endingPlaying) return false;
    this.endingPlaying = true;
    this.endingTimer = 0;
    this.banner = 'GOODBYE, IRON HORSE';
    this.camera?.playShot(
      {
        pos: (t) => ({ x: this.train.locomotive.x1 + 6 + t * 26, y: 9 - t * 2.4, z: 17 + t * 12 }),
        look: (t) => ({ x: this.train.locomotive.x1 - 4 + t * 12, y: 3 - t * 1.4, z: 0 }),
        fov: 40,
      },
      5.4,
      { blend: 0.5 }
    );
    if (ctx.player) {
      ctx.player.vel.x = 6;
      ctx.player.vel.y = 7.5;
      ctx.player.vel.z = 2.2;
      ctx.player.invulnerable = true;
    }
    this.audio?.play('jackpot');
    this.train.targetSpeed = 26;
    return true;
  }

  reset() {
    this.active = false;
    this.complete = false;
    this.time = 0;
    this.banner = null;
    this.jumpArmed = false;
    this.jumped = false;
    this.endingPlaying = false;
    this.endingTimer = 0;
    this.spawnedBridge = false;
    if (this.train) this.train.targetSpeed = this.train.baseSpeed ?? 21.5;
  }
}

export default EscapeSequence;
