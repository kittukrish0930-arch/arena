// -----------------------------------------------------------------------------
// BossFight - phases, taunts and the cinematic beats of the elite guard fight.
//
// The boss itself is a regular Enemy with the `boss` definition: this class
// layers the multi-phase behaviour (reinforcements, berserk charges, final
// stand) and the cinematic camera work on top of the normal AI.
// -----------------------------------------------------------------------------

export const BossPhases = {
  INTRO: 'intro',
  PHASE1: 'phase1',
  PHASE2: 'phase2',
  PHASE3: 'phase3',
  PHASE4: 'phase4',
  DEAD: 'dead',
};

export class BossFight {
  constructor({ enemyManager, train, camera, effects, audio, damage, alerts = null, spawnReinforcements = null } = {}) {
    this.manager = enemyManager;
    this.train = train;
    this.camera = camera;
    this.effects = effects;
    this.audio = audio;
    this.damage = damage;
    this.alerts = alerts;
    this.spawnReinforcements = spawnReinforcements;

    this.boss = null;
    this.phase = BossPhases.INTRO;
    this.phaseTime = 0;
    this.active = false;
    this.introTimer = 0;
    this.taunts = [];
    this.chargeTimer = 0;
    this.charging = false;
    this.slamTimer = 0;
    this.burstTimer = 0;
    this.burstLeft = 0;
    this.onPhase = null;
    this.onDefeated = null;
    this.onTaunt = null;
    this.slowmo = 0;
    this.deathTimer = 0;
  }

  start(boss, ctx = {}) {
    this.boss = boss;
    this.active = true;
    this.phase = BossPhases.INTRO;
    this.phaseTime = 0;
    this.introTimer = 3.0;
    const p = ctx.player;
    // reveal shot: the boss turns to face the player
    if (this.camera && p) {
      const bx = boss.pos.x;
      const bz = boss.pos.z;
      this.camera.playShot(
        {
          pos: { x: bx + 4.5, y: boss.pos.y + 3.4, z: bz + 5.5 },
          look: { x: bx - 0.6, y: boss.pos.y + 1.5, z: bz },
          fov: 34,
        },
        2.6,
        { blend: 0.5 }
      );
      this.camera.setZoom(1.06, 1.05);
    }
    this.audio?.play('alarm', { bus: 'ui' });
    this.taunt('ELITE GUARD — "YOU PICKED THE WRONG TRAIN, OUTLAW."');
    this.boss.emit('bossIntro');
  }

  taunt(text) {
    this.taunts.push({ text, t: 0 });
    if (this.taunts.length > 3) this.taunts.shift();
    this.onTaunt?.(text);
  }

  get healthPercent() {
    if (!this.boss) return 0;
    return Math.max(0, this.boss.health / this.boss.maxHealth);
  }

  update(dt, ctx) {
    for (let i = this.taunts.length - 1; i >= 0; i--) {
      this.taunts[i].t += dt;
      if (this.taunts[i].t > 4) this.taunts.splice(i, 1);
    }
    if (this.slowmo > 0) this.slowmo = Math.max(0, this.slowmo - dt);
    if (this.boss && this.boss.dead) {
      this._updateDeath(dt);
      return;
    }
    if (!this.active || !this.boss) return;
    this.phaseTime += dt;

    if (this.phase === BossPhases.INTRO) {
      this.introTimer -= dt;
      if (this.boss) {
        // face the player during the reveal
        const p = ctx.player;
        if (p) {
          const targetYaw = Math.atan2(-(p.pos.z - this.boss.pos.z), p.pos.x - this.boss.pos.x);
          this.boss.yaw += (targetYaw - this.boss.yaw) * Math.min(1, dt * 6);
        }
      }
      if (this.introTimer <= 0) this._enterPhase(BossPhases.PHASE1);
      return;
    }

    const hp = this.healthPercent;
    if (this.phase === BossPhases.PHASE1 && hp <= 0.66) this._enterPhase(BossPhases.PHASE2);
    else if (this.phase === BossPhases.PHASE2 && hp <= 0.33) this._enterPhase(BossPhases.PHASE3);
    else if (this.phase === BossPhases.PHASE3 && hp <= 0.15) this._enterPhase(BossPhases.PHASE4);

    // --- berserk behaviours --------------------------------------------------
    const boss = this.boss;
    if (this.phase === BossPhases.PHASE3 || this.phase === BossPhases.PHASE4) {
      const speed = this.phase === BossPhases.PHASE4 ? 1.75 : 1.35;
      boss.def.speed = (boss.def.speed ?? 3.2) > 4.6 ? boss.def.speed : 3.2 * speed;
      this.chargeTimer -= dt;
      if (this.chargeTimer <= 0 && !this.charging) {
        this.chargeTimer = 5 + Math.random() * 4;
        this.charging = true;
        this.chargeDuration = 0.9;
        this.audio?.play('alarm', { bus: 'ui' });
      }
    }
    if (this.charging) {
      this.chargeDuration -= dt;
      const p = ctx.player;
      if (p) {
        const dx = p.pos.x - boss.pos.x;
        const dz = p.pos.z - boss.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        boss.vel.x = (dx / d) * 9;
        boss.vel.z = (dz / d) * 9;
        boss.pos.x += boss.vel.x * dt;
        boss.pos.z += boss.vel.z * dt;
        boss.pos.z = Math.max(-1.2, Math.min(1.2, boss.pos.z));
        if (Math.hypot(p.pos.x - boss.pos.x, p.pos.z - boss.pos.z) < 1.5 && !p.dead) {
          this.damage?.applyDamage(p, 16, { dir: { x: dx / d, z: dz / d }, knockback: 7 });
          this.camera?.addShake(0.6);
          this.charging = false;
          this.effects?.explosion(boss.pos.x, boss.pos.y + 0.6, boss.pos.z, 0.5);
        }
      }
      if (this.chargeDuration <= 0) this.charging = false;
    }
  }

  /** The defeat sequence: slow motion, camera push in, and the roll-over. */
  _updateDeath(dt) {
    this.deathTimer += dt;
    if (this.phase === BossPhases.DEAD) return;
    this.phase = BossPhases.DEAD;
    this.active = false;
    this.slowmo = 1.6;
    this.onPhase?.(this.phase);
    this.camera?.playShot(
      {
        pos: { x: this.boss.pos.x + 3.2, y: this.boss.pos.y + 2.6, z: this.boss.pos.z + 4.4 },
        look: { x: this.boss.pos.x, y: this.boss.pos.y + 1.0, z: this.boss.pos.z },
        fov: 40,
      },
      2.2,
      { blend: 0.4 }
    );
    this.audio?.play('explosion');
    this.effects?.explosion(this.boss.pos.x, this.boss.pos.y + 0.8, this.boss.pos.z, 1.1);
    this.onDefeated?.(this.boss);
  }

  _enterPhase(phase) {
    this.phase = phase;
    this.phaseTime = 0;
    this.onPhase?.(phase);
    const boss = this.boss;
    switch (phase) {
      case BossPhases.PHASE1:
        this.taunt('ELITE GUARD: "OPEN FIRE!"');
        this.audio?.play('alarm', { bus: 'ui' });
        break;
      case BossPhases.PHASE2:
        this.taunt('ELITE GUARD: "ALL UNITS — FORWARD!"');
        this.spawnReinforcements?.(2);
        this.alerts?.addFlat(35);
        this.camera?.addShake(0.4);
        this.audio?.play('alarm', { bus: 'ui' });
        break;
      case BossPhases.PHASE3: {
        this.taunt('ELITE GUARD: "ENOUGH OF YOU!"');
        this.charging = true;
        this.chargeTimer = 4;
        this.chargeDuration = 0.9;
        boss.weapon.def.fireRate = Math.max(0.07, boss.weapon.def.fireRate * 0.7);
        this.camera?.addShake(0.5);
        break;
      }
      case BossPhases.PHASE4: {
        this.taunt('ELITE GUARD: "THIS ENDS HERE!"');
        this.slowmo = 1.2;
        this.camera?.playShot(
          {
            pos: { x: boss.pos.x + 4.4, y: boss.pos.y + 2.4, z: boss.pos.z + 5.2 },
            look: { x: boss.pos.x - 0.4, y: boss.pos.y + 1.4, z: boss.pos.z },
            fov: 36,
          },
          1.6,
          { blend: 0.35 }
        );
        break;
      }
      default:
        break;
    }
  }

  reset() {
    this.boss = null;
    this.active = false;
    this.phase = BossPhases.INTRO;
    this.phaseTime = 0;
    this.charging = false;
    this.chargeTimer = 0;
    this.deathTimer = 0;
    this.taunts.length = 0;
    this.slowmo = 0;
  }
}

export default BossFight;
