// -----------------------------------------------------------------------------
// HazardDirector - the set-piece director.
//
// Owns the schedule of scenery landmarks and the "rooftop" hazards (tunnels, low
// gantries, rockfalls, passing trains, bridges). It spawns structures ahead of
// the train, warns the player with a head start, then resolves the hit when the
// structure reaches the train.
// -----------------------------------------------------------------------------
export class HazardDirector {
  constructor({ environment, train, effects, audio, camera = null, random = Math.random } = {}) {
    this.environment = environment;
    this.train = train;
    this.effects = effects;
    this.audio = audio;
    this.camera = camera;
    this.random = random;

    /** journey-distance based scenery */
    this.landmarkSchedule = [];
    this.landmarkIndex = 0;
    /** structures currently being tracked as hazards */
    this.active = [];
    this.warning = null;
    this.warningTimer = 0;
    this.roofHazardCooldown = 6;
    this.roofHazardDelay = 9;
    this.playerWasOnRoof = false;
    this.bridgeActive = 0;
    this.bridgeStructure = null;
    this.fallingRocks = [];
    this.rockTimer = 0;
    this.onWarning = null; // (warning) => void
    this.onHazardHit = null; // (kind, payload) => void
    this.difficulty = 1;
    this.enabled = true;
    this.escaping = false;
  }

  reset() {
    this.landmarkSchedule = [
      { at: 60, kind: 'station' },
      { at: 320, kind: 'rockfall' },
      { at: 900, kind: 'passingTrain' },
      { at: 1400, kind: 'station' },
      { at: 1900, kind: 'rockfall' },
      { at: 2400, kind: 'trestle' },
      { at: 3000, kind: 'passingTrain' },
    ];
    this.landmarkIndex = 0;
    this.active.length = 0;
    this.fallingRocks.length = 0;
    this.warning = null;
    this.roofHazardCooldown = 8;
    this.bridgeActive = 0;
    this.bridgeStructure = null;
  }

  warn(text, duration = 4, kind = 'hazard') {
    this.warning = { text, duration, t: 0, kind };
    this.onWarning?.(this.warning);
    this.audio?.play('alarm', { bus: 'ui' });
  }

  update(dt, ctx) {
    if (!this.enabled) return;
    const { player, train, environment } = ctx;
    const midX = (train.frontX + train.rearX) / 2;
    const speed = Math.max(4, train.speed);

    // --- warning timer -------------------------------------------------------
    if (this.warning) {
      this.warning.t += dt;
      if (this.warning.t >= this.warning.duration) this.warning = null;
    }

    // --- scheduled landmarks -------------------------------------------------
    while (this.landmarkIndex < this.landmarkSchedule.length && environment.distance >= this.landmarkSchedule[this.landmarkIndex].at) {
      const evt = this.landmarkSchedule[this.landmarkIndex++];
      const structure = environment.spawnStructure(evt.kind, {
        x: train.frontX + 520,
        parallax: evt.kind === 'passingTrain' ? 1.75 : 1,
      });
      this.track(structure, { warn: 0, hazard: false });
    }

    // --- rooftop set-pieces --------------------------------------------------
    const onRoof = player && player.onRoof && !player.dead;
    this.roofHazardCooldown -= dt;
    if (onRoof && !this.playerWasOnRoof) this.roofHazardCooldown = Math.min(this.roofHazardCooldown, 6);
    this.playerWasOnRoof = onRoof;

    const alreadyIncoming = this.active.some((s) => s.hazard && !s.triggered);
    if (onRoof && this.roofHazardCooldown <= 0 && !alreadyIncoming && ctx.allowRoofHazards !== false) {
      const kinds = ['gantry', 'tunnel', 'gantry'];
      const kind = kinds[Math.floor(this.random() * kinds.length)];
      const structure = environment.spawnStructure(kind, { x: train.frontX + 150, parallax: 1 });
      this.track(structure, { warn: 4.6, hazard: true });
      this.roofHazardCooldown = this.roofHazardDelay + this.random() * 6;
    }

    // --- track active structures --------------------------------------------
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      if (s.structure.dead) {
        this.active.splice(i, 1);
        continue;
      }
      const x = s.structure.group.state.x;
      const eta = (x - midX) / speed;
      if (s.warn > 0 && !s.warned && eta <= s.warn) {
        s.warned = true;
        this.warn(warningFor(s.structure.kind), s.warn, s.structure.kind);
      }
      if (s.hazard && !s.triggered && x <= midX + 2) {
        s.triggered = true;
        this.resolve(s.structure, ctx);
      }
      // bridge state keeps ticking while the trestle is under the train
      if (s.structure.kind === 'trestle') {
        const end = x + s.structure.length;
        this.bridgeActive = end > train.rearX && x < train.frontX ? 1 : Math.max(0, this.bridgeActive - dt);
        this.bridgeStructure = this.bridgeActive > 0 ? s.structure : null;
      }
      if (s.structure.kind === 'rockfall' && x < train.frontX + 40 && x + s.structure.length > train.rearX - 20) {
        this._updateRockfall(dt, s.structure, ctx);
      }
      if (x < environment.span.min) this.active.splice(i, 1);
    }

    // --- falling rocks (physics-y debris with damage) ------------------------
    for (let i = this.fallingRocks.length - 1; i >= 0; i--) {
      const rock = this.fallingRocks[i];
      rock.vy -= 34 * dt;
      rock.y += rock.vy * dt;
      if (this.effects && Math.random() < dt * 30) {
        this.effects.sim.spawn('dust', rock.x, rock.y, rock.z, { spreadX: 0.5, spreadY: 0.5, spreadZ: 0.5, size: 0.7, life: 0.6 });
      }
      const floor = rock.floor ?? 0;
      if (rock.y <= floor) {
        this.effects?.sim.debrisBurst(rock.x, floor + 0.1, rock.z, 5, { speed: 3 });
        this.effects?.sim.dustBurst(rock.x, floor + 0.1, rock.z, 6, { spread: 2.4 });
        if (ctx.player && !ctx.player.dead) {
          const d = Math.hypot(ctx.player.pos.x - rock.x, ctx.player.pos.z - rock.z);
          if (d < 1.6 && Math.abs(ctx.player.pos.y - floor) < 2.4) {
            ctx.damage?.applyDamage(ctx.player, 14, { dir: { x: 0, z: 0 }, knockback: 1.5 });
            this.camera?.addShake(0.3);
          }
        }
        this.fallingRocks.splice(i, 1);
      }
      if (rock.y < -40) this.fallingRocks.splice(i, 1);
    }
  }

  track(structure, { warn = 0, hazard = false } = {}) {
    this.active.push({ structure, warn, hazard, warned: false, triggered: false });
    return structure;
  }

  _updateRockfall(dt, structure, ctx) {
    this.rockTimer -= dt;
    if (this.rockTimer > 0) return;
    this.rockTimer = this.random() > 0.4 ? 0.45 : 0.9;
    const player = ctx.player;
    const baseX = player ? player.pos.x + (this.random() * 2 - 1) * 12 : structure.group.state.x + 20;
    const z = (this.random() * 2 - 1) * 6;
    this.fallingRocks.push({ x: baseX, y: 16 + this.random() * 5, z, vy: -2, floor: player?.onRoof ? player.pos.y : 0 });
    this.effects?.sim.spawn('dust', baseX, 17, z, { size: 1.4, life: 1.2, spreadX: 1, spreadY: 0.6, spreadZ: 1 });
  }

  /** Resolves the impact of a hazard structure on the player/train. */
  resolve(structure, ctx) {
    const { player, train } = ctx;
    const onRoof = player && player.onRoof && !player.dead;
    const roofY = player ? player.pos.y : 0;
    switch (structure.kind) {
      case 'tunnel': {
        if (onRoof) {
          this.onHazardHit?.('tunnel', { structure });
          ctx.damage?.applyDamage(player, 34, { dir: { x: 0, z: 1 }, knockback: 9, ignoreInvuln: false });
          player.vel.y = Math.max(player.vel.y, 2.2);
          player.vel.z = 6.5;
          player.vel.x = -train.speed * 0.25;
          player.canRecover = true;
          player.fallRecoveryTimer = 3.4;
          player.climbing = false;
          this.camera?.addShake(0.8);
          this.audio?.play('explosion');
          ctx.effects?.sim.sparkBurst(player.pos.x, roofY + 1.7, player.pos.z, 16, { speed: 7 });
        } else {
          this.onHazardHit?.('tunnel-enter', { structure });
          this.audio?.play('steam');
        }
        break;
      }
      case 'gantry': {
        if (onRoof) {
          this.onHazardHit?.('gantry', { structure });
          ctx.damage?.applyDamage(player, 22, { dir: { x: -1, z: 0 }, knockback: 5 });
          player.vel.y = Math.max(player.vel.y, 1.4);
          player.vel.x -= train.speed * 0.35;
          player.hitTimer = 0.4;
          this.camera?.addShake(0.55);
          ctx.effects?.sim.sparkBurst(player.pos.x, roofY + 1.75, player.pos.z, 20, { speed: 8 });
          this.audio?.play('explosion');
        }
        break;
      }
      case 'passingTrain': {
        this.onHazardHit?.('incoming-train', { structure });
        this.camera?.addShake(0.5);
        this.audio?.play('steam');
        if (player && player.pos.z > 0.6 && !player.dead) {
          ctx.damage?.applyDamage(player, 12, { dir: { x: 0, z: -1 }, knockback: 8 });
          player.vel.z = -7;
          player.vel.y = Math.max(player.vel.y, 2.5);
        }
        if (this.effects) {
          for (let i = 0; i < 12; i++) {
            this.effects.sim.spawn('dust', structure.group.state.x, 1 + Math.random() * 3, 3 + Math.random() * 3, {
              spreadX: 3,
              spreadY: 3,
              spreadZ: 3,
              size: 1.6,
              life: 1.4,
              vx: -train.speed * 0.9,
            });
          }
        }
        break;
      }
      case 'trestle': {
        this.onHazardHit?.('bridge', { structure });
        break;
      }
      default:
        break;
    }
  }

  /** Called by the game when the player falls off while on a bridge. */
  isBridgeActive() {
    return this.bridgeActive > 0;
  }
}

function warningFor(kind) {
  switch (kind) {
    case 'tunnel':
      return 'TUNNEL AHEAD — GET INSIDE!';
    case 'gantry':
      return 'LOW BRIDGE — STAY DOWN!';
    case 'passingTrain':
      return 'ONCOMING TRAIN!';
    case 'rockfall':
      return 'ROCKFALL — TAKE COVER!';
    case 'trestle':
      return 'BRIDGE — DO NOT FALL!';
    default:
      return 'DANGER AHEAD';
  }
}

export default HazardDirector;
