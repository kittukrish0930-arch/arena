// -----------------------------------------------------------------------------
// PlayerCombat - firing, reloading and hit resolution for the player.
// Hitscan raycasts against the world and enemy hit spheres, with tracer,
// muzzle flash, impact effects and camera shake.
// -----------------------------------------------------------------------------
import { COMBAT, TRAIN } from '../game/Config.js';
import { Weapon, WEAPONS } from '../combat/Weapon.js';

export class PlayerCombat {
  constructor(player, ctx = {}) {
    this.player = player;
    this.ctx = ctx; // { world, effects, camera, damage, alerts, audio, projectile, getTargets }
    this.weapon = new Weapon(WEAPONS.revolver, player);
    player.weapon = this.weapon;
    this.hitmarker = 0;
    this.lastHit = null;
    this._origin = { x: 0, y: 0, z: 0 };
    this._dir = { x: 0, y: 0, z: 0 };
  }

  get ammo() {
    return this.weapon.ammo;
  }

  get reserve() {
    return this.weapon.reserve;
  }

  reload() {
    if (this.weapon.startReload()) {
      this.ctx.audio?.play('reload');
      this.player.emit('reload', { duration: this.weapon.reloadTotal });
      return true;
    }
    return false;
  }

  update(dt, intent) {
    this.weapon.update(dt);
    this.hitmarker = Math.max(0, this.hitmarker - dt);
    this.player.weapon.reloadTimer = this.weapon.reloadTimer;
    this.player.weapon.reloadTotal = this.weapon.reloadTotal;
    this.player.weapon.ammo = this.weapon.ammo;
    this.player.weapon.reserve = this.weapon.reserve;

    if (!this.player.alive) return;

    if (intent.reload && this.weapon.ammo < this.weapon.def.magSize) this.reload();

    if (intent.fire) {
      if (this.weapon.empty && !this.weapon.reloading) this.reload();
      else this.fire();
    }
  }

  /**
   * Where the bullets leave the gun. The offset follows the *aim* direction (not
   * the body yaw) so the shot never starts behind the geometry the player is
   * standing in.
   */
  muzzlePosition(out = this._origin) {
    const p = this.player;
    let fx = p.aimDir?.x ?? Math.cos(p.yaw);
    let fz = p.aimDir?.z ?? -Math.sin(p.yaw);
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl;
    fz /= fl;
    // right = forward x up
    const rx = -fz;
    const rz = fx;
    const shoulder = p.crouch ? 1.02 : 1.22;
    out.x = p.pos.x + fx * 0.72 + rx * 0.22;
    out.y = p.pos.y + shoulder;
    out.z = p.pos.z + fz * 0.72 + rz * 0.22;
    return out;
  }

  fire() {
    const weapon = this.weapon;
    const spread = weapon.consume();
    if (spread === null) return false;
    const p = this.player;
    const origin = this.muzzlePosition();
    const dir = this._dir;
    const s = spread * (p.onGround ? 1 : 1.8);
    dir.x = p.aimDir.x + (Math.random() - 0.5) * s * 2;
    dir.y = p.aimDir.y + (Math.random() - 0.5) * s * 2;
    dir.z = p.aimDir.z + (Math.random() - 0.5) * s * 2;
    const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= dl;
    dir.y /= dl;
    dir.z /= dl;

    const range = weapon.def.range;
    const targets = this.ctx.getHitSpheres?.() || [];
    this.ctx.world.clearRayOrigin(origin, dir, 1.8, p);
    const hit = this.ctx.world.raycast(origin, dir, range, targets, (box) => box.owner === p);

    let endX = origin.x + dir.x * range;
    let endY = origin.y + dir.y * range;
    let endZ = origin.z + dir.z * range;
    let killed = false;
    let headshot = false;

    if (hit.hit && hit.point) {
      endX = hit.point.x;
      endY = hit.point.y;
      endZ = hit.point.z;
      headshot = !!hit.headshot;
      const target = hit.target;
      if (target && typeof target.damage === 'function' && target !== p) {
        const dmg = weapon.def.damage * (hit.multiplier ?? 1);
        const applied = this.ctx.damage.applyDamage(target, dmg, {
          source: p,
          headshot,
          point: hit.point,
          dir,
          knockback: weapon.def.knockback,
        });
        if (applied > 0) {
          this.hitmarker = COMBAT.hitmarkerTime;
          this.ctx.effects?.sim.bloodHit(hit.point.x, hit.point.y, hit.point.z, dir.x, dir.z);
          this.ctx.onHit?.(target, applied, headshot, hit.point);
          killed = !!target.dead;
        }
      } else if (hit.box) {
        // destructible props
        const data = hit.box.data;
        if (data && data.explosive && data.alive) {
          this.ctx.onExplosiveHit?.(hit.box, hit.point);
        } else {
          this.ctx.effects?.bulletImpact(hit.point, { x: -dir.x, y: -dir.y, z: -dir.z }, hit.box.tag === 'glass' ? 'glass' : 'metal');
        }
      }
    }

    // --- presentation --------------------------------------------------------
    const efx = this.ctx.effects;
    if (efx) {
      efx.tracer(origin.x, origin.y, origin.z, endX, endY, endZ, weapon.def.tracer);
      efx.sim.muzzleFlash(origin.x, origin.y, origin.z, dir.x, dir.z);
      efx.flashLight(origin.x, origin.y, origin.z, 9, 12, 0xffcf8a, 0.09);
    }
    this.ctx.camera?.addShake(weapon.def.shake);
    this.ctx.audio?.play('gunshot', { variant: weapon.def.sound });
    this.ctx.projectile?.spawn({
      x: origin.x,
      y: origin.y,
      z: origin.z,
      dir,
      distance: range,
      damage: weapon.def.damage,
      owner: this.player,
      team: 0,
      color: weapon.def.tracer,
    });

    p.shootTimer = 0.14;
    p.muzzleFlash = 0.06;
    this.ctx.damage.recordShot(hit.hit && hit.target && typeof hit.target.damage === 'function', { headshot, killed });
    this.ctx.alerts?.addGunshot();
    p.emit('shoot', { origin, dir, hit: hit.hit });
    return true;
  }
}

export const PLAYER_WEAPON = WEAPONS.revolver;

export default PlayerCombat;
