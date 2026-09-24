// -----------------------------------------------------------------------------
// Destructibles - explosive barrels and the chain reactions they cause.
//
// Barrels are collision boxes tagged 'explosiveBarrel'; shooting one detonates
// it, damaging everyone nearby (including the player) and hiding its mesh.
// -----------------------------------------------------------------------------
export class Destructibles {
  constructor({ world, train, effects = null, damage = null, camera = null, audio = null, onExplode = null } = {}) {
    this.world = world;
    this.train = train;
    this.effects = effects;
    this.damage = damage;
    this.camera = camera;
    this.audio = audio;
    this.onExplode = onExplode;
    this.barrels = [];
    this.crates = [];
    this.pendingExplosions = [];
  }

  registerBarrel(entry) {
    this.barrels.push({ ...entry, exploded: false });
    return entry;
  }

  reset() {
    this.barrels.length = 0;
    this.pendingExplosions.length = 0;
  }

  /** Re-arms every barrel of the (new) train instance. */
  registerTrain(train) {
    this.train = train;
    this.barrels.length = 0;
    this.pendingExplosions.length = 0;
    for (const car of train.cars) {
      for (const entry of car.explosiveBarrels) this.registerBarrel(entry);
    }
    return this.barrels.length;
  }

  /** Detonates a barrel collision box (called when it is shot). */
  explodeBarrel(box, { delay = 0, source = null, targets = [] } = {}) {
    const entry = this.barrels.find((b) => b.box === box);
    if (entry && entry.exploded) return false;
    if (entry) entry.exploded = true;
    if (delay > 0) {
      this.pendingExplosions.push({ box, t: delay, source, targets });
      return true;
    }
    this._detonate(box, source, targets);
    return true;
  }

  _detonate(box, source, targets) {
    const data = box?.data || {};
    const x = data.x ?? (box.minX + box.maxX) / 2;
    const y = data.y ?? (box.minY + box.maxY) / 2;
    const z = data.z ?? (box.minZ + box.maxZ) / 2;
    data.alive = false;
    if (data.view) data.view.visible = false;
    box.solid = false;
    box.surface = false;
    this.world.remove(box);
    this.effects?.explosion(x, y + 0.2, z, 1.15);
    this.camera?.addShake(0.75);
    this.audio?.play('explosion');
    if (this.damage) {
      this.damage.explode(x, y, z, {
        radius: 6.2,
        damage: 72,
        source,
        scale: 1.1,
        targets: targets && targets.length ? targets : this._gatherTargets(),
      });
    }
    // chain reaction
    for (const other of this.barrels) {
      if (other.exploded || other.box === box || !other.box.solid) continue;
      const d = Math.hypot(other.x - x, other.y - y, other.z - z);
      if (d < 5.5) this.explodeBarrel(other.box, { delay: 0.16 + Math.random() * 0.12, source, targets });
    }
    this.onExplode?.({ x, y, z });
  }

  _gatherTargets() {
    // the DamageSystem receives targets from the caller; without a list we rely
    // on the explosion callback the game wires up.
    return this.targetsProvider ? this.targetsProvider() : [];
  }

  /** Called by the player's weapon when a bullet hits a barrel. */
  hit(box, point, opts = {}) {
    return this.explodeBarrel(box, opts);
  }

  update(dt) {
    for (let i = this.pendingExplosions.length - 1; i >= 0; i--) {
      const p = this.pendingExplosions[i];
      p.t -= dt;
      if (p.t <= 0) {
        this._detonate(p.box, p.source, p.targets);
        this.pendingExplosions.splice(i, 1);
      }
    }
  }
}

export default Destructibles;
