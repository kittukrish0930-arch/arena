// -----------------------------------------------------------------------------
// Player - the outlaw.
//
// Owns movement/physics state, health, inventory, aim state and the procedural
// pose used by the render layer. Input handling lives in PlayerController and
// weapons in PlayerCombat.
// -----------------------------------------------------------------------------
import { PLAYER, TRAIN, COMBAT } from '../game/Config.js';
import { clamp, damp, dampAngle } from '../utils/MathUtils.js';
import { createPose, animateCharacter } from '../characters/CharacterRig.js';

export const PlayerState = {
  IDLE: 'idle',
  WALK: 'walk',
  RUN: 'run',
  JUMP: 'jump',
  FALL: 'fall',
  LAND: 'land',
  DODGE: 'dodge',
  CLIMB: 'climb',
  HANGING: 'hanging',
  HURT: 'hurt',
  DEAD: 'dead',
};

export class Player {
  constructor(world, train, { spawn = { x: 120, y: TRAIN.floorY, z: 0 }, damageSystem = null } = {}) {
    this.world = world;
    this.train = train;
    this.damageSystem = damageSystem;
    this.type = 'player';

    this.pos = { x: spawn.x, y: spawn.y, z: spawn.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.width = PLAYER.radius * 2;
    this.height = PLAYER.height;
    this.baseHeight = PLAYER.height;

    this.health = PLAYER.maxHealth;
    this.maxHealth = PLAYER.maxHealth;
    this.invulnerable = false;
    this.dead = false;
    this.deadTimer = 0;

    this.onGround = false;
    this.onRoof = false;
    this.insideCar = false;
    this.crouch = false;
    this.climbing = false;
    this.climbTarget = null;
    this.sprinting = false;
    this.state = PlayerState.IDLE;
    this.stateTime = 0;
    this.landTimer = 0;
    this.hitTimer = 0;
    this.iframes = 0;
    this.hurtDir = 1;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.dodgeTimer = 0;
    this.dodgeCooldown = 0;
    this.dodgeDir = { x: 1, z: 0 };
    this.dodgeSign = 1;
    this.fallRecoveryTimer = 0;
    this.canRecover = false;
    this.lastGroundY = spawn.y;

    this.yaw = Math.PI;
    this.facing = -1;
    this.aimDir = { x: -1, y: 0, z: 0 };
    this.aimPoint = { x: 0, y: 0, z: 0 };
    this.aiming = false;
    this.aimPitch = 0;
    this.headPitch = 0;
    this.headYaw = 0;

    this.weapon = {
      name: COMBAT.revolver.name,
      ammo: COMBAT.revolver.magSize,
      reserve: COMBAT.revolver.reserveAmmo,
      magSize: COMBAT.revolver.magSize,
      fireTimer: 0,
      reloadTimer: 0,
      reloadTotal: COMBAT.revolver.reloadTime,
      lastShotTime: -99,
    };
    this.shootTimer = 0;
    this.muzzleFlash = 0;

    this.loot = 0;
    this.lootItems = [];
    this.stealthKills = 0;

    this.pose = createPose();
    this.anim = { stride: 0 };
    this.time = 0;
    this.speed = 0;
    this.footstepTimer = 0;
    this.landImpact = 0;
    this.events = [];
    /** absolute x of the furthest progress made (used by the objective system) */
    this.maxProgressX = spawn.x;
  }

  get eye() {
    return { x: this.pos.x, y: this.pos.y + PLAYER.eyeHeight * (this.crouch ? 0.72 : 1), z: this.pos.z };
  }

  get speedNorm() {
    return Math.hypot(this.vel.x, this.vel.z) / PLAYER.sprintSpeed;
  }

  get center() {
    return { x: this.pos.x, y: this.pos.y + this.height / 2, z: this.pos.z };
  }

  get head() {
    return { x: this.pos.x, y: this.pos.y + this.height - 0.18, z: this.pos.z };
  }

  get alive() {
    return !this.dead;
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  reset(spawn) {
    this.pos = { ...spawn };
    this.vel = { x: 0, y: 0, z: 0 };
    this.health = this.maxHealth;
    this.dead = false;
    this.deadTimer = 0;
    this.state = PlayerState.IDLE;
    this.stateTime = 0;
    this.weapon.ammo = this.weapon.magSize;
    this.weapon.reserve = COMBAT.revolver.reserveAmmo;
    this.weapon.reloadTimer = 0;
    this.weapon.fireTimer = 0;
    this.climbing = false;
    this.canRecover = false;
    this.fallRecoveryTimer = 0;
    this.dodgeTimer = 0;
    this.dodgeCooldown = 0;
    this.hitTimer = 0;
    this.iframes = 0;
    this.loot = 0;
    this.lootItems.length = 0;
    this.maxProgressX = spawn.x;
    this.grabLadder = null;
  }

  /** Applies movement intents resolved by the controller. */
  applyMovement(dt, intent) {
    const wasGround = this.onGround;
    this.sprinting = intent.sprint && intent.moveLength > 0.1 && !this.crouch;
    this.crouch = intent.crouch && this.onGround && !this.climbing;

    if (this.climbing) {
      this._updateClimb(dt, intent);
      return;
    }

    // --- target velocity ---------------------------------------------------
    let speed = this.crouch ? PLAYER.crouchSpeed : this.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    if (this.state === PlayerState.DODGE) speed = PLAYER.dodgeSpeed;
    const dirX = intent.moveDir.x;
    const dirZ = intent.moveDir.z;
    const targetVX = dirX * speed;
    const targetVZ = dirZ * speed;
    const accel = this.onGround || PLAYER.airAccel === 0 ? PLAYER.accel : PLAYER.airAccel;

    if (this.state === PlayerState.DODGE) {
      this.vel.x = this.dodgeDir.x * PLAYER.dodgeSpeed * (1 - Math.min(1, this.dodgeTimer / PLAYER.dodgeDuration) * 0.55);
      this.vel.z = this.dodgeDir.z * PLAYER.dodgeSpeed * (1 - Math.min(1, this.dodgeTimer / PLAYER.dodgeDuration) * 0.55);
    } else if (intent.moveLength > 0.01) {
      this.vel.x += (targetVX - this.vel.x) * Math.min(1, (accel / Math.max(1, Math.abs(targetVX - this.vel.x) + accel * dt)) * dt * 3.2);
      this.vel.z += (targetVZ - this.vel.z) * Math.min(1, (accel / Math.max(1, Math.abs(targetVZ - this.vel.z) + accel * dt)) * dt * 3.2);
    } else if (this.onGround) {
      const f = Math.max(0, 1 - PLAYER.friction * dt);
      this.vel.x *= f;
      this.vel.z *= f;
      if (Math.abs(this.vel.x) < 0.02) this.vel.x = 0;
      if (Math.abs(this.vel.z) < 0.02) this.vel.z = 0;
    }

    // --- jump -------------------------------------------------------------
    this.jumpBuffer = intent.jump ? PLAYER.jumpBuffer : Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.onGround ? PLAYER.coyoteTime : Math.max(0, this.coyote - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0 && this.state !== PlayerState.DODGE) {
      this.vel.y = PLAYER.jumpSpeed * (this.crouch ? 0.75 : 1);
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.onGround = false;
      this.setState(PlayerState.JUMP);
      this.emit('jump');
    }

    // --- dodge ------------------------------------------------------------
    if (this.state === PlayerState.DODGE) {
      this.dodgeTimer -= dt;
      if (this.dodgeTimer <= 0) {
        this.setState(this.onGround ? PlayerState.IDLE : PlayerState.FALL);
      }
    }

    // --- integrate ---------------------------------------------------------
    const collide = this.world.moveActor(this, dt, { stepHeight: PLAYER.stepHeight });
    this.onGround = collide.ground;
    if (collide.ground) {
      this.lastGroundY = this.pos.y;
      if (wasGround === false && this.state !== PlayerState.DODGE) {
        const impact = this.landImpact;
        if (impact > 6) this.setState(PlayerState.LAND, Math.min(0.38, impact / 34));
        this.emit('land', { impact });
      }
    }

    // keep the player inside the useful play space (the train + a small apron)
    const minX = this.train.rearX - 40;
    const maxX = this.train.frontX + 40;
    if (this.pos.x < minX) {
      this.pos.x = minX;
      this.vel.x = Math.max(0, this.vel.x);
    }
    if (this.pos.x > maxX) {
      this.pos.x = maxX;
      this.vel.x = Math.min(0, this.vel.x);
    }
    if (this.pos.z < -60) {
      this.pos.z = -60;
      this.vel.z = Math.max(0, this.vel.z);
    }
    if (this.pos.z > 60) {
      this.pos.z = 60;
      this.vel.z = Math.min(0, this.vel.z);
    }

    // --- falling off the train (recovery window) ---------------------------
    this._updateFallRecovery(dt);
  }

  _updateFallRecovery(dt) {
    const onTrainSurface = this.pos.y > 0.4;
    if (onTrainSurface || this.onGround) {
      this.canRecover = false;
      this.fallRecoveryTimer = 0;
      return;
    }
    // below the rail head: the player is off the train
    if (!this.canRecover) {
      this.canRecover = true;
      this.fallRecoveryTimer = PLAYER.fallRecoveryWindow;
      this.emit('fallOff');
    }
    this.fallRecoveryTimer -= dt;
    if (this.fallRecoveryTimer <= 0) this.canRecover = false;
  }

  /** Fresh attempt to grab the train after falling off. */
  tryRecover() {
    if (!this.canRecover) return false;
    const car = this.train.carAt(this.pos.x);
    if (!car) return false;
    const side = Math.sign(this.pos.z) || 1;
    const targetZ = clamp(this.pos.z, -TRAIN.halfWidth + 0.5, TRAIN.halfWidth - 0.5);
    this.pos.x = clamp(this.pos.x, car.x0 + 0.6, car.x1 - 0.6);
    this.pos.z = targetZ;
    this.pos.y = car.hasRoof ? car.roofSurfaceY + 0.02 : car.floorSurfaceY + 0.02;
    this.vel.x = 0;
    this.vel.z = 0;
    this.vel.y = 3.4;
    this.canRecover = false;
    this.fallRecoveryTimer = 0;
    this.setState(PlayerState.LAND, 0.25);
    this.emit('recovered', { side, car });
    return true;
  }

  /** Starts a climb if the player overlaps a ladder. */
  tryClimb() {
    const boxes = this.world.pointOverlaps(this.pos.x, this.pos.y + 0.4, this.pos.z);
    for (const b of boxes) {
      if (b.tag === 'ladder' || b.tag === 'roofLadder') {
        this.climbing = true;
        this.climbTarget = b;
        this.vel.x = 0;
        this.vel.z = 0;
        this.vel.y = 0;
        this.aimDir = { x: 0, y: 0, z: 1 };
        this.setState(PlayerState.CLIMB);
        this.pos.x = (b.minX + b.maxX) / 2;
        this.pos.z = (b.minZ + b.maxZ) / 2;
        this.emit('climbStart', { box: b });
        return true;
      }
    }
    return false;
  }

  _updateClimb(dt, intent) {
    const box = this.climbTarget;
    this.vel.x = 0;
    this.vel.z = 0;
    this.vel.y = 0;
    const up = intent.moveY > 0.15 || intent.jump;
    const down = intent.moveY < -0.15;
    const speed = 3.1;
    if (up) this.pos.y += speed * dt;
    if (down) this.pos.y -= speed * dt;
    // snap to the ladder
    this.pos.x = damp(this.pos.x, (box.minX + box.maxX) / 2, 8, dt);
    this.pos.z = damp(this.pos.z, (box.minZ + box.maxZ) / 2, 8, dt);

    const top = box.data?.top ?? box.maxY;
    if (this.pos.y >= top - 0.05) {
      this.climbing = false;
      this.climbTarget = null;
      this.pos.y = top + 0.05;
      // step inwards so the player ends up on the walkable surface
      this.pos.z = clamp(this.pos.z, -TRAIN.halfWidth + 0.5, TRAIN.halfWidth - 0.5);
      this.vel.y = 1.2;
      this.setState(PlayerState.LAND, 0.2);
      this.emit('climbFinish', { top });
    } else if (this.pos.y < box.minY - 0.4) {
      this.climbing = false;
      this.climbTarget = null;
      this.setState(PlayerState.FALL);
    }
    if (intent.jump && this.pos.y < top - 0.6) {
      this.climbing = false;
      this.climbTarget = null;
      this.setState(PlayerState.FALL);
      const push = Math.sign(this.pos.z) || 1;
      this.pos.z += push * 0.4;
      this.vel.z = push * 2.2;
    }
  }

  startDodge(intent) {
    if (this.dodgeCooldown > 0 || this.state === PlayerState.DODGE || !this.alive) return false;
    let dx = intent.moveDir.x;
    let dz = intent.moveDir.z;
    if (Math.hypot(dx, dz) < 0.2) {
      dx = Math.cos(this.yaw);
      dz = -Math.sin(this.yaw);
    }
    const len = Math.hypot(dx, dz) || 1;
    this.dodgeDir = { x: dx / len, z: dz / len };
    this.dodgeSign = dz >= 0 ? 1 : -1;
    this.dodgeTimer = PLAYER.dodgeDuration;
    this.dodgeCooldown = PLAYER.dodgeCooldown;
    this.invulnerable = true;
    this.setState(PlayerState.DODGE, PLAYER.dodgeDuration);
    this.emit('dodge');
    return true;
  }

  setState(state, time = 0) {
    if (this.state === state && time === 0) return;
    this.state = state;
    this.stateTime = time;
    this.stateDuration = time;
  }

  addLoot(item) {
    this.loot += item.value;
    this.lootItems.push(item);
    this.emit('loot', { item });
  }

  damage(amount, { source = null, dir = null, headshot = false, knockback = 0, ignoreInvuln = false } = {}) {
    if (this.dead) return 0;
    if (this.invulnerable && !ignoreInvuln) return 0;
    if (this.iframes > 0 && !ignoreInvuln) return 0;
    const applied = Math.min(this.health, amount);
    this.health -= applied;
    this.hitTimer = 0.25;
    this.iframes = PLAYER.hitInvuln ?? 0.42;
    if (dir) {
      this.hurtDir = dir.x >= 0 ? 1 : -1;
      this.vel.x += dir.x * knockback;
      this.vel.z += dir.z * knockback;
      this.vel.y += knockback * 0.12;
    }
    this.damageSystem?.recordDamageTaken(applied);
    this.emit('hurt', { amount: applied, source });
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.deadTimer = 0;
      this.setState(PlayerState.DEAD);
      this.emit('death', { source });
    }
    return applied;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /** Hit spheres used by enemy raycasts. */
  getHitSpheres() {
    const c = this.center;
    return [
      { pos: { x: c.x, y: c.y - 0.05, z: c.z }, radius: 0.44, target: this, multiplier: 1, headshot: false },
      {
        pos: { x: this.pos.x, y: this.pos.y + this.height - 0.16, z: this.pos.z },
        radius: 0.24,
        target: this,
        multiplier: COMBAT.revolver.headshotMultiplier,
        headshot: true,
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // per frame
  // ---------------------------------------------------------------------------

  update(dt, intent, ctx = {}) {
    this.time += dt;
    this.stateTime += dt;
    this.shootTimer = Math.max(0, this.shootTimer - dt);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    if (this.landImpact > 0) this.landImpact = Math.max(0, this.landImpact - dt * 40);

    if (this.dead) {
      this.deadTimer += dt;
      this.vel.x *= 0.9;
      this.vel.z *= 0.9;
      this.vel.y -= PLAYER.gravity * dt;
      this.world.moveActor(this, dt, { stepHeight: PLAYER.stepHeight });
      this._animate(dt);
      return;
    }

    const prevSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.applyMovement(dt, intent);
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // landing / state bookkeeping
    if (this.state === PlayerState.LAND) {
      if (this.stateTime > (this.stateDuration || 0.2)) this.setState(PlayerState.IDLE);
    } else if (!this.onGround && this.state !== PlayerState.DODGE && !this.climbing) {
      this.setState(this.vel.y > 0.5 ? PlayerState.JUMP : PlayerState.FALL);
    } else if (this.onGround && !this.climbing) {
      if (this.state === PlayerState.JUMP || this.state === PlayerState.FALL) this.setState(PlayerState.IDLE);
      const sp = this.speed;
      if (this.state !== PlayerState.DODGE) {
        if (sp > PLAYER.walkSpeed * 1.15) this.setState(PlayerState.RUN);
        else if (sp > 0.4) this.setState(PlayerState.WALK);
        else this.setState(PlayerState.IDLE);
      }
    }

    // footstep / slide events
    if (this.onGround && this.speed > 1) {
      this.footstepTimer -= dt * this.speed;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 2.4;
        this.emit('footstep', { surface: this._surfaceUnder(), speed: this.speed });
      }
    }

    if (this.damageSystem) this.damageSystem.recordDistance(this.speed * dt);

    // environment awareness
    this.insideCar = this.train.isInsideCar(this.pos.x, this.pos.y + 0.9, this.pos.z);
    this.onRoof = this.pos.y > TRAIN.floorY + 2.7;
    this.maxProgressX = Math.max(this.maxProgressX, this.pos.x);

    this._animate(dt);
  }

  _surfaceUnder() {
    const hit = this.world.pointOverlaps(this.pos.x, this.pos.y - 0.08, this.pos.z);
    for (const b of hit) if (b.tag) return b.tag;
    return this.onGround ? 'train' : 'air';
  }

  _animate(dt) {
    const speed = this.dead ? 0 : Math.hypot(this.vel.x, this.vel.z);
    animateCharacter(
      this.pose,
      {
        speed,
        maxSpeed: PLAYER.sprintSpeed,
        onGround: this.onGround,
        vy: this.vel.y,
        yaw: this.yaw,
        state: this.state,
        stateTime: this.stateTime,
        dodgeDuration: PLAYER.dodgeDuration,
        dodgeSign: this.dodgeSign,
        climbing: this.climbing,
        crouch: this.crouch,
        aiming: this.aiming,
        aimPitch: this.aimPitch,
        shootTimer: this.shootTimer,
        reloadTimer: this.weapon.reloadTimer,
        reloadTotal: this.weapon.reloadTotal,
        hitTimer: this.hitTimer,
        hurtDir: this.hurtDir,
        dead: this.dead,
        deadTimer: this.deadTimer,
        headPitch: this.headPitch,
        headYaw: this.headYaw,
      },
      this.anim,
      dt,
      this.time
    );

    // glide the body towards the aim direction
    if (!this.climbing && !this.dead) {
      const targetYaw = Math.atan2(-this.aimDir.z, this.aimDir.x || 0.0001);
      if (this.state !== PlayerState.DODGE) this.yaw = dampAngle(this.yaw, targetYaw, 14, dt);
    }
    this.pose.yaw = this.yaw;
  }
}

export default Player;
