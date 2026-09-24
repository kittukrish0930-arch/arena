// -----------------------------------------------------------------------------
// DamageSystem - damage application, explosions and combat statistics.
//
// Entities just expose `damage(amount, opts)` and `getHitSpheres()`, so the same
// helpers work for the player, guards, the boss and destructible props.
// -----------------------------------------------------------------------------
import { SCORE } from '../game/Config.js';

export class DamageSystem {
  constructor({ effects = null, camera = null, alerts = null, audio = null } = {}) {
    this.effects = effects;
    this.camera = camera;
    this.alerts = alerts;
    this.audio = audio;

    this.stats = {
      shotsFired: 0,
      shotsHit: 0,
      kills: 0,
      killsByType: {},
      damageTaken: 0,
      damageDealt: 0,
      headshots: 0,
      distance: 0,
      stealthKills: 0,
      explosions: 0,
    };
    this.recentDamageTimer = 0;
    this.onDamage = null;
    this.onKill = null;
    this.onHitFeedback = null; // (kind, amount, opts)
  }

  recordShot(hit, { headshot = false, killed = false } = {}) {
    this.stats.shotsFired++;
    if (hit) this.stats.shotsHit++;
    if (headshot) this.stats.headshots++;
    if (killed) this.stats.kills++;
  }

  recordDamageTaken(amount) {
    this.stats.damageTaken += amount;
    this.recentDamageTimer = 0.6;
  }

  recordDistance(d) {
    this.stats.distance += d;
  }

  get accuracy() {
    if (this.stats.shotsFired === 0) return 0;
    return this.stats.shotsHit / this.stats.shotsFired;
  }

  /** Applies damage to a target entity with feedback. */
  applyDamage(target, amount, opts = {}) {
    if (!target || typeof target.damage !== 'function') return 0;
    if (target.dead) return 0;
    const applied = target.damage(amount, opts);
    if (applied <= 0) return 0;
    this.stats.damageDealt += applied;
    const isPlayer = target.type === 'player';
    this.onHitFeedback?.(isPlayer ? 'player-hit' : 'enemy-hit', applied, opts);
    if (isPlayer) {
      this.camera?.addShake(0.5);
      this.effects?.sim.bloodHit(opts.point?.x ?? target.pos.x, opts.point?.y ?? target.center.y, opts.point?.z ?? target.pos.z);
    }
    if (target.dead) this.onKill?.(target, opts);
    return applied;
  }

  /** Explosion: radial damage + knockback + effects + shake. */
  explode(x, y, z, { radius = 5.5, damage = 60, source = null, scale = 1, targets = [] } = {}) {
    this.stats.explosions++;
    this.effects?.explosion(x, y, z, scale);
    this.camera?.addShake(0.85 * scale);
    this.audio?.play('explosion', { position: { x, y, z } });
    this.onDamage?.(x, y, z, damage, radius);
    for (const t of targets) {
      if (!t || t.dead || t === source) continue;
      const c = t.center || { x: t.pos.x, y: t.pos.y + 0.9, z: t.pos.z };
      const dx = c.x - x;
      const dy = c.y - y;
      const dz = c.z - z;
      const d = Math.hypot(dx, dy, dz);
      if (d > radius) continue;
      const falloff = 1 - d / radius;
      const applied = this.applyDamage(t, damage * falloff, {
        source,
        dir: { x: dx / (d || 1), z: dz / (d || 1) },
        knockback: 7 * falloff,
        point: c,
      });
      if (applied > 0 && t.vel) {
        const k = (9 * falloff) / Math.max(1, t.mass ?? 1);
        t.vel.x += (dx / (d || 1)) * k;
        t.vel.y += (dy / (d || 1)) * k + k * 0.35;
        t.vel.z += (dz / (d || 1)) * k;
        t.staggered = Math.max(t.staggered ?? 0, 0.5);
      }
    }
    return true;
  }

  /** Final score breakdown. */
  computeScore({ loot = 0, timeTaken = 0, alerted = false, healthPercent = 1 } = {}) {
    const s = this.stats;
    const byType = s.killsByType;
    const killScore =
      (byType.basic ?? 0) * SCORE.kill.basic +
      (byType.shotgun ?? 0) * SCORE.kill.shotgun +
      (byType.rifle ?? 0) * SCORE.kill.rifle +
      (byType.heavy ?? 0) * SCORE.kill.heavy +
      (byType.elite ?? 0) * SCORE.kill.elite +
      (byType.boss ?? 0) * SCORE.kill.boss;
    const accuracyBonus = Math.round(this.accuracy * SCORE.accuracyBonus * 8);
    const timePenalty = Math.round(timeTaken * SCORE.timeBonusPerSecond);
    const damagePenalty = Math.round(s.damageTaken * SCORE.damagePenalty);
    const stealth = s.stealthKills * 120;
    const total = Math.max(
      0,
      Math.round(loot + killScore + accuracyBonus - damagePenalty - timePenalty * 0.35 + stealth)
    );
    return {
      loot,
      kills: s.kills,
      accuracy: this.accuracy,
      headshots: s.headshots,
      damageTaken: Math.round(s.damageTaken),
      explosions: s.explosions,
      stealthKills: s.stealthKills,
      timeTaken,
      killScore,
      accuracyBonus,
      damagePenalty,
      timePenalty: Math.round(timePenalty * 0.35),
      stealth,
      total,
    };
  }

  reset() {
    this.stats = {
      shotsFired: 0,
      shotsHit: 0,
      kills: 0,
      killsByType: {},
      damageTaken: 0,
      damageDealt: 0,
      headshots: 0,
      distance: 0,
      stealthKills: 0,
      explosions: 0,
    };
  }
}

export default DamageSystem;
