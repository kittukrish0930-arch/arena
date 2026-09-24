// -----------------------------------------------------------------------------
// Game - the orchestrator.
//
// Owns every gameplay system and drives them from the fixed step loop. It has no
// three.js imports: the 3D presentation is an injected `view` (render/View3D.js
// in the browser, nothing at all in headless tests).
// -----------------------------------------------------------------------------
import { CollisionWorld } from '../physics/CollisionWorld.js';
import { Train } from '../train/Train.js';
import { Environment } from '../environment/Environment.js';
import { Player } from '../player/Player.js';
import { PlayerController } from '../player/PlayerController.js';
import { PlayerCombat } from '../player/PlayerCombat.js';
import { EnemyManager } from '../enemies/EnemyManager.js';
import { DamageSystem } from '../combat/DamageSystem.js';
import { ProjectileSystem } from '../combat/Projectile.js';
import { GameState, GameStates } from './GameState.js';
import { GameLoop } from './GameLoop.js';
import { InputManager } from './InputManager.js';
import { CameraController } from './CameraController.js';
import { Alerts } from './Alerts.js';
import { ObjectiveSystem } from './Objectives.js';
import { LootSystem } from '../world/LootSystem.js';
import { Destructibles } from '../world/Destructibles.js';
import { HazardDirector } from '../hazards/HazardDirector.js';
import { BossFight, BossPhases } from './BossFight.js';
import { VaultSequence } from './VaultSequence.js';
import { EscapeSequence } from './EscapeSequence.js';
import { AudioManager } from '../audio/AudioManager.js';
import { HUD } from '../ui/HUD.js';
import { MainMenu } from '../ui/MainMenu.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { MissionComplete } from '../ui/MissionComplete.js';
import { HeadlessEffects } from '../fx/HeadlessEffects.js';
import { TRAIN } from './Config.js';
import { clamp } from '../utils/MathUtils.js';

const IDLE_INTENT = {
  moveDir: { x: 0, z: 0 },
  moveLength: 0,
  moveX: 0,
  moveY: 0,
  jump: false,
  jumpPressed: false,
  sprint: false,
  crouch: false,
  dodge: false,
  fire: false,
  aim: false,
  interact: false,
  reload: false,
};

export class Game {
  /**
   * @param {object} opts canvas, uiRoot, view (optional 3D layer), headless,
   *   quality, audio, autoStartLoop (false keeps the rAF loop off for tests)
   */
  constructor({ canvas = null, uiRoot = null, view = null, headless = false, quality = 'high', audio = null, autoStartLoop = true } = {}) {
    this.headless = headless;
    this.autoStartLoop = autoStartLoop;
    this.canvas = canvas;
    this.quality = quality;
    this.settings = { cameraShake: true, aimAssist: true, music: true };

    this.world = new CollisionWorld();
    this.state = new GameState(GameStates.MENU);
    this.camera = new CameraController();
    this.input = new InputManager(typeof window !== 'undefined' ? window : null);
    this.audio = audio ?? new AudioManager({ enabled: !headless });

    // 3D presentation (optional)
    this.view = view;
    this.effects = view?.effects ?? new HeadlessEffects();

    this.train = new Train(this.world);
    this.environment = new Environment(this.world, {
      journeyDistance: TRAIN.journeyDistance,
      density: quality === 'low' ? 0.6 : 1,
    });

    this.damage = new DamageSystem({ effects: this.effects, camera: this.camera, audio: this.audio });
    this.projectiles = new ProjectileSystem(this.world, { capacity: 128 });
    this.alerts = new Alerts({
      onMaxed: () => this._onAlarm(),
      onTierChange: (tier, name) => this.onAlertTier?.(tier, name),
    });

    this.enemies = new EnemyManager(this.world, this.train, {});
    this.player = new Player(this.world, this.train, { damageSystem: this.damage, spawn: this._boardingSpawn() });
    this.combat = new PlayerCombat(this.player, this._combatCtx());
    this.player.getMuzzlePosition = () => this.combat.muzzlePosition();
    this.controller = new PlayerController(this.player, this.input, this.camera, {
      getTargets: () => this.enemies.getTargets(),
      aimAssist: this.settings.aimAssist ? 0.35 : 0,
    });

    this.lootSystem = new LootSystem({ train: this.train, onCollect: (item) => this._onLootCollected(item) });
    this.lootSystem.build();

    this.destructibles = new Destructibles({
      world: this.world,
      train: this.train,
      effects: this.effects,
      damage: this.damage,
      camera: this.camera,
      audio: this.audio,
      onExplode: (info) => this.onExplosion?.(info),
    });
    this.destructibles.targetsProvider = () => [this.player, ...this.enemies.enemies];
    this.destructibles.registerTrain(this.train);

    this.objectives = new ObjectiveSystem({
      train: this.train,
      onComplete: (o) => this._onObjectiveComplete(o),
    });
    this.objectives.build(this.train);

    this.hazards = new HazardDirector({
      environment: this.environment,
      train: this.train,
      effects: this.effects,
      audio: this.audio,
      camera: this.camera,
      random: Math.random,
    });
    this.hazards.onWarning = (w) => this.onHazardWarning?.(w);
    this.hazards.onHazardHit = (kind, payload) => this.onHazardHit?.(kind, payload);
    this.hazards.reset();

    this.bossFight = new BossFight({
      enemyManager: this.enemies,
      train: this.train,
      camera: this.camera,
      effects: this.effects,
      audio: this.audio,
      damage: this.damage,
      alerts: this.alerts,
      spawnReinforcements: (n) => {
        const spawned = this.enemies.spawnReinforcements(this.player, n);
        for (const e of spawned) this.spawnEnemyView(e);
        return spawned;
      },
    });
    this.bossFight.onDefeated = () => this._onBossDefeated();
    this.bossFight.onTaunt = (text) => this.onTaunt?.(text);

    this.vault = new VaultSequence({ train: this.train, camera: this.camera, effects: this.effects, audio: this.audio });
    this.vault.onComplete = () => this._onVaultOpened();

    this.escape = new EscapeSequence({
      train: this.train,
      environment: this.environment,
      hazards: this.hazards,
      camera: this.camera,
      effects: this.effects,
      audio: this.audio,
      damage: this.damage,
    });
    this.escape.onComplete = () => this._onEscapeComplete();

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: (dt) => this.render(dt),
    });

    this.runTime = 0;
    this.timeScale = 1;
    this.introTime = 0;
    this.introStage = 0;
    this.bossStarted = false;
    this.vaultArmed = false;
    this.currentInteract = null;
    this.clearedCars = new Set();
    this.weather = { rain: 0, dust: 0 };
    this.failureReason = '';
    this.summary = null;
    this.debug = { enabled: false, invincible: false, showFps: false, partCount: 0, particleCount: 0 };

    this.onObjectiveComplete = null;
    this.onTaunt = null;
    this.onHazardWarning = null;
    this.onHazardHit = null;
    this.onAlertTier = null;
    this.onExplosion = null;
    this.onDetected = null;
    this.onStateChange = null;

    this.damage.onHitFeedback = (kind, amount) => {
      if (kind === 'player-hit') this.hud?.flashDamage(amount);
    };
    this.damage.onKill = (target) => {
      if (!target?.def) return;
      this.damage.stats.killsByType[target.type] = (this.damage.stats.killsByType[target.type] ?? 0) + 1;
      this.alerts.addKill(true);
    };

    this.enemies.onKill = (enemy) => {
      this.audio?.play('hitmarker', { bus: 'ui' });
      if (enemy?.isBoss) this.bossFight.taunt('ELITE GUARD DOWN');
    };
    this.enemies.onRemove = (enemy) => this.view?.removeCharacter(enemy);

    this.state.onTransition((to, from) => {
      this.onStateChange?.(to, from);
      if (to === GameStates.MENU) this.audio?.play('uiBack', { bus: 'ui' });
      else this.audio?.play('ui', { bus: 'ui' });
    });

    // ---------------- UI -----------------------------------------------------
    this.hud = new HUD(uiRoot, {});
    this.mainMenu = new MainMenu(uiRoot, { game: this, onPlay: () => this.startRun() });
    this.pauseMenu = new PauseMenu(uiRoot, {
      game: this,
      onResume: () => this.resume(),
      onRestart: () => this.startRun(),
      onMainMenu: () => this.toMainMenu(),
    });
    this.missionScreen = new MissionComplete(uiRoot, {
      game: this,
      onRetry: () => this.startRun(),
      onMainMenu: () => this.toMainMenu(),
    });
    this.hud?.buildMap(this.train);

    // ---------------- presentation ------------------------------------------
    if (this.view) {
      this.view.buildWorld({
        train: this.train,
        environment: this.environment,
        lootSystem: this.lootSystem,
        destructibles: this.destructibles,
      });
      this.view.createCharacter(this.player);
    }

    this.boundResize = () => {
      this.view?.onResize();
      const el = this.view?.renderer?.domElement;
      if (el) this.camera.setAspect((el.clientWidth || 1920) / Math.max(1, el.clientHeight || 1080));
    };
    if (typeof window !== 'undefined') window.addEventListener('resize', this.boundResize);
  }

  _combatCtx() {
    return {
      world: this.world,
      effects: this.effects,
      camera: this.camera,
      damage: this.damage,
      alerts: this.alerts,
      audio: this.audio,
      projectile: this.projectiles,
      getHitSpheres: () => this.enemies.getHitSpheres(),
      onHit: (target, amount, headshot, point) => this._onPlayerHit(target, amount, headshot, point),
      onExplosiveHit: (box, point) => this.destructibles.hit(box, point, { source: this.player }),
    };
  }

  _boardingSpawn() {
    const car = this.train.caboose ?? this.train.cars[0];
    // the caboose sits at the rear (lowest x): board and walk towards +x
    return { x: car.x0 + 1.8, y: car.floorSurfaceY, z: 0 };
  }

  // ---------------------------------------------------------------------------
  // lifecycle
  // ---------------------------------------------------------------------------

  start() {
    this.mainMenu?.show();
    this.hud?.setVisible(false);
    if (this.autoStartLoop) this.loop.start();
    this.state.set(GameStates.MENU);
    return this;
  }

  /** Starts the fixed step loop (used by main.js / tests). */
  startLoop() {
    this.loop.start();
    return this;
  }

  /** Kicks off a fresh heist. */
  startRun() {
    this.mainMenu?.hide();
    this.pauseMenu?.hide();
    this.missionScreen?.hide();
    this.resetRun();
    this.hud?.setVisible(true);
    this.audio?.resume();
    this.audio?.startLoop('engine', 0.2);
    this.audio?.startLoop('wind', 0.08);
    this.state.set(GameStates.INTRO);
    return this;
  }

  resetRun() {
    this.runTime = 0;
    this.timeScale = 1;
    this.introTime = 0;
    this.introStage = 0;
    this.bossStarted = false;
    this.vaultArmed = false;
    this.currentInteract = null;
    this.clearedCars = new Set();
    this.failureReason = '';
    this.summary = null;
    this.weather.rain = 0;
    this.weather.dust = 0;

    // --- fresh world ---------------------------------------------------------
    this.world.clear();
    this.train = new Train(this.world);
    this.environment = new Environment(this.world, {
      journeyDistance: TRAIN.journeyDistance,
      density: this.quality === 'low' ? 0.6 : 1,
    });
    this.player = new Player(this.world, this.train, { damageSystem: this.damage, spawn: this._boardingSpawn() });
    this.combat = new PlayerCombat(this.player, this._combatCtx());
    this.player.getMuzzlePosition = () => this.combat.muzzlePosition();

    // --- re-point every system at the new instances --------------------------
    this.controller.player = this.player;
    this.enemies.world = this.world;
    this.enemies.train = this.train;
    this.enemies.reset();
    this.lootSystem.train = this.train;
    this.lootSystem.reset();
    this.lootSystem.build();
    this.destructibles.world = this.world;
    this.destructibles.registerTrain(this.train);
    this.objectives.train = this.train;
    this.objectives.build(this.train);
    this.hazards.train = this.train;
    this.hazards.environment = this.environment;
    this.hazards.reset();
    this.bossFight.train = this.train;
    this.bossFight.reset();
    this.vault.train = this.train;
    this.vault.reset();
    this.escape.train = this.train;
    this.escape.environment = this.environment;
    this.escape.reset();
    this.projectiles.clear();
    this.effects.clear?.();
    this.damage.reset();
    this.alerts.reset();
    this.camera.stopShot();
    this.camera.setZoom(1, 1);

    // --- presentation --------------------------------------------------------
    if (this.view) {
      this.view.rebuildWorld({
        train: this.train,
        environment: this.environment,
        lootSystem: this.lootSystem,
        destructibles: this.destructibles,
      });
      this.view.createCharacter(this.player);
    }
    this.hud?.buildMap(this.train);
  }

  pause() {
    if (!this.state.controllable) return false;
    this.previousPlayState = this.state.current;
    this.state.set(GameStates.PAUSED);
    this.loop.setPaused(true);
    this.pauseMenu?.show();
    this.audio?.setLoopGain('engine', 0.05);
    return true;
  }

  resume() {
    if (!this.state.is(GameStates.PAUSED)) return false;
    this.state.set(this.previousPlayState ?? GameStates.PLAYING);
    this.loop.setPaused(false);
    this.pauseMenu?.hide();
    this.audio?.setLoopGain('engine', 0.2);
    return true;
  }

  toMainMenu() {
    this.pauseMenu?.hide();
    this.missionScreen?.hide();
    this.mainMenu?.show();
    this.hud?.setVisible(false);
    this.loop.setPaused(false);
    this.enemies.clearAll();
    this.escape.active = false;
    this.state.set(GameStates.MENU);
    return true;
  }

  setQuality(level) {
    this.quality = level;
    this.view?.setQuality(level);
  }

  setAudioEnabled(enabled) {
    this.audio?.setEnabled(enabled);
    if (enabled) this.audio?.resume();
  }

  setAimAssist(on) {
    this.settings.aimAssist = !!on;
    this.controller.ctx.aimAssist = on ? 0.35 : 0;
  }

  spawnEnemyView(enemy) {
    this.view?.createCharacter(enemy);
  }

  // ---------------------------------------------------------------------------
  // main update (fixed step)
  // ---------------------------------------------------------------------------

  update(dt) {
    // settings can be toggled at runtime from the menus
    this.camera.shakeEnabled = this.settings.cameraShake;
    this.controller.ctx.aimAssist = this.settings.aimAssist ? 0.35 : 0;

    if (this.input.wasPressed('pause')) {
      if (this.state.is(GameStates.PAUSED)) this.resume();
      else this.pause();
    }
    this._handleDebugKeys();

    const simulating = this.state.simulating && !this.loop.paused;
    if (!simulating) {
      // menus keep the world alive in the background
      this.train.update(dt, this.effects, this.player.pos);
      this.environment.update(dt, this.train, this.effects, this.player);
      this.camera.update(dt, this.player, this.train, {
        framing: this.state.is(GameStates.MENU) ? menuFraming(this.environment.distance) : undefined,
      });
      if (this.state.is(GameStates.PAUSED)) {
        this.pauseMenu?.update();
        this.hud?.update(this);
      }
      this.input.endFrame();
      return;
    }

    this.runTime += dt;
    let scale = this.timeScale;
    if (this.bossFight.slowmo > 0) scale *= 0.45;
    const sdt = dt * scale;

    // ---- intro is a pure cinematic: no physics, no enemies ------------------
    if (this.state.is(GameStates.INTRO)) {
      this._updateIntro(dt);
      this.train.update(sdt, this.effects, this.player.pos);
      this.environment.update(sdt, this.train, this.effects, this.player);
      this.player._animate?.(sdt);
      this.camera.update(sdt, this.player, this.train, {});
      this.hud?.update(this);
      this.input.endFrame();
      return;
    }

    // ---- player -------------------------------------------------------------
    const controllable = this.state.controllable;
    const intent = this.controller.update(dt);
    const playerIntent = controllable ? intent : IDLE_INTENT;
    this.player.update(sdt, playerIntent, {});
    this.combat.update(sdt, playerIntent);
    this._drainPlayerEvents();

    // ---- world --------------------------------------------------------------
    this.train.update(sdt, this.effects, this.player.pos);
    this.environment.update(sdt, this.train, this.effects, this.player);
    this.destructibles.update(sdt);
    this.projectiles.update(sdt);
    this._updateWind(sdt);
    this.hazards.update(sdt, {
      player: this.player,
      train: this.train,
      environment: this.environment,
      damage: this.damage,
      effects: this.effects,
      allowRoofHazards: !this.state.is(GameStates.ESCAPE),
    });

    // ---- enemies ------------------------------------------------------------
    this.enemies.update(sdt, {
      player: this.player,
      world: this.world,
      alerts: this.alerts,
      damage: this.damage,
      effects: this.effects,
      train: this.train,
      audio: this.audio,
      onDetect: (e) => this.onDetected?.(e),
    });
    this._updateEncounterFlow();
    this._updateCarClear();
    this._updateDoors();
    this._reapCorpses();

    // ---- systems ------------------------------------------------------------
    this.alerts.update(dt, { combat: this.enemies.activeCount > 0 && this.alerts.level > 20 });
    this.currentInteract = this.lootSystem.findNearby(this.player);
    if (controllable && intent.interact && this.currentInteract) this.interact(this.currentInteract);
    this.objectives.update(this.player, this.train);
    this._updateObjectives();
    this.bossFight.update(sdt, { player: this.player });
    this.vault.update(sdt, {});
    this.escape.update(sdt, { player: this.player });
    this._updateStateFlow();
    this._checkFailure();

    // ---- camera + presentation ---------------------------------------------
    this.camera.update(sdt, this.player, this.train, {});
    this.hud?.update(this);
    this._updateAudio(dt);
    this.input.endFrame();
  }

  render(dt) {
    if (!this.view) return;
    const wind = this.environment.windVec(this.train.speedNorm);
    this.view.update(dt, {
      cameraController: this.camera,
      train: this.train,
      environment: this.environment,
      player: this.player,
      enemies: this.enemies,
      effects: this.effects,
      wind,
    });
    this.view.render();
    this.debug.partCount = this.view.stats?.partCount ?? 0;
    this.debug.particleCount = this.effects.sim?.liveCount ?? 0;
  }

  // ---------------------------------------------------------------------------
  // sub-systems
  // ---------------------------------------------------------------------------

  _updateWind(dt) {
    const t = Math.min(1, this.environment.distance / 3400);
    this.weather.dust = t > 0.2 && t < 0.42 ? 1 : Math.max(0, this.weather.dust - dt * 0.08);
    this.weather.rain = t > 0.72 ? Math.min(0.7, this.weather.rain + dt * 0.02) : Math.max(0, this.weather.rain - dt * 0.02);
    this.environment.dustStorm = this.weather.dust;
    this.environment.rain = this.weather.rain;

    const wind = this.environment.windVec(this.train.speedNorm);
    if (this.player.onRoof && !this.player.dead) {
      this.player.vel.x -= wind.x * dt * 0.22;
      if (Math.random() < dt * 10) {
        this.effects.sim.windDrift(this.player.pos.x + 16, this.player.pos.y + 1.6, this.player.pos.z - 4, wind.x);
      }
    }
    if (this.weather.rain > 0.05 && Math.random() < dt * 40) {
      this.effects.sim.spawn('dust', this.player.pos.x + (Math.random() * 2 - 1) * 22, 15, (Math.random() * 2 - 1) * 14, {
        vy: -24,
        vx: -this.train.speed * 0.5,
        life: 1.0,
        size: 0.35,
        color: [0.72, 0.8, 0.95],
        alpha: 0.45,
      });
    }
  }

  /** Handles [E] on a nearby interactable. */
  interact(target) {
    switch (target?.type) {
      case 'loot':
        if (target.taken) return false;
        this.lootSystem.collect(target, this.player);
        return true;
      case 'vault':
        if (!this.vaultArmed || target.opened) return false;
        target.opened = true;
        this.vault.start();
        this.state.set(GameStates.VAULT);
        return true;
      case 'escape':
        if (!this.escape.active || this.escape.endingPlaying) return false;
        this.escape.triggerJump({ player: this.player });
        this.objectives.complete('escape');
        return true;
      case 'board':
      default:
        return false;
    }
  }

  _updateEncounterFlow() {
    const player = this.player;
    const carIndex = this.train.carIndexAt(player.pos.x);
    for (const car of this.train.cars) {
      if (this.enemies.spawnedCars.has(car.index)) continue;
      if (car.type === 'vault') continue; // boss handled separately
      // one step ahead is enough: keeps the pacing tight and the budget small
      if (car.index > carIndex + 1) continue;
      if (car.index !== carIndex && Math.abs(car.x0 - player.pos.x) > 70) continue;
      const spawned = this.enemies.spawnCarGarrison(car, { budget: 3, difficulty: 0.8 });
      for (const e of spawned) this.spawnEnemyView(e);
    }

    // --- boss -----------------------------------------------------------------
    const vaultCar = this.train.vaultCar;
    if (!this.bossStarted && vaultCar && player.pos.x > vaultCar.x0 - 2.5 && !this.vault.done) {
      this.bossStarted = true;
      const boss = this.enemies.spawnBoss();
      this.spawnEnemyView(boss);
      this.state.set(GameStates.BOSS);
      this.bossFight.start(boss, { player });
      this.audio?.startLoop('boss', 0.18);
    }

    // --- alarm reinforcements -------------------------------------------------
    if (this.alerts.consumeReinforcement() && !this.state.is(GameStates.MENU, GameStates.MISSION_COMPLETE, GameStates.MISSION_FAILED)) {
      const spawned = this.enemies.spawnReinforcements(player, 2);
      for (const e of spawned) this.spawnEnemyView(e);
      if (spawned.length) this.hud?.toast('REINFORCEMENTS INCOMING', { kind: 'alert' });
    }
  }

  /** Clearing a car's garrison patches the player up a little. */
  _updateCarClear() {
    const ahead = this.train.carIndexAt(this.player.pos.x);
    for (const car of this.train.cars) {
      if (this.clearedCars.has(car.index)) continue;
      if (!this.enemies.spawnedCars.has(car.index)) continue;
      if (car.index >= ahead) continue; // only cars already left behind
      if (this.enemies.enemies.some((e) => e.car === car && !e.dead)) continue;
      this.clearedCars.add(car.index);
      if (this.player.health < this.player.maxHealth) {
        this.player.heal(12);
        this.hud?.toast(`${car.name} CLEAR  +12 HEALTH`, { kind: 'objective', duration: 3 });
        this.audio?.play('objective', { bus: 'ui' });
      }
    }
  }

  /** Locked doors open once the fight in front of them is over. */
  _updateDoors() {
    const armored = this.train.armoredCar;
    if (armored?.doorFront?.locked && this.enemies.spawnedCars.has(armored.index)) {
      const guardsAlive = this.enemies.enemies.some((e) => e.car === armored && !e.dead);
      if (!guardsAlive) {
        this.train.openDoor(armored.doorFront, 1.3);
        this.hud?.toast('ARMORED CAR UNLOCKED', { kind: 'objective', duration: 4 });
        this.audio?.play('reload');
      }
    }
  }

  _reapCorpses() {
    if (!this.enemies.corpses.length) return;
    for (const e of this.enemies.corpses) this.view?.removeCharacter(e);
    this.enemies.corpses.length = 0;
  }

  _updateObjectives() {
    const o = this.objectives;
    o.setProgress('guards', this.enemies.totalKilled);
    o.setProgress('loot', this.lootSystem.collected);
    if (this.alerts.everMaxed) o.complete('stealth', { silent: true });
  }

  _updateStateFlow() {
    if (this.state.is(GameStates.BOSS) && this.bossFight.phase === BossPhases.DEAD && this.bossFight.deathTimer > 2.6) {
      this.state.set(GameStates.PLAYING);
    }
    if (this.state.is(GameStates.VAULT) && this.vault.done) {
      this.state.set(GameStates.PLAYING);
    }
  }

  _checkFailure() {
    const p = this.player;
    if (this.state.is(GameStates.MISSION_COMPLETE, GameStates.MISSION_FAILED, GameStates.INTRO)) return;
    if (p.dead) {
      this.failureReason = 'YOU WERE TAKEN DOWN';
      this._failMission();
      return;
    }
    if (p.pos.y < -8 && !p.climbing && !this.escape.endingPlaying) {
      this.failureReason = this.hazards.isBridgeActive() ? 'YOU FELL FROM THE TRESTLE' : 'YOU FELL FROM THE TRAIN';
      this._failMission();
    }
  }

  _failMission() {
    if (this.state.is(GameStates.MISSION_FAILED)) return;
    this.summary = this._buildSummary();
    this.escape.active = false;
    this.audio?.stopLoop('boss');
    this.audio?.stopLoop('engine');
    this.audio?.play('fail', { bus: 'music' });
    this.hud?.setVisible(false);
    this.missionScreen?.showFailed(this.summary, this.failureReason);
    this.state.set(GameStates.MISSION_FAILED);
    return this.summary;
  }

  _onPlayerHit(target, amount, headshot, point) {
    this.hud?.hitmark(headshot ? 'headshot' : target?.dead ? 'kill' : 'hit');
    this.audio?.play('hitmarker', { bus: 'ui' });
  }

  _onLootCollected(item) {
    this.hud?.toast(`${item.label}  +$${item.value.toLocaleString()}`, { kind: 'loot' });
    this.audio?.play('loot', { bus: 'ui' });
    this.camera?.addShake(0.05);
    if (item.big && !this.escape.active && !this.escape.complete) this._beginEscape();
  }

  _onObjectiveComplete(obj) {
    this.hud?.toast(`OBJECTIVE COMPLETE — ${obj.text}`, { kind: 'objective', duration: 4 });
    this.audio?.play('objective', { bus: 'ui' });
    this.onObjectiveComplete?.(obj);
  }

  _onAlarm() {
    this.hud?.toast('ALARM — THE WHOLE TRAIN KNOWS YOU ARE HERE', { kind: 'alert', duration: 4 });
    this.audio?.play('alarm', { bus: 'ui' });
  }

  _updateAudio(dt) {
    if (!this.audio) return;
    const intensity = clamp(
      (this.state.is(GameStates.ESCAPE) ? 0.75 : 0.25) +
        this.alerts.level / 220 +
        this.enemies.activeCount / 24 +
        (this.state.is(GameStates.BOSS) ? 0.3 : 0),
      0,
      1
    );
    this.audio.updateMusic(dt, intensity);
    this.audio.setLoopGain('engine', 0.14 + this.train.speedNorm * 0.16);
    this.audio.setLoopGain('wind', this.player.onRoof ? 0.2 : 0.06);
  }

  _drainPlayerEvents() {
    for (const e of this.player.drainEvents()) {
      switch (e.type) {
        case 'jump':
          this.audio?.play('jump');
          this.effects.sim.dustBurst(this.player.pos.x, this.player.pos.y + 0.05, this.player.pos.z, 4, { spreadX: 1.2, size: 0.5 });
          break;
        case 'land':
          if (e.impact > 8) {
            this.camera?.addShake(0.14);
            this.effects.sim.dustBurst(this.player.pos.x, this.player.pos.y + 0.05, this.player.pos.z, 6, { spreadX: 1.8, size: 0.7 });
          }
          this.audio?.play('land');
          break;
        case 'footstep':
          this.audio?.play('footstep');
          break;
        case 'fallOff':
          this.hud?.toast('GRAB THE RAIL — [SPACE]', { kind: 'alert', duration: 2.4 });
          break;
        case 'recovered':
          this.audio?.play('land');
          break;
        case 'climbStart':
          this.audio?.play('climb');
          break;
        case 'dodge':
          this.effects.sim.dustBurst(this.player.pos.x, this.player.pos.y + 0.2, this.player.pos.z, 5, { spreadX: 2, size: 0.6 });
          break;
        case 'hurt':
          this.hud?.flashDamage(e.amount);
          this.audio?.play('hurt', { bus: 'ui' });
          this.camera?.addShake(0.28);
          break;
        case 'death':
          this.audio?.play('fail', { bus: 'music' });
          break;
        default:
          break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // cinematics / mission flow
  // ---------------------------------------------------------------------------

  _updateIntro(dt) {
    this.introTime += dt;
    const t = this.introTime;
    const rear = this.train.rearX;

    if (this.introStage === 0) {
      this.introStage = 1;
      // the outlaw rides alongside the caboose, waiting for the leap
      this.player.invulnerable = true;
      this.player.climbing = false;
      this.player.pos.x = rear - 7;
      this.player.pos.y = 1.1;
      this.player.pos.z = 4.8;
      this.player.vel.x = 0;
      this.player.vel.y = 0;
      this.player.vel.z = 0;
      this.player.yaw = 0;
      this.camera.playShot(
        {
          pos: (p) => ({ x: rear - 22 - p * 10, y: 5.4 - p * 1.2, z: 15 - p * 3 }),
          look: (p) => ({ x: rear + 2 + p * 8, y: 2.6, z: 0 }),
          fov: 38,
        },
        4.0,
        { blend: 1.2 }
      );
      this.hud?.toast('THE 5:12 TO SANTA ROSA', { kind: 'info', duration: 3.4 });
    }

    if (this.introStage === 1 && t > 4.0) {
      this.introStage = 2;
      // the leap: forward onto the caboose platform
      this.player.pos.x = rear - 4.2;
      this.player.pos.y = 1.5;
      this.player.pos.z = 3.2;
      this.player.vel.x = 9.5;
      this.player.vel.y = 5.6;
      this.player.vel.z = -4.0;
      this.audio?.play('jump');
      this.camera.playShot(
        {
          pos: { x: rear - 12, y: 3.4, z: 9 },
          look: (p) => ({ x: rear + 1 + p * 4, y: 1.8, z: 0 }),
          fov: 44,
        },
        3.2,
        { blend: 0.5 }
      );
    }

    if (this.introStage === 2 && t > 7.2) {
      this.introStage = 3;
      const spawn = this._boardingSpawn();
      this.player.pos.x = spawn.x;
      this.player.pos.y = spawn.y;
      this.player.pos.z = spawn.z;
      this.player.vel.x = 0;
      this.player.vel.y = 0;
      this.player.vel.z = 0;
      this.player.maxProgressX = spawn.x;
      this.player.invulnerable = false;
      this.player.setState('land', 0.25);
      this.objectives.complete('board');
      this.state.set(GameStates.PLAYING);
      this.hud?.toast('WASD MOVE · MOUSE AIM · LMB SHOOT · E INTERACT · R RELOAD', { kind: 'info', duration: 7 });
    }
  }

  _revealTreasure() {
    const item = this.lootSystem.spawnTreasure();
    if (!item) return null;
    this.hud?.toast('THE PAYROLL — TAKE IT', { kind: 'objective', duration: 5 });
    this.view?.buildLoot({ items: [item] });
    return item;
  }

  _onBossDefeated() {
    this.hud?.toast('ELITE GUARD DOWN', { kind: 'objective' });
    this.audio?.stopLoop('boss');
    this.alerts.addFlat(-60);
    this.objectives.complete('boss');
    this.vaultArmed = true;
    this.hud?.toast('VAULT UNLOCKED — PRESS [E] AT THE DOOR', { kind: 'objective', duration: 6 });
  }

  _onVaultOpened() {
    this.objectives.complete('vault');
    if (!this.lootSystem.treasure) this._revealTreasure();
  }

  _beginEscape() {
    if (this.escape.active || this.escape.complete) return false;
    this.escape.start();
    this.state.set(GameStates.ESCAPE);
    this.hud?.toast('ESCAPE! GET OFF THE TRAIN!', { kind: 'alert', duration: 5 });
    return true;
  }

  _onEscapeComplete() {
    this.summary = this._buildSummary();
    this.hud?.setVisible(false);
    this.audio?.stopLoop('engine');
    this.audio?.stopLoop('wind');
    this.audio?.stopLoop('boss');
    this.audio?.play('jackpot', { bus: 'music' });
    this.missionScreen?.showComplete(this.summary);
    this.state.set(GameStates.MISSION_COMPLETE);
    return this.summary;
  }

  _buildSummary() {
    const summary = this.damage.computeScore({
      loot: Math.round(this.player.loot),
      timeTaken: this.runTime,
      alerted: this.alerts.everMaxed,
      healthPercent: this.player.health / this.player.maxHealth,
    });
    summary.flawless = this.player.health >= this.player.maxHealth * 0.95 && !this.alerts.everMaxed;
    summary.headshots = this.damage.stats.headshots;
    summary.stealthKills = this.damage.stats.stealthKills;
    summary.explosions = this.damage.stats.explosions;
    summary.damageTaken = Math.round(this.damage.stats.damageTaken);
    return summary;
  }

  // ---------------------------------------------------------------------------
  // debug tools (F1..F5)
  // ---------------------------------------------------------------------------

  _handleDebugKeys() {
    const input = this.input;
    if (input.wasPressed('debug1')) this.debug.enabled = !this.debug.enabled;
    if (!this.debug.enabled) return;
    if (input.wasPressed('debug2')) this.debugSkipCar();
    if (input.wasPressed('debug3')) {
      const spawned = this.enemies.spawnReinforcements(this.player, 3);
      for (const e of spawned) this.spawnEnemyView(e);
    }
    if (input.wasPressed('debug4')) {
      this.debug.invincible = !this.debug.invincible;
      this.player.invulnerable = this.debug.invincible;
    }
    if (input.wasPressed('debug5')) this.debug.showFps = !this.debug.showFps;
  }

  /** F2 - hop forward to the next car (development helper). */
  debugSkipCar() {
    const car = this.train.carAt(this.player.pos.x);
    const next = this.train.cars[Math.max(0, car.index - 2)];
    if (!next) return;
    this.player.pos.x = next.x0 + next.length * 0.5;
    this.player.pos.z = 0;
    this.player.pos.y = next.hasRoof ? next.roofSurfaceY + 0.05 : next.floorSurfaceY + 0.05;
    this.player.vel.x = 0;
    this.player.vel.y = 0;
    this.player.vel.z = 0;
    this.player.maxProgressX = Math.max(this.player.maxProgressX, this.player.pos.x);
    this.hud?.toast(`DEBUG: CAR ${next.index} — ${next.name}`, { kind: 'info', duration: 2 });
  }

  dispose() {
    this.loop.stop();
    if (typeof window !== 'undefined') window.removeEventListener('resize', this.boundResize);
    this.audio?.dispose();
  }
}

/** Slow drifting shot used behind the main menu. */
function menuFraming(distance) {
  const angle = distance * 0.045;
  const radius = 46;
  return {
    camX: 62 + Math.cos(angle) * radius,
    camY: 12.5 + Math.sin(angle * 0.7) * 1.8,
    camZ: 26 + Math.sin(angle) * radius * 0.6,
    lookX: 68,
    lookY: 4.4,
    lookZ: 0,
  };
}

export default Game;
