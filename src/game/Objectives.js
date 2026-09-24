// -----------------------------------------------------------------------------
// Objectives - the dynamic mission checklist shown in the HUD.
//
// Objectives complete either by reaching an x position on the train, or by an
// explicit call (kill counts, loot, boss, vault...).
// -----------------------------------------------------------------------------

export class Objective {
  constructor({ id, text, hint = '', target = null, x = null, optional = false }) {
    this.id = id;
    this.text = text;
    this.hint = hint;
    this.target = target; // numeric progress goal
    this.progress = 0;
    this.x = x; // world x that completes this objective
    this.done = false;
    this.optional = optional;
    this.completedAt = 0;
  }

  get label() {
    return this.text;
  }

  get display() {
    if (this.target && !this.done) return `${this.text}  (${Math.min(this.progress, this.target)}/${this.target})`;
    return this.text;
  }
}

export class ObjectiveSystem {
  constructor({ train = null, onComplete = null, onChange = null } = {}) {
    this.train = train;
    this.objectives = [];
    this.onComplete = onComplete;
    this.onChange = onChange;
    this.index = 0;
    this.allDone = false;
  }

  build(train, { bonus = false } = {}) {
    const car = (type, n = 0) => {
      const found = train.cars.filter((c) => c.type === type);
      return found[Math.min(n, found.length - 1)];
    };
    const boxCar = train.boxCar || car('cargo', 0);
    const passenger = train.passengerCar || car('passenger', 0);
    const flat = train.flatCar || car('flatcar', 0);
    const armored = train.armoredCar || car('armored', 0);
    const vault = train.vaultCar || car('vault', 0);
    const loco = train.locomotive || car('loco', 0);

    this.objectives = [
      new Objective({ id: 'board', text: 'BOARD THE TRAIN', x: boxCar.x0 + 1 }),
      new Objective({ id: 'cargo', text: 'REACH THE FIRST CARGO CAR', x: boxCar.x0 + boxCar.length * 0.5 }),
      new Objective({ id: 'guards', text: 'DEFEAT THE GUARDS', target: 6 }),
      new Objective({ id: 'loot', text: 'STEAL THE VALUABLES', target: 3 }),
      new Objective({ id: 'roof', text: 'CROSS THE ROOFTOP', x: flat.x1 - 1 }),
      new Objective({ id: 'armored', text: 'REACH THE ARMORED CAR', x: armored.x0 + armored.length * 0.4 }),
      new Objective({ id: 'boss', text: 'DEFEAT THE ELITE GUARD' }),
      new Objective({ id: 'vault', text: 'OPEN THE VAULT' }),
      new Objective({ id: 'escape', text: 'ESCAPE THE TRAIN', x: loco.x0 + 3 }),
    ];
    if (bonus) {
      this.objectives.push(new Objective({ id: 'stealth', text: 'GHOST: NO ALERTS', optional: true }));
    }
    this.index = 0;
    this.allDone = false;
    return this.objectives;
  }

  get current() {
    for (const o of this.objectives) if (!o.done) return o;
    return null;
  }

  get currentText() {
    const o = this.current;
    return o ? o.display : 'MISSION COMPLETE';
  }

  /** Marks an objective complete by id. */
  complete(id, { silent = false } = {}) {
    const o = this.objectives.find((x) => x.id === id);
    if (!o || o.done) return false;
    o.done = true;
    if (!silent) this.onComplete?.(o);
    this.onChange?.(o, this);
    if (this.objectives.every((x) => x.done || x.optional)) this.allDone = true;
    return true;
  }

  setProgress(id, value) {
    const o = this.objectives.find((x) => x.id === id);
    if (!o || o.done) return;
    o.progress = value;
    this.onChange?.(o, this);
    if (o.target && o.progress >= o.target) this.complete(id);
  }

  addProgress(id, amount = 1) {
    const o = this.objectives.find((x) => x.id === id);
    if (!o || o.done) return;
    this.setProgress(id, o.progress + amount);
  }

  /** Position driven objectives. */
  update(player, train) {
    const x = player.maxProgressX;
    for (const o of this.objectives) {
      if (o.done || o.x === null) continue;
      if (x >= o.x) this.complete(o.id);
    }
  }

  reset() {
    for (const o of this.objectives) {
      o.done = false;
      o.progress = 0;
    }
    this.index = 0;
    this.allDone = false;
  }
}

export default ObjectiveSystem;
