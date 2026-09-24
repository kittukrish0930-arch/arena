// -----------------------------------------------------------------------------
// NullRenderer - a fake "view" for headless tests.
//
// It mirrors the View3D surface the Game uses (buildWorld, rebuildWorld,
// createCharacter, update, render) but records calls instead of drawing, so the
// whole game can be exercised in Node.
// -----------------------------------------------------------------------------
import { EffectsSystem } from '../fx/EffectsSystem.js';

export class NullRenderer {
  constructor({ effects = null } = {}) {
    this.calls = { buildWorld: 0, rebuildWorld: 0, characters: 0, removed: 0, updates: 0, renders: 0 };
    this.effects = effects;
    this.characters = new Map();
    this.stats = { partCount: 0, characterCount: 0 };
    this.lootPropCount = 0;
    this.quality = 'high';
  }

  buildWorld({ train, environment, lootSystem, destructibles = null }) {
    this.calls.buildWorld++;
    this.train = train;
    this.environment = environment;
    this.lootSystem = lootSystem;
    this.destructibles = destructibles;
    this.stats.partCount = train.parts.length + environment.staticParts.length;
    this.lootPropCount = lootSystem ? lootSystem.items.length : 0;
    for (const car of train.cars) {
      for (const entry of car.explosiveBarrels) {
        entry.box.data = entry.box.data || {};
        entry.box.data.view = { visible: true };
      }
    }
    return this;
  }

  rebuildWorld(opts) {
    this.calls.rebuildWorld++;
    this.characters.clear();
    this.stats.characterCount = 0;
    return this.buildWorld(opts);
  }

  buildLoot({ items }) {
    this.lootPropCount += items.length;
  }

  createCharacter(entity) {
    this.characters.set(entity, true);
    this.calls.characters++;
    this.stats.characterCount = this.characters.size;
    return { root: null };
  }

  removeCharacter(entity) {
    if (this.characters.delete(entity)) this.calls.removed++;
    this.stats.characterCount = this.characters.size;
  }

  syncStructures() {}

  setQuality(level) {
    this.quality = level;
  }

  onResize() {}

  update(dt, ctx) {
    this.calls.updates++;
    this.lastCtx = ctx;
    this.effects?.update(dt, {});
  }

  render() {
    this.calls.renders++;
  }

  dispose() {}
}

export default NullRenderer;
