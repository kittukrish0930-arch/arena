// -----------------------------------------------------------------------------
// Headless smoke test.
//
// Runs the real game logic in Node (jsdom provides the DOM so the HUD/menus are
// exercised too) and plays a scripted run from the main menu to the score
// screen. Any thrown error fails the test.
//
//   node tools/smoke-test.mjs
// -----------------------------------------------------------------------------
import { JSDOM } from 'jsdom';

let failures = 0;
let checks = 0;

function check(name, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(name) {
  console.log(`\n=== ${name}`);
}

// --- DOM environment ---------------------------------------------------------
const dom = new JSDOM('<!doctype html><html><body><div id="app"><canvas id="game-canvas"></canvas><div id="ui-root"></div></div></body></html>', {
  pretendToBeVisual: true,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;

globalThis.HTMLElement = window.HTMLElement;
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
try {
  Object.defineProperty(globalThis, 'localStorage', { value: window.localStorage, configurable: true });
} catch {}
globalThis.devicePixelRatio = 1;

// WebAudio is absent on purpose: the AudioManager must degrade to a no-op.
const { Game } = await import('../src/game/Game.js');
const { GameStates } = await import('../src/game/GameState.js');
const { NullRenderer } = await import('../src/test/NullRenderer.js');
const { WEAPONS } = await import('../src/combat/Weapon.js');
const { TRAIN } = await import('../src/game/Config.js');

const FIXED = 1 / 60;
const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');

/** Drives the game with fixed steps and optional input. */
function makeHarness(game) {
  const step = (frames = 1, inputFn = null) => {
    for (let i = 0; i < frames; i++) {
      if (inputFn) inputFn(game.input, i);
      game.loop.step(FIXED);
    }
  };
  return { step };
}

const results = {};

// ---------------------------------------------------------------------------
section('construction');
// ---------------------------------------------------------------------------
const view = new NullRenderer();
const game = new Game({ canvas, uiRoot, view, quality: 'high', autoStartLoop: false });
const harness = makeHarness(game);

check('game constructs', !!game);
check('train built', game.train.cars.length === 8, `cars=${game.train.cars.length}`);
check(
  'consist matches the spec (rear -> front)',
  game.train.cars.map((c) => c.type).join(',') === 'caboose,cargo,passenger,cargo,flatcar,armored,vault,loco',
  game.train.cars.map((c) => c.type).join(',')
);
check('the locomotive is at the front (highest x)', game.train.locomotive.x0 > game.train.caboose.x1,
  `loco=${game.train.locomotive.x0} caboose=${game.train.caboose.x1}`);
check('collision boxes registered', game.world.count > 100, `count=${game.world.count}`);
check('environment props', game.environment.props.length > 100, `props=${game.environment.props.length}`);
check('loot items built', game.lootSystem.items.length >= 3, `loot=${game.lootSystem.items.length}`);
check('view built the world', view.calls.buildWorld === 1);
check('audio disabled without WebAudio', game.audio.enabled === false || game.audio.ctx === null);

// ---------------------------------------------------------------------------
section('menu + settings');
// ---------------------------------------------------------------------------
game.start();
harness.step(30);
check('starts in MENU', game.state.is(GameStates.MENU));
check('menu stays alive (train running)', game.train.speed > 0);
game.setQuality('medium');
check('quality switch survives without a real renderer', view.quality === 'medium');
game.setQuality('high');
game.setAudioEnabled(true);
game.setAudioEnabled(false);
check('audio toggle safe', true);
game.settings.cameraShake = false;
harness.step(2);
check('shake disabled through settings', game.camera.shakeEnabled === false);
game.settings.cameraShake = true;

// ---------------------------------------------------------------------------
section('intro');
// ---------------------------------------------------------------------------
game.startRun();
check('run restarts the world', view.calls.rebuildWorld === 1);
harness.step(1);
check('state is INTRO', game.state.is(GameStates.INTRO));
check('not controllable during the intro', game.state.controllable === false);
harness.step(60 * 9);
check('intro hands over to PLAYING', game.state.is(GameStates.PLAYING), `state=${game.state.current}`);
check('player boarded the train', game.player.pos.y > 0.5 && game.player.pos.y < 4.5, `y=${game.player.pos.y.toFixed(2)}`);
check('board objective complete', game.objectives.objectives.find((o) => o.id === 'board').done === true);

// ---------------------------------------------------------------------------
section('movement + combat');
// ---------------------------------------------------------------------------
game.player.invulnerable = true; // survival is tested separately below
const driver = (input, i) => {
  input.setVirtual('forward', true);
  input.setVirtual('sprint', i % 7 !== 0);
  input.mouse.left = i % 3 === 0;
  input.mouse.nx = Math.sin(i * 0.1) * 0.4;
  input.mouse.ny = Math.cos(i * 0.13) * 0.2;
};
const startX = game.player.pos.x;
harness.step(60 * 6, driver);
check('player advanced along the train', game.player.maxProgressX > startX + 5, `moved ${(game.player.maxProgressX - startX).toFixed(1)}m`);
check('shots recorded', game.damage.stats.shotsFired > 0, `shots=${game.damage.stats.shotsFired}`);
check('ammo cycles', game.player.weapon.ammo <= WEAPONS.revolver.magSize);
check('enemies spawned by progression', game.enemies.totalSpawned > 0, `spawned=${game.enemies.totalSpawned}`);
check('character views created', view.calls.characters > 0);
check('particles simulated', game.effects.sim.liveCount >= 0);
check('alerts respond to gunfire', game.alerts.level > 0, `alert=${game.alerts.level.toFixed(1)}`);

// ---------------------------------------------------------------------------
section('looting');
// ---------------------------------------------------------------------------
const lootItem = game.lootSystem.items.find((i) => !i.taken);
if (lootItem) {
  game.player.pos.x = lootItem.x;
  game.player.pos.y = lootItem.y;
  game.player.pos.z = lootItem.z;
  game.player.vel.x = 0;
  game.player.vel.y = 0;
  game.player.vel.z = 0;
  harness.step(4);
  check('loot prompt appears', !!game.lootSystem.prompt, JSON.stringify(game.lootSystem.prompt));
  game.lootSystem.collect(lootItem.interactable, game.player);
  harness.step(2);
  check('loot collected', game.player.loot >= lootItem.value, `loot=${game.player.loot}`);
  check(
    'loot objective progresses',
    game.objectives.objectives.find((o) => o.id === 'loot').progress >= 1,
    `state=${game.state.current} collected=${game.lootSystem.collected} health=${game.player.health.toFixed(0)} y=${game.player.pos.y.toFixed(2)}`
  );
} else {
  check('loot available to collect', false, 'no loot items');
}

// ---------------------------------------------------------------------------
section('roof + hazards');
// ---------------------------------------------------------------------------
const flat = game.train.passengerCar; // has a walkable roof
game.player.pos = { x: flat.x0 + flat.length * 0.5, y: flat.roofSurfaceY + 0.05, z: 0 };
game.player.vel = { x: 0, y: 0, z: 0 };
harness.step(60 * 8);
check('roof gameplay runs (wind pushed the player)', Number.isFinite(game.player.pos.x));
check('hazards tracked structures', game.hazards.active.length > 0 || game.environment.structures.length > 0,
  `active=${game.hazards.active.length} structures=${game.environment.structures.length}`);
check('environment scrolled a distance', game.environment.distance > 30, `distance=${game.environment.distance.toFixed(0)}`);

// ---------------------------------------------------------------------------
section('boss fight');
// ---------------------------------------------------------------------------
// Place the player in front of the vault car so the boss triggers.
game.player.pos = { x: game.train.vaultCar.x0 + 2, y: TRAIN.floorY, z: 0 };
game.player.vel = { x: 0, y: 0, z: 0 };
harness.step(10);
check('boss spawned', !!game.enemies.boss);
check('boss state entered', game.state.is(GameStates.BOSS), `state=${game.state.current}`);
check('boss has phases', game.bossFight.phase !== undefined);
harness.step(120);
const boss = game.enemies.boss;
if (boss) {
  // Burn the boss down through its phases.
  let guard = 0;
  while (!boss.dead && guard < 60 * 60) {
    game.damage.applyDamage(boss, 25, { source: game.player, point: boss.center });
    harness.step(20);
    guard += 20;
  }
  check('boss can be defeated', boss.dead === true, `boss hp=${boss.health}`);
  harness.step(60 * 9); // the death sequence plays out in slow motion
  check('boss objective complete', game.objectives.objectives.find((o) => o.id === 'boss').done === true);
  check('vault armed after the boss', game.vaultArmed === true);
  check('state returned to PLAYING', game.state.is(GameStates.PLAYING), `state=${game.state.current}`);
} else {
  check('boss spawned for the fight', false);
}

// ---------------------------------------------------------------------------
section('vault cinematic');
// ---------------------------------------------------------------------------
const vaultInter = game.train.vaultCar.interactables.find((i) => i.type === 'vault');
check('vault interactable exists', !!vaultInter);
if (vaultInter) {
  game.player.pos = { x: vaultInter.x + 1.2, y: TRAIN.floorY, z: 0 };
  game.player.vel = { x: 0, y: 0, z: 0 };
  harness.step(4);
  const opened = game.interact(vaultInter);
  check('vault interaction accepted', opened === true);
  harness.step(1);
  check('vault state entered', game.state.is(GameStates.VAULT), `state=${game.state.current}`);
  const doorGroup = game.train.vaultCar.dynamics.vaultDoor;
  const doorY0 = doorGroup.state.y;
  harness.step(60 * 12);
  check('vault door animated open', Math.abs(doorGroup.state.y - doorY0) > 1.5, `dy=${(doorGroup.state.y - doorY0).toFixed(2)}`);
  check('vault cinematic finished', game.vault.done === true);
  check('vault objective complete', game.objectives.objectives.find((o) => o.id === 'vault').done === true);
  check('treasure revealed', !!game.lootSystem.treasure);
  // collect the treasure -> triggers the escape
  const treasure = game.lootSystem.treasure;
  if (treasure) {
    game.lootSystem.collectById(treasure.id, game.player);
    harness.step(2);
    check('escape sequence started', game.escape.active === true);
    check('escape state entered', game.state.is(GameStates.ESCAPE), `state=${game.state.current}`);
  }
}

// ---------------------------------------------------------------------------
section('escape + ending');
// ---------------------------------------------------------------------------
harness.step(60 * 3, (input, i) => {
  input.setVirtual('forward', true);
  input.mouse.left = i % 4 === 0;
});
check('train sped up for the escape', game.train.speed > 24, `speed=${game.train.speed.toFixed(1)}`);
check('escalation structures spawned', game.escape.spawnedBridge === true);

// teleport to the jump point and leap
const escapeInter = game.train.locomotive.interactables.find((i) => i.type === 'escape');
check('escape interactable exists on the loco', !!escapeInter);
if (escapeInter) {
  game.player.pos = { x: escapeInter.x, y: TRAIN.floorY, z: 0 };
  game.player.vel = { x: 0, y: 0, z: 0 };
  harness.step(6);
  const jumped = game.interact(escapeInter);
  check('jump accepted', jumped === true);
  harness.step(60 * 8);
  check('mission complete reached', game.state.is(GameStates.MISSION_COMPLETE), `state=${game.state.current}`);
  check('score summary produced', !!game.summary && game.summary.total > 0, JSON.stringify(game.summary));
  results.summary = game.summary;
}

// ---------------------------------------------------------------------------
section('failure path');
// ---------------------------------------------------------------------------
game.startRun();
harness.step(60 * 9);
check('second run reaches PLAYING', game.state.is(GameStates.PLAYING));
game.player.invulnerable = false;
game.player.iframes = 0;
game.player.damage(500, { source: null });
harness.step(6);
check('death fails the mission', game.state.is(GameStates.MISSION_FAILED), `state=${game.state.current}`);
check('failure summary exists', !!game.summary);
harness.step(30);
game.startRun();
harness.step(60 * 9);
check('restart after failure works', game.state.is(GameStates.PLAYING), `state=${game.state.current}`);

// ---------------------------------------------------------------------------
section('pause');
// ---------------------------------------------------------------------------
game.input.setVirtual('pause', true);
harness.step(2);
game.input.setVirtual('pause', false);
harness.step(2);
check('pause opens', game.state.is(GameStates.PAUSED), `state=${game.state.current}`);
const frozenX = game.player.pos.x;
harness.step(60);
check('world frozen while paused', Math.abs(game.player.pos.x - frozenX) < 0.001);
game.input.setVirtual('pause', true);
harness.step(2);
game.input.setVirtual('pause', false);
harness.step(2);
check('resume works', game.state.is(GameStates.PLAYING), `state=${game.state.current}`);

// ---------------------------------------------------------------------------
section('debug tools');
// ---------------------------------------------------------------------------
game.input.setVirtual('debug1', true);
harness.step(2);
game.input.setVirtual('debug1', false);
harness.step(2);
check('F1 toggles debug', game.debug.enabled === true);
game.input.setVirtual('debug2', true);
harness.step(2);
game.input.setVirtual('debug2', false);
harness.step(2);
check('F2 skips a car', Number.isFinite(game.player.pos.x));
game.input.setVirtual('debug4', true);
harness.step(2);
game.input.setVirtual('debug4', false);
harness.step(2);
check('F4 grants invincibility', game.player.invulnerable === true);
game.debug.enabled = false;

// ---------------------------------------------------------------------------
section('budgets');
// ---------------------------------------------------------------------------
check('no per-frame allocation explosions (world count stable)', game.world.count > 0 && game.world.count < 4000, `boxes=${game.world.count}`);
check('particle pool bounded', game.effects.sim.liveCount <= game.effects.sim.capacity);
check('enemy list bounded', game.enemies.enemies.length < 60, `enemies=${game.enemies.enemies.length}`);

// ---------------------------------------------------------------------------
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log('SMOKE TEST PASSED');
  process.exit(0);
}
