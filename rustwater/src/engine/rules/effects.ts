// Effect amounts ([SKL-EFFECTS]). See the Effect shape in src/data/schema/common.ts.
import type { Ruleset } from '../../data/index.ts';
import type { PartDef } from './costs.ts';
import { getLevel, type LevelTable } from './levels.ts';

export type Effect = NonNullable<PartDef['effects']>[number];

/**
 * Additive amount of an effect owned at `level`. Returns null for effects that are not a
 * plain addition (`set`, `multiply`, `all`), which callers show as text only.
 *
 * - `base` applies once the part is owned.
 * - `perLevel` scales with the level (or the level of `levelOf`), from `fromLevel` when set.
 * - `add` is flat, only from `atLevel` when set.
 */
export function effectAmount(effect: Effect, level: number, table?: LevelTable): number | null {
  if (effect.set !== undefined || effect.multiply !== undefined || effect.all !== undefined)
    return null;
  if (level <= 0) return 0;
  let amount = effect.base ?? 0;
  if (effect.perLevel !== undefined) {
    const lvl =
      effect.levelOf && table ? getLevel(table, effect.levelOf.skill, effect.levelOf.part) : level;
    const steps = effect.fromLevel !== undefined ? Math.max(0, lvl - effect.fromLevel + 1) : lvl;
    amount += effect.perLevel * steps;
  }
  if (effect.add !== undefined && (effect.atLevel === undefined || level >= effect.atLevel))
    amount += effect.add;
  return amount;
}

/** Stats summed into the sheet's stat totals when an effect has no condition and no target skill. */
export const TOTALLED_STATS: ReadonlySet<string> = new Set([
  'maxHealth',
  'armor',
  'reflexArmor',
  'armorLocationsUpgraded',
  'weaponDamage',
  'damage',
  'packetDamage',
  'bleedOutSeconds',
  'deathCountSeconds',
  'betweenEventQuestions',
  'disguises',
  'countertrackingLevel',
  'performanceSlots',
]);

/** Name lookup used in messages; kept here so derive and commands agree. */
export function rarityName(ruleset: Ruleset, id: string): string {
  return ruleset.ruleset.rarities.find((r) => r.id === id)?.name ?? id;
}
