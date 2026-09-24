// -----------------------------------------------------------------------------
// Alerts - the wanted/alert meter.
//
// Enemy detection, gunshots and kills raise it; stealth and time lower it.
// A maxed meter calls in reinforcements.
// -----------------------------------------------------------------------------
import { ALERT } from './Config.js';
import { clamp } from '../utils/MathUtils.js';

export class Alerts {
  constructor({ onMaxed = null, onTierChange = null } = {}) {
    this.level = 0;
    this.max = ALERT.max;
    this.sinceLastRaise = ALERT.decayDelay;
    this.reinforcementTimer = ALERT.reinforcementCooldown;
    this.onMaxed = onMaxed;
    this.onTierChange = onTierChange;
    this.tier = 0;
    this.everMaxed = false;
    this.suspicionActive = false;
  }

  get tierName() {
    if (this.level >= 95) return 'LOCKDOWN';
    if (this.level >= 68) return 'HUNTED';
    if (this.level >= 35) return 'SUSPICIOUS';
    return 'CALM';
  }

  _raise(amount) {
    this.level = clamp(this.level + amount, 0, this.max);
    this.sinceLastRaise = 0;
    const tier = Math.floor(this.level / 25);
    if (tier !== this.tier) {
      this.tier = tier;
      this.onTierChange?.(tier, this.tierName);
    }
  }

  addDetection(enemy, dt) {
    this.suspicionActive = true;
    this._raise(ALERT.perDetection * dt * 0.35);
    this._check();
  }

  addGunshot() {
    this._raise(ALERT.perGunshot);
    this._check();
  }

  addKill(wasSeen = true) {
    this._raise(wasSeen ? ALERT.perKill : -ALERT.perKill * 0.4);
    this._check();
  }

  addFlat(amount) {
    this._raise(amount);
    this._check();
  }

  _check() {
    if (this.level >= this.max) {
      this.level = this.max;
      if (!this.everMaxed) {
        this.everMaxed = true;
        this.onMaxed?.();
      }
    }
  }

  /** True when the meter is high enough to send reinforcements. */
  consumeReinforcement() {
    if (this.level >= ALERT.reinforcementThreshold && this.reinforcementTimer <= 0) {
      this.reinforcementTimer = ALERT.reinforcementCooldown;
      return true;
    }
    return false;
  }

  update(dt, { combat = false } = {}) {
    this.sinceLastRaise += dt;
    this.reinforcementTimer = Math.max(0, this.reinforcementTimer - dt);
    this.suspicionActive = false;
    if (this.sinceLastRaise > ALERT.decayDelay) {
      this.level = clamp(this.level - ALERT.decay * dt * (combat ? 0.4 : 1), 0, this.max);
      const tier = Math.floor(this.level / 25);
      if (tier !== this.tier) {
        this.tier = tier;
        this.onTierChange?.(tier, this.tierName);
      }
    }
  }

  reset() {
    this.level = 0;
    this.tier = 0;
    this.everMaxed = false;
    this.sinceLastRaise = ALERT.decayDelay;
    this.reinforcementTimer = 0;
  }
}

export default Alerts;
