// -----------------------------------------------------------------------------
// LootSystem - the valuables on the train.
//
// Loot volumes come from the car definitions (crates with `loot`), plus the
// vault treasure that is spawned after the vault cinematic. Interacting with a
// volume collects the item, awards money and notifies the HUD.
// -----------------------------------------------------------------------------
import { LOOT_TABLE } from '../train/TrainCar.js';
import { clamp } from '../utils/MathUtils.js';

export class LootSystem {
  constructor({ train, onCollect = null, onPrompt = null } = {}) {
    this.train = train;
    this.onCollect = onCollect;
    this.onPrompt = onPrompt;
    this.items = [];
    this.totalValue = 0;
    this.collected = 0;
    this.totalLootable = 0;
    this.prompt = null;
    this.treasure = null;
  }

  build() {
    this.items = [];
    this.totalValue = 0;
    this.collected = 0;
    for (const car of this.train.cars) {
      for (const inter of car.interactables) {
        if (inter.type !== 'loot') continue;
        const item = {
          ...inter.loot,
          id: inter.loot.id ?? `loot_${this.items.length}`,
          x: inter.x,
          y: inter.y,
          z: inter.z,
          car,
          taken: false,
          interactable: inter,
        };
        this.items.push(item);
        this.totalValue += item.value;
      }
    }
    this.totalLootable = this.items.length;
    return this.items;
  }

  /** Treasure revealed by the vault cinematic. */
  spawnTreasure() {
    const car = this.train.vaultCar;
    if (!car) return null;
    const spawn = car.treasureSpawn;
    const item = {
      ...LOOT_TABLE.treasure,
      id: 'vault_treasure',
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      car,
      taken: false,
      big: true,
    };
    this.items.push(item);
    this.treasure = item;
    this.totalLootable = this.items.length;
    return item;
  }

  /**
   * Finds the closest interactable in range.
   * @returns {object|null}
   */
  findNearby(player, range = null) {
    const reach = range ?? 2.9;
    let best = null;
    let bestDist = Infinity;
    for (const car of this.train.cars) {
      for (const inter of car.interactables) {
        if (inter.taken && inter.type === 'loot') continue;
        if (inter.type === 'loot') {
          const item = this.items.find((i) => i.interactable === inter);
          if (!item || item.taken) continue;
        }
        const dx = inter.x - player.pos.x;
        const dy = (inter.y ?? player.pos.y) - (player.pos.y + 0.9);
        const dz = inter.z - player.pos.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < reach + (inter.radius ?? 0) && d < bestDist) {
          bestDist = d;
          best = inter;
        }
      }
    }
    this.prompt = best ? { label: best.label ?? 'INTERACT', type: best.type, distance: bestDist } : null;
    this.onPrompt?.(this.prompt);
    return best;
  }

  /**
   * Attempts to loot a specific interactable.
   * @returns {object|null} collected item
   */
  collect(inter, player) {
    if (!inter || inter.taken) return null;
    if (inter.type !== 'loot') return null;
    const item = this.items.find((i) => i.interactable === inter);
    if (!item) return null;
    item.taken = true;
    inter.taken = true;
    this.collected++;
    player.addLoot(item);
    this.onCollect?.(item, player);
    return item;
  }

  /** Collects the special loot sitting on a crate (used by stealth takedowns etc). */
  collectById(id, player) {
    const item = this.items.find((i) => i.id === id && !i.taken);
    if (!item) return null;
    item.taken = true;
    this.collected++;
    player.addLoot(item);
    this.onCollect?.(item, player);
    return item;
  }

  get completion() {
    if (this.totalLootable === 0) return 0;
    return clamp(this.collected / this.totalLootable, 0, 1);
  }

  reset() {
    for (const item of this.items) {
      item.taken = false;
      if (item.interactable) item.interactable.taken = false;
    }
    this.collected = 0;
    this.treasure = null;
    this.items = this.items.filter((i) => i.id !== 'vault_treasure');
    this.totalLootable = this.items.length;
  }
}

export default LootSystem;
