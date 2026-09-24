// -----------------------------------------------------------------------------
// VaultSequence - the cinematic vault opening.
//
// A deterministic, dt driven timeline (so it can be simulated headlessly) that
// also hands the flourish moments to GSAP when it is available: camera push-in,
// locking wheel spin, clamp retraction, door slide, steam, golden light and the
// treasure reveal.
// -----------------------------------------------------------------------------
const STEPS = [
  { at: 0.0, name: 'zoom', duration: 1.6 },
  { at: 1.6, name: 'wheel', duration: 2.6 },
  { at: 3.4, name: 'clamps', duration: 1.0 },
  { at: 4.4, name: 'steam', duration: 0.6 },
  { at: 4.8, name: 'door', duration: 2.6 },
  { at: 7.4, name: 'light', duration: 1.2 },
  { at: 8.4, name: 'treasure', duration: 1.0 },
  { at: 9.4, name: 'return', duration: 1.2 },
];

export class VaultSequence {
  constructor({ train, camera, effects, audio, damage = null, gsap = null } = {}) {
    this.train = train;
    this.camera = camera;
    this.effects = effects;
    this.audio = audio;
    this.damage = damage;
    this.gsap = gsap;
    this.active = false;
    this.time = 0;
    this.stepIndex = -1;
    this.done = false;
    this.car = train?.vaultCar ?? null;
    /** base height of the blast door (it rises into the ceiling when it opens) */
    this.doorBaseY = this.car?.dynamics?.vaultDoor?.state?.y ?? 2.2;
    this.onStep = null;
    this.onComplete = null;
    this.banner = null;
  }

  get progress() {
    return Math.min(1, this.time / 10.6);
  }

  start() {
    if (this.active || this.done) return false;
    this.active = true;
    this.time = 0;
    this.stepIndex = -1;
    this.car = this.train?.vaultCar ?? this.car;
    this.audio?.play('steam');
    this.audio?.play('alarm', { bus: 'ui' });
    this.banner = 'VAULT UNLOCKED';
    // Camera push-in on the vault door (GSAP if present, otherwise the tween in update()).
    if (this.camera) {
      const doorX = this.car?.vaultX ?? 0;
      this.camera.playShot(
        {
          pos: { x: doorX - 3.6, y: 3.1, z: 3.4 },
          look: { x: doorX, y: 2.3, z: 0 },
          fov: 32,
        },
        3.2,
        { blend: 0.6 }
      );
      this.camera.setZoom(0.86, 1.0);
    }
    return true;
  }

  update(dt, ctx = {}) {
    if (!this.active) return;
    this.time += dt;
    const car = this.car;
    if (!car) return;

    // --- fire steps ----------------------------------------------------------
    for (let i = this.stepIndex + 1; i < STEPS.length; i++) {
      if (this.time < STEPS[i].at) break;
      this.stepIndex = i;
      this._runStep(STEPS[i], ctx);
    }

    // --- continuous animations ----------------------------------------------
    const wheel = car.dynamics?.vaultWheel;
    const door = car.dynamics?.vaultDoor;
    const clamps = car.dynamics?.vaultClamps;

    if (this.time > 1.6 && this.time < 4.4 && wheel) {
      wheel.state.rx = ((this.time - 1.6) / 2.8) * Math.PI * 6;
    }
    if (this.time > 4.2 && wheel) {
      wheel.state.rx += dt * 0.6;
    }
    if (this.time > 3.4 && this.time < 4.6 && clamps) {
      const t = (this.time - 3.4) / 1.2;
      clamps.state.x = car.clampBaseX - t * 0.55;
    }
    if (this.time > 4.8 && this.time < 7.4 && door) {
      const t = (this.time - 4.8) / 2.6;
      const e = t * t * (3 - 2 * t);
      // the blast door lifts into the ceiling, clearing the doorway completely
      door.state.y = this.doorBaseY + e * 2.7;
      door.state.rz = e * 0.1;
    }
    // steam venting around the door while it opens
    if (this.effects && this.time > 4.6 && this.time < 7.6 && Math.random() < dt * 18) {
      this.effects.sim.steamJet(car.vaultX - 0.4 + Math.random() * 0.6, 1.4 + Math.random() * 1.6, (Math.random() - 0.5) * 2.2, 2, {
        size: 0.9,
        vy: 1.4,
        spreadX: 1.2,
        spreadY: 1.0,
        spreadZ: 1.2,
      });
    }
    if (this.effects && this.time > 7.4 && this.time < 9.4 && Math.random() < dt * 12) {
      this.effects.sim.sparkBurst(car.vaultX - 1.4, 2.0, (Math.random() - 0.5) * 1.6, 2, { speed: 1.6, life: 1.4, size: 0.3, color: [1, 0.85, 0.4] });
    }

    if (this.time >= 10.6 && !this.done) {
      this.done = true;
      this.active = false;
      if (this.camera) {
        this.camera.stopShot();
        this.camera.setZoom(1, 1);
      }
      this.banner = null;
      this.onComplete?.();
    }
  }

  _runStep(step, ctx) {
    const car = this.car;
    this.onStep?.(step.name);
    switch (step.name) {
      case 'zoom':
        break;
      case 'wheel':
        this.audio?.play('reload');
        break;
      case 'clamps':
        this.audio?.play('reload');
        break;
      case 'steam':
        this.audio?.play('steam');
        if (this.effects) {
          this.effects.sim.steamJet(car.vaultX - 0.3, 1.6, 0, 10, { size: 1.5, vy: 2.6, spreadX: 1.6, spreadZ: 1.6 });
        }
        break;
      case 'door':
        this.audio?.play('explosion');
        this.train?.world.remove(car.vaultCollider);
        car.vaultCollider = null;
        break;
      case 'light':
        this.audio?.play('jackpot');
        if (this.effects) {
          this.effects.flashLight(car.treasureSpawn.x, car.treasureSpawn.y + 0.8, car.treasureSpawn.z, 30, 16, 0xffc040, 2.4);
          for (let i = 0; i < 26; i++) {
            this.effects.sim.spawn('glow', car.treasureSpawn.x, car.treasureSpawn.y + 0.5, car.treasureSpawn.z, {
              size0: 0.6,
              size1: 0.1,
              life: 1.4,
              spreadX: 1.4,
              spreadY: 1.0,
              spreadZ: 1.4,
              vy: 1.2,
              color: [1, 0.8, 0.35],
            });
          }
        }
        break;
      case 'treasure':
        ctx.onTreasureRevealed?.();
        this.banner = 'THE PAYROLL IS YOURS';
        break;
      case 'return':
        this.banner = null;
        break;
      default:
        break;
    }
  }

  reset() {
    this.active = false;
    this.done = false;
    this.time = 0;
    this.stepIndex = -1;
    this.banner = null;
    const car = this.car;
    if (!car) return;
    const door = car.dynamics?.vaultDoor;
    const wheel = car.dynamics?.vaultWheel;
    const clamps = car.dynamics?.vaultClamps;
    if (door) {
      door.state.x = car.vaultX;
      door.state.y = this.doorBaseY;
      door.state.rz = 0;
    }
    if (wheel) wheel.state.rx = 0;
    if (clamps) clamps.state.x = car.clampBaseX;
  }
}

export default VaultSequence;
