// Starting item picks: the details a pick names (spell, recipe, performance, element, craft).
import type { Ruleset } from '../../../../engine/index.ts';

export interface PickRow {
  key: number;
  optionId: string;
  detail: string;
}

/** Choices for a pick's detail, as [value, label], or null for free text (weapon type). */
export function pickDetailOptions(ruleset: Ruleset, optionId: string): [string, string][] | null {
  const option = ruleset.startingOptionsById[optionId];
  const quality = option?.quality;
  const atQuality = <T extends { level: string }>(list: readonly T[]) =>
    quality ? list.filter((x) => x.level === quality) : list;
  switch (option?.choice) {
    case 'spell':
      return atQuality(ruleset.spells).map((s) => [s.id, `${s.name} (${s.school})`]);
    case 'recipe':
      return atQuality(ruleset.recipes).map((r) => [
        r.id,
        `${r.name} (${ruleset.skillsById[r.craft]?.name ?? r.craft})`,
      ]);
    case 'performance':
      return atQuality(ruleset.performances).map((p) => [p.id, p.name]);
    case 'element':
      return ruleset.ruleset.magicSchools.map((s) => [s.id, s.name]);
    case 'craft':
      return ruleset.skills
        .filter((s) => s.category === 'crafting')
        .map((s) => [s.id, s.name] as [string, string]);
    default:
      return null;
  }
}

/** A pick's detail in words: an id becomes its name, free text stays. */
export function pickDetailText(ruleset: Ruleset, optionId: string, detail: string): string {
  const found = pickDetailOptions(ruleset, optionId)?.find(([id]) => id === detail);
  return found ? found[1] : detail;
}
