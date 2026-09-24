// -----------------------------------------------------------------------------
// HUD - health, ammo, objectives, loot, alert meter, prompts, boss bar,
// hazard warnings, toasts, damage vignette and the debug overlay.
// Pure DOM (no canvas) so it scales cleanly at every resolution.
// -----------------------------------------------------------------------------
import { el, clear, hasDOM } from './DOM.js';
import { formatMoney, formatTime, formatNumber } from '../utils/MathUtils.js';

export class HUD {
  constructor(root, { onPause = null } = {}) {
    this.root = root;
    this.onPause = onPause;
    this.visible = false;
    this.lastObjective = '';
    this.lastLoot = -1;
    this.lastAmmo = -1;
    this.toasts = [];
    this.hitmarkerTime = 0;
    this.damageFlash = 0;
    this.warningTime = 0;
    if (!hasDOM() || !root) return;
    this._build();
  }

  _build() {
    this.container = el('div', { className: 'hud hidden' });
    this.root.appendChild(this.container);

    // --- top left: health + ammo --------------------------------------------
    const left = el('div', { className: 'hud-corner hud-topleft' });
    const healthBlock = el('div', { className: 'hud-block' });
    this.healthLabel = el('div', { className: 'hud-label', text: 'HEALTH' });
    this.healthBarOuter = el('div', { className: 'bar bar-health' });
    this.healthBar = el('div', { className: 'bar-fill' });
    this.healthBarOuter.appendChild(this.healthBar);
    this.healthValue = el('div', { className: 'hud-value', text: '100' });
    healthBlock.append(this.healthLabel, this.healthBarOuter, this.healthValue);

    const ammoBlock = el('div', { className: 'hud-block' });
    this.ammoLabel = el('div', { className: 'hud-label', text: 'PEACEMAKER' });
    this.ammoValue = el('div', { className: 'hud-ammo', text: '06 / 60' });
    this.reloadHint = el('div', { className: 'hud-hint hidden', text: '[R] RELOAD' });
    ammoBlock.append(this.ammoLabel, this.ammoValue, this.reloadHint);
    left.append(healthBlock, ammoBlock);

    // --- top center: objective ----------------------------------------------
    const center = el('div', { className: 'hud-topcenter' });
    this.objectiveLabel = el('div', { className: 'hud-label', text: 'OBJECTIVE' });
    this.objectiveText = el('div', { className: 'hud-objective', text: 'BOARD THE TRAIN' });
    center.append(this.objectiveLabel, this.objectiveText);

    // --- top right: loot + alert + map --------------------------------------
    const right = el('div', { className: 'hud-corner hud-topright' });
    this.lootValue = el('div', { className: 'hud-loot', text: '$0' });
    const lootBlock = el('div', { className: 'hud-block right' });
    lootBlock.append(el('div', { className: 'hud-label', text: 'LOOT' }), this.lootValue);
    const alertBlock = el('div', { className: 'hud-block right' });
    this.alertBarOuter = el('div', { className: 'bar bar-alert' });
    this.alertBar = el('div', { className: 'bar-fill alert-fill' });
    this.alertBarOuter.appendChild(this.alertBar);
    this.alertTier = el('div', { className: 'hud-hint', text: 'CALM' });
    alertBlock.append(el('div', { className: 'hud-label', text: 'ALERT' }), this.alertBarOuter, this.alertTier);
    this.mapEl = el('div', { className: 'hud-map' });
    right.append(lootBlock, alertBlock, this.mapEl);

    // --- center: crosshair + hitmarker --------------------------------------
    this.crosshair = el('div', { className: 'crosshair' });
    this.crosshair.dot = el('div', { className: 'crosshair-dot' });
    this.crosshair.append(
      this.crosshair.dot,
      el('div', { className: 'cross-h' }),
      el('div', { className: 'cross-v' }),
      el('div', { className: 'cross-ring' })
    );
    this.hitmarker = el('div', { className: 'hitmarker hidden' });

    // --- bottom center: prompts ---------------------------------------------
    this.prompt = el('div', { className: 'hud-prompt hidden' });
    this.subPrompt = el('div', { className: 'hud-subprompt hidden' });

    // --- boss bar ------------------------------------------------------------
    this.bossBar = el('div', { className: 'bossbar hidden' });
    this.bossName = el('div', { className: 'boss-name', text: 'ELITE GUARD' });
    this.bossBarOuter = el('div', { className: 'bar bar-boss' });
    this.bossFill = el('div', { className: 'bar-fill' });
    this.bossBarOuter.appendChild(this.bossFill);
    this.bossBar.append(this.bossName, this.bossBarOuter);

    // --- hazard warning -----------------------------------------------------
    this.warning = el('div', { className: 'hud-warning hidden' });

    // --- toasts -------------------------------------------------------------
    this.toastBox = el('div', { className: 'hud-toasts' });

    // --- overlays -----------------------------------------------------------
    this.vignette = el('div', { className: 'vignette hidden' });
    this.damageOverlay = el('div', { className: 'damage-overlay' });
    this.escapeBanner = el('div', { className: 'escape-banner hidden' });

    // --- debug --------------------------------------------------------------
    this.debug = el('div', { className: 'hud-debug hidden' });

    this.container.append(
      left,
      center,
      right,
      this.crosshair,
      this.hitmarker,
      this.prompt,
      this.subPrompt,
      this.bossBar,
      this.warning,
      this.toastBox,
      this.escapeBanner,
      this.damageOverlay,
      this.vignette,
      this.debug
    );
    this._buildMap();
  }

  _buildMap() {
    this.mapCars = [];
    if (!this.mapEl) return;
    clear(this.mapEl);
    this.mapEl.append(el('div', { className: 'hud-label', text: 'TRAIN' }));
    this.mapStrip = el('div', { className: 'map-strip' });
    this.mapEl.append(this.mapStrip);
    this.mapPlayer = el('div', { className: 'map-player' });
    this.mapStrip.append(this.mapPlayer);
  }

  setVisible(visible) {
    this.visible = visible;
    if (this.container) this.container.classList.toggle('hidden', !visible);
  }

  /** Builds the train strip once the train exists. */
  buildMap(train) {
    if (!this.mapStrip || !train) return;
    for (const car of train.cars) {
      const w = Math.max(8, (car.length / train.length) * 100);
      const div = el('div', {
        className: `map-car map-car-${car.type}`,
        attrs: { title: `${car.index}. ${car.name}` },
      });
      div.style.width = `${w}%`;
      this.mapCars.push({ car, div });
      this.mapStrip.insertBefore(div, this.mapPlayer);
    }
  }

  update(game) {
    if (!this.container || !this.visible) return;
    const player = game.player;
    const stats = game.damage?.stats;

    // health
    const hp = Math.max(0, player.health) / player.maxHealth;
    this.healthBar.style.width = `${hp * 100}%`;
    this.healthBar.style.background = hp > 0.5 ? 'linear-gradient(90deg,#7ec850,#c8e05a)' : hp > 0.25 ? 'linear-gradient(90deg,#e0a83c,#f0c850)' : 'linear-gradient(90deg,#c0392b,#e0503a)';
    this.healthValue.textContent = `${Math.ceil(Math.max(0, player.health))}`;
    this.vignette.classList.toggle('hidden', hp > 0.34);
    this.vignette.style.opacity = `${Math.min(0.85, (0.34 - hp) * 2.2)}`;

    // ammo
    const ammo = player.weapon;
    const ammoText = `${String(ammo.ammo).padStart(2, '0')} / ${String(ammo.reserve).padStart(2, '0')}`;
    if (ammoText !== this.lastAmmo) {
      this.ammoValue.textContent = ammoText;
      this.lastAmmo = ammoText;
    }
    this.ammoValue.classList.toggle('low', ammo.ammo <= 1);
    this.reloadHint.classList.toggle('hidden', !(ammo.ammo === 0 || ammo.reloading));
    this.reloadHint.textContent = ammo.reloading ? 'RELOADING…' : '[R] RELOAD';

    // objective
    const text = game.objectives?.currentText ?? '';
    if (text !== this.lastObjective) {
      this.objectiveText.textContent = text;
      this.objectiveText.classList.remove('pulse');
      void this.objectiveText.offsetWidth;
      this.objectiveText.classList.add('pulse');
      this.lastObjective = text;
    }

    // loot
    const loot = Math.round(player.loot);
    if (loot !== this.lastLoot) {
      this.lootValue.textContent = formatMoney(loot);
      this.lastLoot = loot;
    }

    // alert
    const alertLevel = game.alerts ? game.alerts.level / game.alerts.max : 0;
    this.alertBar.style.width = `${alertLevel * 100}%`;
    this.alertTier.textContent = game.alerts?.tierName ?? '';
    this.alertTier.classList.toggle('hot', alertLevel > 0.65);

    // prompt
    const prompt = game.lootSystem?.prompt;
    if (prompt && game.state.controllable) {
      this.prompt.textContent = `[E] ${prompt.label}`;
      this.prompt.classList.remove('hidden');
    } else {
      this.prompt.classList.add('hidden');
    }
    if (player.canRecover && !player.dead) {
      this.subPrompt.textContent = '[SPACE] GRAB THE RAIL!';
      this.subPrompt.classList.remove('hidden');
    } else if (game.player?.climbing) {
      this.subPrompt.textContent = 'W / S TO CLIMB';
      this.subPrompt.classList.remove('hidden');
    } else {
      this.subPrompt.classList.add('hidden');
    }

    // boss bar
    const bossFight = game.bossFight;
    if (bossFight?.boss && bossFight.active && !bossFight.boss.dead) {
      this.bossBar.classList.remove('hidden');
      const pct = Math.max(0, bossFight.boss.health / bossFight.boss.maxHealth);
      this.bossFill.style.width = `${pct * 100}%`;
      this.bossName.textContent = `${bossFight.boss.def.label} — PHASE ${phaseNumber(bossFight.phase)}`;
    } else {
      this.bossBar.classList.add('hidden');
    }

    // hazard warning
    const warn = game.hazards?.warning;
    if (warn) {
      this.warning.classList.remove('hidden');
      this.warning.textContent = warn.text;
      this.warning.classList.toggle('blink', warn.duration - warn.t < 1.2);
    } else {
      this.warning.classList.add('hidden');
    }

    // escape banner
    if (game.escape?.active && game.escape.banner) {
      this.escapeBanner.classList.remove('hidden');
      this.escapeBanner.textContent = game.escape.banner;
    } else if (game.vault?.banner) {
      this.escapeBanner.classList.remove('hidden');
      this.escapeBanner.textContent = game.vault.banner;
    } else {
      this.escapeBanner.classList.add('hidden');
    }

    // hitmarker
    this.hitmarkerTime = Math.max(0, this.hitmarkerTime - (1 / 60));
    this.hitmarker.classList.toggle('hidden', this.hitmarkerTime <= 0);

    // damage / heal feedback
    this.damageFlash = Math.max(0, this.damageFlash - 0.03);
    this.damageOverlay.style.opacity = `${Math.min(0.6, this.damageFlash)}`;

    // toasts
    this._updateToasts();

    // train map
    this._updateMap(game);

    // debug
    if (game.debug?.enabled) {
      this.debug.classList.remove('hidden');
      const lines = [
        `FPS ${game.loop?.fps?.toFixed(0) ?? '--'}`,
        `T ${formatTime(game.runTime)}`,
        `POS ${player.pos.x.toFixed(1)} ${player.pos.y.toFixed(1)} ${player.pos.z.toFixed(1)}`,
        `CAR ${game.train.carIndexAt(player.pos.x)}/${game.train.cars.length} ${game.train.carAt(player.pos.x).type}`,
        `STATE ${game.state.current} / ${player.state}`,
        `ENEMIES ${game.enemies.activeCount} (${game.enemies.totalKilled} killed)`,
        `SHOTS ${stats?.shotsFired ?? 0} HITS ${stats?.shotsHit ?? 0} (${((stats?.shotsHit ?? 0) / Math.max(1, stats?.shotsFired ?? 1) * 100).toFixed(0)}%)`,
        `PARTS ${game.debug.partCount} PARTICLES ${game.debug.particleCount}`,
        `DIST ${game.environment.distance.toFixed(0)} ALERT ${game.alerts.level.toFixed(0)}`,
        `SPEED ${game.train.speed.toFixed(1)}`,
        `INVULN ${game.debug.invincible ? 'ON' : 'OFF'}`,
      ];
      this.debug.textContent = lines.join('\n');
    } else {
      this.debug.classList.add('hidden');
    }
  }

  _updateMap(game) {
    if (!this.mapStrip) return;
    const track = game.environment?.rng ? null : null;
    const train = game.train;
    for (const entry of this.mapCars) {
      const car = entry.car;
      entry.div.classList.toggle('active', game.player.pos.x >= car.x0 && game.player.pos.x <= car.x1);
      entry.div.classList.toggle('cleared', game.enemies?.spawnedCars?.has(car.index) && !game.enemies.enemies.some((e) => e.car === car && !e.dead));
    }
    const ratio = (game.player.pos.x - train.rearX) / train.length;
    this.mapPlayer.style.left = `${Math.max(0, Math.min(99, ratio * 100))}%`;
  }

  _updateToasts() {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.t += 1 / 60;
      if (t.t > t.duration) {
        t.node.remove();
        this.toasts.splice(i, 1);
      } else {
        t.node.style.opacity = `${Math.min(1, (t.duration - t.t) / 0.6)}`;
      }
    }
  }

  toast(text, { duration = 3.4, kind = 'info' } = {}) {
    if (!this.toastBox) return;
    const node = el('div', { className: `toast toast-${kind}`, text });
    this.toastBox.append(node);
    this.toasts.push({ node, t: 0, duration });
    if (this.toasts.length > 4) {
      const old = this.toasts.shift();
      old.node.remove();
    }
  }

  hitmark(kind = 'hit') {
    this.hitmarkerTime = 0.18;
    if (this.hitmarker) {
      this.hitmarker.className = `hitmarker ${kind === 'kill' ? 'kill' : kind === 'headshot' ? 'headshot' : ''}`;
    }
  }

  flashDamage(amount) {
    this.damageFlash = Math.min(0.65, this.damageFlash + amount / 60);
  }

  dispose() {
    this.container?.remove();
  }
}

function phaseNumber(phase) {
  switch (phase) {
    case 'phase1':
      return 1;
    case 'phase2':
      return 2;
    case 'phase3':
      return 3;
    case 'phase4':
      return 4;
    default:
      return 1;
  }
}

export default HUD;
