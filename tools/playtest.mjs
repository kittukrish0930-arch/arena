// -----------------------------------------------------------------------------
// Playtest probe: a simple bot plays the run without invulnerability so the
// difficulty curve can be measured (health, kills, progress, objective flow).
//
//   node tools/playtest.mjs
// -----------------------------------------------------------------------------
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><canvas id="game-canvas"></canvas><div id="ui-root"></div></body></html>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
const { Game } = await import('../src/game/Game.js');
const { NullRenderer } = await import('../src/test/NullRenderer.js');

const g = new Game({ canvas: document.getElementById('game-canvas'), uiRoot: document.getElementById('ui-root'), view: new NullRenderer(), autoStartLoop: false });
const step = () => g.loop.step(1 / 60);

g.start();
for (let i = 0; i < 20; i++) step();
g.startRun();
for (let i = 0; i < 60 * 9; i++) step(); // intro

// The probe drives the aim directly: the controller would otherwise overwrite it
// from the (nonexistent) mouse position.
const botAim = { active: false, dir: { x: 1, y: 0, z: 0 } };
const originalAim = g.controller._updateAim.bind(g.controller);
g.controller._updateAim = function patchedAim() {
  if (!botAim.active) return originalAim();
  const p = this.player;
  p.aimDir.x = botAim.dir.x;
  p.aimDir.y = botAim.dir.y;
  p.aimDir.z = botAim.dir.z;
  p.aimPitch = Math.asin(Math.max(-1, Math.min(1, botAim.dir.y))) * 0.9;
  p.facing = botAim.dir.x >= 0 ? 1 : -1;
  return p.aimDir;
};

let minHealth = 100;
let t = 0;
const log = [];
while (t < 60 * 5 * 60 && !g.state.is('mission_complete', 'mission_failed')) {
  // --- bot brain -------------------------------------------------------------
  const p = g.player;
  const enemies = g.enemies.enemies.filter((e) => !e.dead);
  let nearest = null;
  let nd = Infinity;
  for (const e of enemies) {
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
    if (d < nd) {
      nd = d;
      nearest = e;
    }
  }
  const car = g.train.carAt(p.pos.x);
  // walk forward towards the locomotive
  g.input.setVirtual('forward', p.pos.x < g.train.frontX - 12 && (!nearest || nd > 5.5));
  g.input.setVirtual('back', !!nearest && nd < 3 && p.pos.x > g.train.rearX + 4 && p.health < 45);
  g.input.setVirtual('interact', !!g.lootSystem.prompt);
  g.input.setVirtual('sprint', false);
  if (nearest && nd < 32) {
    // aim at the head and only fire with a clear line
    const c = nearest.head;
    const m = g.combat.muzzlePosition();
    const hasLos = g.world.lineOfSight(m.x, m.y, m.z, c.x, c.y, c.z, p);
    let dx = c.x - p.pos.x;
    let dy = c.y - (p.pos.y + 1.2);
    let dz = c.z - p.pos.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    botAim.active = true;
    botAim.dir.x = dx / l; botAim.dir.y = dy / l; botAim.dir.z = dz / l;
    g.input.mouse.left = hasLos;
  } else {
    botAim.active = false;
    g.input.mouse.left = false;
  }
  step();
  t++;
  minHealth = Math.min(minHealth, p.health);
  if (t % 600 === 0) {
    log.push(
      `t=${(t / 60).toFixed(0)}s x=${p.pos.x.toFixed(0)} hp=${p.health.toFixed(0)} y=${p.pos.y.toFixed(2)} ` +
      `enemies=${enemies.length} kills=${g.enemies.totalKilled} loot=$${p.loot} alert=${g.alerts.level.toFixed(0)} state=${g.state.current} obj="${g.objectives.currentText}"`
    );
  }
}
console.log(log.join('\n'));
console.log(`\nend: state=${g.state.current} time=${(t / 60).toFixed(1)}s hp=${g.player.health.toFixed(0)} minHp=${minHealth.toFixed(0)} kills=${g.enemies.totalKilled} loot=$${g.player.loot}`);
console.log('objectives:', g.objectives.objectives.map((o) => `${o.id}${o.done ? '✓' : o.target ? `(${o.progress}/${o.target})` : ''}`).join(' '));
console.log('damage taken', g.damage.stats.damageTaken.toFixed(0), 'shots', g.damage.stats.shotsFired, 'accuracy', (g.damage.accuracy * 100).toFixed(0) + '%');
process.exit(0);
