// -----------------------------------------------------------------------------
// Enemy - guards, heavies, elites and the boss share this class.
//
// AI is a compact state machine (IDLE / PATROL / ALERT / CHASE / ATTACK /
// TAKE_COVER / HURT / DEAD) driven by distance, line of sight and cover nodes.
// Movement is intentionally simple: enemies walk along the car they belong to,
// which keeps them reliable on the train and cheap to simulate.
// -----------------------------------------------------------------------------
import { TRAIN } from '../game/Config.js';
import { Weapon, WEAPONS } from '../combat/Weapon.js';
import { createPose, animateCharacter } from '../characters/CharacterRig.js';
import { clamp, damp, dampAngle } from '../utils/MathUtils.js';

export const EnemyState = {
  IDLE: 'idle',
  PATROL: 'patrol',
  ALERT: 'alert',
  CHASE: 'chase',
  ATTACK: 'attack',
  TAKE_COVER: 'takeCover',
  HURT: 'hurt',
  DEAD: 'dead',
};

export const ENEMY_TYPES = {
  basic: {
    id: 'basic',
    label: 'GUARD',
    health: 60,
    speed: 2.7,
    weapon: 'guardRevolver',
    preferredRange: 11,
    minRange: 3,
    reactionTime: 0.55,
    accuracy: 0.62,
    sightRange: 34,
    fov: 1.5,
    height: 1.78,
    score: 'basic',
    loot: 0.25,
    cover: true,
    colors: { coat: 'guardCoat', coatDark: 'guardCoatDark', shirt: 'guardShirt', hat: 'guardCoatDark' },
  },
  shotgun: {
    id: 'shotgun',
    label: 'SCATTERGUN GUARD',
    health: 85,
    speed: 4.1,
    weapon: 'shotgun',
    preferredRange: 5.5,
    minRange: 1.2,
    reactionTime: 0.4,
    accuracy: 0.55,
    sightRange: 26,
    fov: 1.7,
    height: 1.8,
    score: 'shotgun',
    loot: 0.4,
    cover: false,
    colors: { coat: 'guardCoat', coatDark: 'rust', shirt: 'guardShirt', hat: 'guardCoatDark' },
  },
  rifle: {
    id: 'rifle',
    label: 'RIFLEMAN',
    health: 55,
    speed: 2.5,
    weapon: 'rifle',
    preferredRange: 22,
    minRange: 12,
    reactionTime: 0.7,
    accuracy: 0.78,
    sightRange: 46,
    fov: 1.35,
    height: 1.78,
    score: 'rifle',
    loot: 0.3,
    cover: true,
    colors: { coat: 'guardCoatDark', coatDark: 'guardCoat', shirt: 'guardShirt', hat: 'hatBrown' },
  },
  heavy: {
    id: 'heavy',
    label: 'HEAVY GUARD',
    health: 210,
    speed: 1.7,
    weapon: 'heavy',
    preferredRange: 13,
    minRange: 4,
    reactionTime: 0.9,
    accuracy: 0.6,
    sightRange: 34,
    fov: 1.4,
    height: 2.05,
    mass: 2.4,
    score: 'heavy',
    loot: 0.6,
    cover: false,
    colors: { coat: 'armorHeavy', coatDark: 'armorHeavyDark', shirt: 'armorHeavyDark', hat: 'armorHeavyDark' },
  },
  elite: {
    id: 'elite',
    label: 'ELITE GUARD',
    health: 130,
    speed: 5.4,
    weapon: 'bossCannon',
    preferredRange: 9,
    minRange: 1.5,
    reactionTime: 0.28,
    accuracy: 0.72,
    sightRange: 44,
    fov: 1.9,
    height: 1.86,
    score: 'elite',
    loot: 0.8,
    cover: true,
    colors: { coat: 'eliteCoat', coatDark: 'armorHeavyDark', shirt: 'armorHeavy', hat: 'eliteCoat' },
  },
  boss: {
    id: 'boss',
    label: 'ELITE GUARD',
    health: 760,
    speed: 3.2,
    weapon: 'bossCannon',
    preferredRange: 12,
    minRange: 3,
    reactionTime: 0.35,
    accuracy: 0.8,
    sightRange: 60,
    fov: 2.4,
    height: 2.15,
    mass: 4,
    score: 'boss',
    loot: 0,
    cover: true,
    isBoss: true,
    colors: { coat: 'bossArmor', coatDark: 'ironDark', shirt: 'bossTrim', hat: 'bossArmor' },
  },
};

let nextEnemyId = 1;

export class Enemy {
  constructor(type, { pos, car = null, team = 1, manager = null, node = null } = {}) {
    this.id = `enemy_${nextEnemyId++}`;
    this.def = typeof type === 'string' ? ENEMY_TYPES[type] : type;
    this.type = this.def.id;
    this.team = team;
    this.manager = manager;
    this.car = car;
    this.node = node;

    this.pos = { x: pos.x, y: pos.y ?? TRAIN.floorY, z: pos.z ?? 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.height = this.def.height ?? 1.8;
    this.width = 0.72;
    this.mass = this.def.mass ?? 1;

    this.health = this.def.health;
    this.maxHealth = this.def.health;
    this.dead = false;
    this.deadTimer = 0;
    this.state = EnemyState.IDLE;
    this.stateTime = 0;
    this.aimTimer = 0;
    this.shootTimer = 0;
    this.hitTimer = 0;
    this.alertLevel = 0;
    this.detection = 0;
    this.staggered = 0;
    this.lostSight = 0;
    this.weapon = new Weapon(WEAPONS[this.def.weapon], this);
    this.yaw = Math.PI;
    this.aimDir = { x: -1, y: 0, z: 0 };
    this.aimPitch = 0;
    this.headPitch = 0;
    this.muzzleFlash = 0;
    this.crouch = false;
    this.coverOffset = 0;
    this.patrolTarget = { x: pos.x, z: 0 };
    this.patrolTimer = 0;
    this.onGround = true;
    this.aiming = true;
    this.state3d = 'idle';
    this.pose = createPose();
    this.anim = { stride: 0 };
    this.time = 0;
    this.events = [];
    this.isBoss = !!this.def.isBoss;
    this.phase = 1;
    this.deathHandled = false;
    this.surfaceY = pos.y ?? TRAIN.floorY;
    this.onRoof = this.surfaceY > TRAIN.floorY + 2.7;
    this.speed = 0;
    this.maxSpeed = this.def.speed;
  }

  get alive() {
    return !this.dead;
  }

  get center() {
    return { x: this.pos.x, y: this.pos.y + this.height * 0.55, z: this.pos.z };
  }

  get head() {
    return { x: this.pos.x, y: this.pos.y + this.height - 0.2, z: this.pos.z };
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  getHitSpheres() {
    const c = this.center;
    return [
      { pos: { x: c.x, y: c.y, z: c.z }, radius: 0.46, target: this, multiplier: 1, headshot: false },
      {
        pos: { x: this.pos.x, y: this.pos.y + this.height - 0.18, z: this.pos.z },
        radius: 0.26,
        target: this,
        multiplier: 1.9,
        headshot: true,
      },
    ];
  }

  damage(amount, opts = {}) {
    if (this.dead) return 0;
    const applied = Math.min(this.health, amount);
    this.health -= applied;
    this.hitTimer = 0.22;
    this.alertLevel = 1;
    this.detection = 1;
    if (this.state === EnemyState.IDLE || this.state === EnemyState.PATROL) this.setState(EnemyState.ALERT);
    this.emit('hurt', { amount: applied, headshot: opts.headshot });
    if (opts.dir) {
      const k = (opts.knockback ?? 1) / this.mass;
      this.vel.x += opts.dir.x * k;
      this.vel.z += opts.dir.z * k;
    }
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.deadTimer = 0;
      this.setState(EnemyState.DEAD);
      this.emit('death', { source: opts.source, headshot: opts.headshot });
    }
    return applied;
  }

  setState(state, time = 0) {
    if (this.state === state) return;
    this.state = state;
    this.stateTime = 0;
    this.stateDuration = time;
    this.emit('state', { state });
  }

  /** Surface height the enemy belongs to (floor inside a car, roof on top). */
  _surfaceFor(x, z) {
    if (this.onRoof) return this.car ? this.car.roofSurfaceY : TRAIN.roofY;
    return this.car ? this.car.floorSurfaceY : TRAIN.floorY;
  }

  update(dt, ctx) {
    this.time += dt;
    this.stateTime += dt;
    this.shootTimer = Math.max(0, this.shootTimer - dt);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt);
    this.staggered = Math.max(0, this.staggered - dt);
    this.weapon.update(dt);

    if (this.dead) {
      this.deadTimer += dt;
      this.vel.x *= 0.86;
      this.vel.z *= 0.86;
      this.vel.y -= 26 * dt;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.pos.y += this.vel.y * dt;
      const floor = this._surfaceFor(this.pos.x, this.pos.z);
      if (this.pos.y <= floor) {
        this.pos.y = floor;
        this.vel.y = 0;
        this.vel.x *= 0.7;
        this.vel.z *= 0.7;
      }
      this._animate(dt);
      return;
    }

    const player = ctx.player;
    if (!player || !player.alive) {
      this._patrol(dt, ctx);
      this._animate(dt);
      return;
    }

    // --- perception ---------------------------------------------------------
    const dx = player.pos.x - this.pos.x;
    const dy = player.pos.y + 0.9 - (this.pos.y + this.height * 0.6);
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dy, dz);
    const toPlayer = { x: dx / (dist || 1), y: dy / (dist || 1), z: dz / (dist || 1) };
    const facingDot = Math.cos(this.yaw) * (toPlayer.x || 0.0001) - Math.sin(this.yaw) * (toPlayer.z || 0.0001);
    const inFov = Math.acos(clamp(facingDot, -1, 1)) < this.def.fov;
    const los = ctx.world.lineOfSight(this.pos.x, this.pos.y + this.height * 0.7, this.pos.z, player.pos.x, player.pos.y + 0.9, player.pos.z, null);
    const aware = dist < this.def.sightRange * (player.crouch ? 0.6 : 1) && (los && (inFov || dist < 8));

    this.alertLevel = ctx.alerts?.level ? Math.min(1, ctx.alerts.level / 100 + 0.25) : this.alertLevel;
    if (aware) {
      this.detection = Math.min(1, this.detection + dt * (player.crouch ? 1.1 : 2.4) * (dist < 12 ? 1.5 : 1));
      this.lostSight = 0;
      ctx.alerts?.addDetection?.(this, dt);
      if (this.detection >= 1) ctx.onDetect?.(this);
    } else {
      this.lostSight += dt;
      if (this.lostSight > 3.2) this.detection = Math.max(0, this.detection - dt * 0.5);
    }

    // --- state machine ------------------------------------------------------
    const seesPlayer = this.detection >= 1 && dist < this.def.sightRange * 1.3;
    switch (this.state) {
      case EnemyState.IDLE:
        this.aiming = false;
        if (seesPlayer) {
          this.setState(EnemyState.ALERT, this.def.reactionTime);
          this.aimTimer = this.def.reactionTime;
        } else if (this.stateTime > 1.5 + Math.random() * 1.5) {
          this.setState(EnemyState.PATROL);
        }
        break;
      case EnemyState.PATROL:
        this._patrol(dt, ctx);
        if (seesPlayer) {
          this.setState(EnemyState.ALERT, this.def.reactionTime);
          this.aimTimer = this.def.reactionTime;
        }
        break;
      case EnemyState.ALERT:
        this._faceTarget(dt, player, 8);
        this.aiming = true;
        if (this.stateTime >= (this.stateDuration || 0.5)) {
          this.setState(dist > this.def.preferredRange * 1.35 ? EnemyState.CHASE : EnemyState.ATTACK);
        }
        break;
      case EnemyState.CHASE:
        this._moveToward(dt, player.pos.x, player.pos.z, 1, ctx);
        this.aiming = true;
        if (dist <= this.def.preferredRange * 1.05 && los) this.setState(EnemyState.ATTACK);
        if (!seesPlayer && this.lostSight > 4) this.setState(EnemyState.PATROL);
        break;
      case EnemyState.ATTACK:
        this._combat(dt, ctx, dist, los, toPlayer);
        break;
      case EnemyState.TAKE_COVER:
        this._moveToward(dt, this.pos.x + this.coverOffset * 0, this.coverOffset, 0.9, ctx);
        this.crouch = true;
        this.aiming = false;
        if (this.stateTime > this.stateDuration) {
          this.crouch = false;
          this.setState(los && dist < this.def.sightRange ? EnemyState.ATTACK : EnemyState.CHASE);
        }
        break;
      case EnemyState.HURT:
        this.aiming = false;
        this._moveToward(dt, this.pos.x, this.pos.z, 0, ctx);
        if (this.stateTime > 0.35) this.setState(EnemyState.ATTACK);
        break;
      default:
        this.setState(EnemyState.IDLE);
        break;
    }

    // low health guards look for cover
    if (this.def.cover && this.health < this.maxHealth * 0.4 && this.state === EnemyState.ATTACK && Math.random() < dt * 0.5) {
      if (this.node?.cover?.length) {
        this.coverOffset = this.node.cover[0];
        this.setState(EnemyState.TAKE_COVER, 1.4 + Math.random());
      }
    }

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this._animate(dt);
  }

  _patrol(dt, ctx) {
    this.patrolTimer -= dt;
    if (this.patrolTimer <= 0) {
      this.patrolTimer = 2.4 + Math.random() * 3;
      const base = this.node?.x ?? this.pos.x;
      const range = this.node?.range ?? 3.5;
      this.patrolTarget.x = base + (Math.random() * 2 - 1) * range;
      this.patrolTarget.z = (this.node?.cover?.length ? this.node.cover[Math.floor(Math.random() * this.node.cover.length)] : 0) * (0.6 + Math.random() * 0.4);
    }
    this._moveToward(dt, this.patrolTarget.x, this.patrolTarget.z, 0.42, ctx);
    this.aiming = false;
  }

  _faceTarget(dt, target, rate = 10) {
    const dx = target.pos.x - this.pos.x;
    const dz = target.pos.z - this.pos.z;
    const targetYaw = Math.atan2(-dz, dx);
    this.yaw = dampAngle(this.yaw, targetYaw, rate, dt);
  }

  _moveToward(dt, targetX, targetZ, speedScale, ctx) {
    const def = this.def;
    let dx = targetX - this.pos.x;
    let dz = targetZ - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const stopDist = 0.55;
    const speed = def.speed * speedScale * (this.crouch ? 0.45 : 1);
    if (dist > stopDist) {
      this.vel.x = damp(this.vel.x, (dx / dist) * speed, 8, dt);
      this.vel.z = damp(this.vel.z, (dz / dist) * speed, 8, dt);
    } else {
      this.vel.x = damp(this.vel.x, 0, 12, dt);
      this.vel.z = damp(this.vel.z, 0, 12, dt);
    }
    // stay on the train
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this._clampToTrain();
    const surface = this._surfaceFor(this.pos.x, this.pos.z);
    this.pos.y = damp(this.pos.y, surface, 10, dt);
    this.onGround = true;
    if (this.vel.x !== 0 || this.vel.z !== 0) {
      const targetYaw = Math.atan2(-this.vel.z, this.vel.x);
      if (Math.hypot(this.vel.x, this.vel.z) > 0.4) this.yaw = dampAngle(this.yaw, targetYaw, 9, dt);
    }
  }

  _clampToTrain() {
    const car = this.manager?.train?.carAt(this.pos.x);
    if (car) this.car = car;
    this.pos.x = clamp(this.pos.x, this.car.x0 + 0.5, this.car.x1 - 0.5);
    if (this.onRoof) {
      this.pos.z = clamp(this.pos.z, -1.35, 1.35);
    } else if (this.car.hasRoof) {
      this.pos.z = clamp(this.pos.z, -1.25, 1.25);
    } else {
      this.pos.z = clamp(this.pos.z, -1.35, 1.35);
    }
  }

  _combat(dt, ctx, dist, los, toPlayer) {
    const player = ctx.player;
    this._faceTarget(dt, player, 9);
    this.aiming = true;

    // reposition if outside the sweet spot
    if (dist > this.def.preferredRange * 1.15) {
      this._moveToward(dt, player.pos.x, player.pos.z, 0.8, ctx);
    } else if (dist < this.def.minRange) {
      this._moveToward(dt, this.pos.x - (player.pos.x - this.pos.x), this.pos.z - (player.pos.z - this.pos.z), 0.7, ctx);
    } else {
      this._strafe(dt, ctx, toPlayer);
    }

    if (!los) {
      this.setState(EnemyState.CHASE);
      return;
    }
    if (this.weapon.canFire && (ctx.claimShot ? ctx.claimShot(this) : true)) {
      this._shoot(dt, ctx, player, dist);
    } else if (this.weapon.empty && !this.weapon.reloading) {
      this.weapon.startReload();
      this.emit('reload', {});
    }
  }

  _strafe(dt, ctx, toPlayer) {
    // small sideways shuffle so guards do not stand perfectly still
    this.strafeTimer = (this.strafeTimer ?? 0) - dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = 1.2 + Math.random() * 1.6;
      this.strafeSign = Math.random() < 0.5 ? -1 : 1;
    }
    const side = this.strafeSign ?? 1;
    const perpX = -toPlayer.z;
    const perpZ = toPlayer.x;
    this.vel.x = damp(this.vel.x, perpX * side * this.def.speed * 0.4, 6, dt);
    this.vel.z = damp(this.vel.z, perpZ * side * this.def.speed * 0.4, 6, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this._clampToTrain();
  }

  _shoot(dt, ctx, player, dist) {
    const def = this.def;
    const originY = this.pos.y + (this.height > 1.95 ? 1.5 : 1.35);
    const origin = { x: this.pos.x, y: originY, z: this.pos.z };
    // lead the target slightly
    const targetX = player.pos.x + player.vel.x * 0.08;
    const targetY = player.pos.y + 1.0 + player.vel.y * 0.05;
    const targetZ = player.pos.z + player.vel.z * 0.08;
    let dx = targetX - origin.x;
    let dy = targetY - origin.y;
    let dz = targetZ - origin.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;

    // Accuracy falls off with range and while the shooter is moving, so long
    // range firefights are survivable while close quarters stays lethal.
    const rangeFactor = 0.75 + Math.min(2.4, dist / 9);
    const moveFactor = 1 + Math.min(0.6, (this.speed ?? 0) / 12);
    const spread = (def.accuracy ? (1 - def.accuracy) * 0.16 + 0.01 : 0.03) * rangeFactor * moveFactor;
    const pellets = this.weapon.def.pellets ?? 1;
    this.weapon.consume();
    this.shootTimer = 0.14;
    this.muzzleFlash = 0.06;
    this.aimPitch = Math.asin(clamp(dy, -1, 1)) * 0.8;

    const targets = player.getHitSpheres ? player.getHitSpheres() : [];
    for (let i = 0; i < pellets; i++) {
      const sx = dx + (Math.random() - 0.5) * spread;
      const sy = dy + (Math.random() - 0.5) * spread;
      const sz = dz + (Math.random() - 0.5) * spread;
      const sl = Math.hypot(sx, sy, sz) || 1;
      const dir = { x: sx / sl, y: sy / sl, z: sz / sl };
      const shotOrigin = ctx.world.clearRayOrigin
        ? ctx.world.clearRayOrigin({ ...origin }, dir, 1.4, this)
        : origin;
      const hit = ctx.world.raycast(shotOrigin, dir, this.weapon.def.range, targets, (box) => box.owner === this);
      const end = hit.hit && hit.point ? hit.point : { x: origin.x + dir.x * this.weapon.def.range, y: origin.y + dir.y * this.weapon.def.range, z: origin.z + dir.z * this.weapon.def.range };
      ctx.effects?.tracer(origin.x, origin.y, origin.z, end.x, end.y, end.z, this.weapon.def.tracer);
      ctx.effects?.sim.muzzleFlash(origin.x, origin.y, origin.z, dir.x, dir.z);
      if (hit.hit && hit.target === player) {
        ctx.damage.applyDamage(player, this.weapon.def.damage, {
          source: this,
          dir,
          knockback: this.weapon.def.knockback,
          point: end,
        });
      } else if (hit.hit && hit.point) {
        ctx.effects?.bulletImpact(hit.point, { x: -dir.x, y: -dir.y, z: -dir.z });
      }
    }
    ctx.effects?.flashLight(origin.x, origin.y, origin.z, 5, 10, 0xffc98a, 0.08);
    ctx.audio?.play('enemyGunshot', { position: origin, variant: this.weapon.def.sound });
    this.emit('shoot', { origin });
  }

  _animate(dt) {
    animateCharacter(
      this.pose,
      {
        speed: this.speed,
        maxSpeed: this.maxSpeed,
        onGround: this.onGround,
        vy: this.vel.y,
        yaw: this.yaw,
        state: this.state === EnemyState.TAKE_COVER ? 'crouch' : this.state,
        stateTime: this.stateTime,
        climbing: false,
        crouch: this.crouch,
        aiming: this.aiming && !this.dead,
        aimPitch: this.aimPitch,
        shootTimer: this.shootTimer,
        reloadTimer: this.weapon.reloadTimer,
        reloadTotal: this.weapon.reloadTotal,
        hitTimer: this.hitTimer,
        hurtDir: 1,
        dead: this.dead,
        deadTimer: this.deadTimer,
        headPitch: this.headPitch,
        headYaw: 0,
      },
      this.anim,
      dt,
      this.time
    );
    this.pose.yaw = this.yaw;
  }
}

export default Enemy;
