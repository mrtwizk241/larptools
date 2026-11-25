// What the Play screen tracks: the uses of every skill on the sheet (max uses = level, renewed at
// re-pop), the racial innate active (per encounter), the named abilities that spend those uses,
// and castable spells. Plus the spent counts kept in the use tracker. Pure: no React.
// Rules: docs/rules-spec/05-skills.md [SKL-USES], [SKL-CALLING]; 03-races.md (innate actives).
import type { AbilityView, Ruleset, Sheet } from '../../../../engine/index.ts';
import type { NamedLevelId, UseTracker } from '../../../../engine/model.ts';

/** When spent uses come back: the re-pop (skills) or the next encounter (racial innates). */
export type UsePeriod = 'encounter' | 'repop';

export const NAMED_LABELS: Record<NamedLevelId, string> = {
  basic: 'Basic',
  expert: 'Expert',
  master: 'Master',
  grandmaster: 'Grandmaster',
};

/** One named ability that spends uses of its skill, for example Aggression Expert (2 uses). */
export interface SpendOption {
  readonly named: NamedLevelId;
  /** "Aggression Expert". */
  readonly name: string;
  readonly cost: number;
}

export interface TrackedUse {
  /** Stable key: `skill:<skillId>` or `innate:<innateId>`. */
  readonly key: string;
  readonly name: string;
  readonly count: number;
  readonly period: UsePeriod;
  readonly kind: 'skill' | 'innate';
  readonly skillId: string | null;
  /** Calling skill: its uses renew only at re-pop ([SKL-CALLING]). */
  readonly calling: boolean;
  /** Short line under the name (the innate's summary). */
  readonly note: string | null;
  /** Unlocked named abilities with a use cost, cheapest first. */
  readonly abilities: readonly SpendOption[];
  /** What the skill does: each learned ability with its summary (the row opens to show it). */
  readonly details: readonly AbilityDetail[];
  /** Named levels not learned yet ("Master"). */
  readonly notLearned: readonly string[];
}

/** One learned ability: "Expert: 2 uses" and its summary. */
export interface AbilityDetail {
  readonly label: string;
  readonly summary: string;
}

/** "Basic: 1 use", "Expert: passive", "Master: 3 uses, plus a passive". */
export function abilityLabel(a: AbilityView): string {
  const name = NAMED_LABELS[a.named];
  if (a.kind === 'passive') return `${name}: passive`;
  return `${name}: ${usesText(a.uses)}${a.kind === 'both' ? ', plus a passive' : ''}`;
}

/** A spell the character can cast now, paid with uses of its magic skill. */
export interface CastableSpell {
  /** `spell:<entryId>` or `known:<spellId>` (Sorcerer known spells). */
  readonly id: string;
  readonly name: string;
  readonly level: NamedLevelId;
  /** Key of the magic skill's tracked uses. */
  readonly poolKey: string;
  readonly skillName: string;
  readonly cost: number;
  /** In the spellbook but not tagged yet (usable on the honor system). */
  readonly pending: boolean;
}

export const skillKey = (skillId: string) => `skill:${skillId}`;
export const innateKey = (innateId: string) => `innate:${innateId}`;

/** Every trackable use on the sheet: skills in sheet order, then the racial innate actives. */
export function trackedUses(sheet: Sheet): TrackedUse[] {
  const items: TrackedUse[] = [];
  for (const skill of sheet.skills) {
    if (skill.locked || skill.maxUses <= 0) continue;
    const abilities = skill.abilities
      .filter((a) => a.unlocked && a.uses > 0 && a.kind !== 'passive')
      .map((a) => ({
        named: a.named,
        name: `${skill.displayName} ${NAMED_LABELS[a.named]}`,
        cost: a.uses,
      }));
    // A skill whose owned abilities are all passive has nothing to spend.
    if (abilities.length === 0) continue;
    items.push({
      key: skillKey(skill.skillId),
      name: skill.displayName,
      count: skill.maxUses,
      period: 'repop',
      kind: 'skill',
      skillId: skill.skillId,
      calling: skill.callingId !== null,
      note: null,
      abilities,
      details: skill.abilities
        .filter((a) => a.unlocked)
        .map((a) => ({ label: abilityLabel(a), summary: a.summary })),
      notLearned: skill.abilities.filter((a) => !a.unlocked).map((a) => NAMED_LABELS[a.named]),
    });
  }
  const race = sheet.race;
  for (const innate of race?.innates ?? []) {
    if (innate.kind !== 'active' || !innate.uses || innate.uses <= 0) continue;
    items.push({
      key: innateKey(innate.id),
      name: `${race?.name ?? 'Racial'} innate`,
      count: innate.uses,
      period: innate.frequency === 'per-encounter' ? 'encounter' : 'repop',
      kind: 'innate',
      skillId: null,
      calling: false,
      note: innate.summary,
      abilities: [],
      details: [],
      notLearned: [],
    });
  }
  return items;
}

/** Spells castable now with their use cost from their magic skill; ones it cannot pay are left out. */
export function castableSpells(
  sheet: Sheet,
  ruleset: Ruleset,
  items: readonly TrackedUse[],
): CastableSpell[] {
  const schoolSkill = new Map<string, string>(
    ruleset.ruleset.magicSchools.map((s) => [s.id, s.skill]),
  );
  const spells: CastableSpell[] = [];
  const add = (
    id: string,
    name: string,
    school: string,
    level: NamedLevelId,
    pending: boolean,
  ): void => {
    const skillId = schoolSkill.get(school);
    if (!skillId) return;
    const item = items.find((i) => i.key === skillKey(skillId));
    const ability = item?.abilities.find((a) => a.named === level);
    if (!item || !ability) return;
    spells.push({
      id,
      name,
      level,
      poolKey: item.key,
      skillName: item.name,
      cost: ability.cost,
      pending,
    });
  };
  const { journals } = sheet;
  if (!journals.spellbookCastingBlocked)
    for (const entry of journals.spellbook)
      if (entry.usableNow)
        add(
          `spell:${entry.entryId}`,
          entry.name,
          entry.group,
          entry.level,
          entry.status === 'pending',
        );
  for (const known of journals.knownSpells)
    if (known.usableNow)
      add(`known:${known.spellId}`, known.name, known.school, known.level, false);
  return spells;
}

// ---- Spent counts ----

/** Spent uses per item key. Keys are unique across periods. */
export type Spent = Readonly<Record<string, number>>;

export function spentFromTracker(tracker: UseTracker | undefined): Spent {
  if (!tracker) return {};
  return { ...tracker.perRepop, ...tracker.perEncounter };
}

/** The tracker record to save. Only current items with spent uses are kept. */
export function trackerFromSpent(
  characterId: string,
  spent: Spent,
  items: readonly TrackedUse[],
  updatedAt: string,
): UseTracker {
  const perEncounter: Record<string, number> = {};
  const perRepop: Record<string, number> = {};
  for (const item of items) {
    const value = spentOf(spent, item);
    if (value === 0) continue;
    if (item.period === 'encounter') perEncounter[item.key] = value;
    else perRepop[item.key] = value;
  }
  return { characterId, perEncounter, perRepop, updatedAt };
}

/** Spent uses of an item, clamped to 0..count (a count can shrink when the sheet changes). */
export function spentOf(spent: Spent, item: TrackedUse): number {
  const value = spent[item.key] ?? 0;
  return Math.max(0, Math.min(item.count, Math.floor(value)));
}

export function leftOf(spent: Spent, item: TrackedUse): number {
  return item.count - spentOf(spent, item);
}

/** Only current items, each clamped to its count. Returns the same object when nothing changes. */
export function clampSpent(spent: Spent, items: readonly TrackedUse[]): Spent {
  const next: Record<string, number> = {};
  for (const item of items) {
    const value = spentOf(spent, item);
    if (value > 0) next[item.key] = value;
  }
  return sameSpent(spent, next) ? spent : next;
}

/**
 * Spends `cost` uses. Returns the same object (a refusal) when fewer than `cost` are left: an
 * ability is all or nothing.
 */
export function spendUses(spent: Spent, item: TrackedUse, cost = 1): Spent {
  if (cost <= 0 || leftOf(spent, item) < cost) return spent;
  return { ...spent, [item.key]: spentOf(spent, item) + cost };
}

/** Gives back up to `count` spent uses (no change when none is spent). */
export function restoreUses(spent: Spent, item: TrackedUse, count = 1): Spent {
  const value = spentOf(spent, item);
  if (value <= 0 || count <= 0) return spent;
  const next = Math.max(0, value - count);
  const copy: Record<string, number> = { ...spent };
  if (next === 0) delete copy[item.key];
  else copy[item.key] = next;
  return copy;
}

/**
 * Periods each reset renews. A new encounter renews per-encounter uses (racial innates); a new
 * re-pop renews every use, Calling skills included.
 */
export const RESET_SCOPE: Record<'encounter' | 'repop', readonly UsePeriod[]> = {
  encounter: ['encounter'],
  repop: ['encounter', 'repop'],
};

/** Restores every use of the items in the given periods. */
export function resetPeriods(
  spent: Spent,
  items: readonly TrackedUse[],
  periods: readonly UsePeriod[],
): Spent {
  const next: Record<string, number> = { ...spent };
  for (const item of items) if (periods.includes(item.period)) delete next[item.key];
  return next;
}

/** Puts back the spent counts of the given periods from an earlier state (Undo after a reset). */
export function restoreFrom(
  spent: Spent,
  before: Spent,
  items: readonly TrackedUse[],
  periods: readonly UsePeriod[],
): Spent {
  const next: Record<string, number> = { ...spent };
  for (const item of items) {
    if (!periods.includes(item.period)) continue;
    const value = before[item.key];
    if (value === undefined) delete next[item.key];
    else next[item.key] = value;
  }
  return next;
}

export function sameSpent(a: Spent, b: Spent): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if ((a[key] ?? 0) !== (b[key] ?? 0)) return false;
  return true;
}

/** "1 use", "2 uses". */
export function usesText(n: number): string {
  return `${n} ${n === 1 ? 'use' : 'uses'}`;
}

/** "2 of 3 left". */
export function leftText(left: number, count: number): string {
  return `${left} of ${count} left`;
}

/** "Spend 2 uses: Aggression Expert". */
export function spendLabel(option: SpendOption): string {
  return `Spend ${usesText(option.cost)}: ${option.name}`;
}

/** "Cast Grant Life: 1 use of Life Magic". */
export function castLabel(spell: CastableSpell): string {
  return `Cast ${spell.name}: ${usesText(spell.cost)} of ${spell.skillName}`;
}

/** "Deflection use 2 of 3, spent". */
export function pipLabel(item: TrackedUse, index: number, isSpent: boolean): string {
  return `${item.name} use ${index + 1} of ${item.count}, ${isSpent ? 'spent' : 'available'}`;
}
