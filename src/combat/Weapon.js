// -----------------------------------------------------------------------------
// Weapon definitions + state machine (ammo, fire rate, reload, spread).
// Raycast shots: the owner performs the actual trace using the weapon's stats.
// -----------------------------------------------------------------------------

export const WEAPONS = {
  revolver: {
    id: 'revolver',
    name: 'PEACEMAKER',
    damage: 34,
    headshotMultiplier: 2.0,
    fireRate: 0.30,
    reloadTime: 1.65,
    magSize: 6,
    reserve: 60,
    maxReserve: 90,
    range: 120,
    spread: 0.006,
    pellets: 1,
    recoil: 1.0,
    knockback: 3.2,
    shake: 0.22,
    sound: 'revolver',
    tracer: 0xffd27a,
  },
  guardRevolver: {
    id: 'guardRevolver',
    name: 'SERVICE REVOLVER',
    damage: 6,
    fireRate: 1.7,
    reloadTime: 2.2,
    magSize: 6,
    reserve: 999,
    range: 46,
    spread: 0.035,
    pellets: 1,
    knockback: 0.6,
    shake: 0.05,
    sound: 'revolver',
    tracer: 0xffb060,
    burst: 1,
  },
  shotgun: {
    id: 'shotgun',
    name: 'SCATTERGUN',
    damage: 8,
    fireRate: 1.5,
    reloadTime: 2.6,
    magSize: 4,
    reserve: 999,
    range: 18,
    spread: 0.11,
    pellets: 6,
    knockback: 2.2,
    shake: 0.16,
    sound: 'shotgun',
    tracer: 0xffc070,
  },
  rifle: {
    id: 'rifle',
    name: 'LEVER RIFLE',
    damage: 14,
    fireRate: 0.95,
    reloadTime: 2.4,
    magSize: 8,
    reserve: 999,
    range: 70,
    spread: 0.018,
    pellets: 1,
    knockback: 1.0,
    shake: 0.1,
    sound: 'rifle',
    tracer: 0xffe0a0,
  },
  heavy: {
    id: 'heavy',
    name: 'GATLING',
    damage: 7,
    fireRate: 0.16,
    reloadTime: 3.4,
    magSize: 26,
    reserve: 999,
    range: 40,
    spread: 0.05,
    pellets: 1,
    knockback: 0.4,
    shake: 0.08,
    sound: 'heavy',
    tracer: 0xffd090,
    burst: 5,
  },
  bossCannon: {
    id: 'bossCannon',
    name: 'ARMOURED REPEATER',
    damage: 11,
    fireRate: 0.11,
    reloadTime: 3.0,
    magSize: 30,
    reserve: 999,
    range: 60,
    spread: 0.045,
    pellets: 1,
    knockback: 0.5,
    shake: 0.1,
    sound: 'heavy',
    tracer: 0xffb040,
    burst: 6,
    burstDelay: 0.11,
  },
};

export class Weapon {
  constructor(def = WEAPONS.revolver, owner = null) {
    this.def = def;
    this.owner = owner;
    this.ammo = def.magSize;
    this.reserve = def.reserve;
    this.fireTimer = 0;
    this.reloadTimer = 0;
    this.reloadTotal = def.reloadTime;
    this.reloading = false;
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.shotsFired = 0;
  }

  get ready() {
    return !this.reloading && this.fireTimer <= 0;
  }

  get canFire() {
    return this.ready && this.ammo > 0;
  }

  get empty() {
    return this.ammo <= 0;
  }

  update(dt) {
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this._finishReload();
    }
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
    }
  }

  /** Consumes a round; returns the spread to apply or null when it cannot fire. */
  consume() {
    if (!this.canFire) return null;
    this.ammo--;
    this.shotsFired++;
    this.fireTimer = this.def.fireRate;
    return this.def.spread;
  }

  startReload() {
    if (this.reloading || this.ammo >= this.def.magSize || this.reserve <= 0) return false;
    this.reloading = true;
    this.reloadTimer = this.reloadTotal;
    return true;
  }

  _finishReload() {
    const need = this.def.magSize - this.ammo;
    const take = Math.min(need, this.reserve);
    this.ammo += take;
    this.reserve -= take;
    this.reloading = false;
    this.reloadTimer = 0;
  }

  addReserve(amount) {
    this.reserve = Math.min(this.def.maxReserve ?? 999, this.reserve + amount);
  }

  reset() {
    this.ammo = this.def.magSize;
    this.reserve = this.def.reserve;
    this.reloading = false;
    this.reloadTimer = 0;
    this.fireTimer = 0;
  }
}

export default Weapon;
