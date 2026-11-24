// Memory screen logic without React: which items a character may memorize, which slot pool each
// would use, slot pool summaries, and rule text for memorized entries. Eligibility and pools come
// from the engine's memoryTarget, so the picker matches what memorize() accepts.
import {
  memoryTarget,
  type MemorizedEntry,
  type MemoryKind,
  type MemorySlotPool,
  type Ruleset,
  type Sheet,
} from '../../../../engine/index.ts';
// Not in the engine's public API: the level table memoryTarget reads, and the Bardic Performance
// and Ritualism skill lookups.
import { tableFromSheet } from '../../../../engine/rules/levels.ts';
import { performanceSkill, ritualSkill } from '../../../../engine/rules/memory.ts';
import { frequencyText } from '../format.ts';

/** Kinds that use slots (everything but free-text knowledges). */
export type SlotKind = Exclude<MemoryKind, 'knowledge'>;

export const SLOT_KINDS: readonly SlotKind[] = ['spell', 'recipe', 'performance', 'ritual'];

/** "spell" -> "spells", for headings and messages. */
export const PLURAL: Record<MemoryKind, string> = {
  spell: 'spells',
  recipe: 'recipes',
  performance: 'performances',
  ritual: 'rituals',
  knowledge: 'knowledges',
};

/** One row in the Memorize picker. */
export interface PickerItem {
  readonly refId: string;
  readonly name: string;
  /** "Basic, Life", "Adept performance", "Mastery, Chemical Engineering". */
  readonly detail: string;
  /** The pool it would go in: the first free one, else the pool a memorization level adds to. */
  readonly pool: MemorySlotPool | null;
  /** True when no pool it may use has a free slot. */
  readonly needsSlot: boolean;
}

interface Candidate {
  refId: string;
  name: string;
  detail: string;
}

function capitalize(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

/** "Basic", "Adept", "Mastery"; empty for null. */
export function rankText(rank: string | null): string {
  return rank ? capitalize(rank) : '';
}

function candidates(ruleset: Ruleset, kind: SlotKind): Candidate[] {
  if (kind === 'spell')
    return ruleset.spells.map((s) => ({
      refId: s.id,
      name: s.name,
      detail: s.mastery
        ? `Mastery, ${ruleset.skillsById[s.masterySkill]?.name ?? s.masterySkill}`
        : `${rankText(s.rank)}, ${schoolName(ruleset, s.school)}`,
    }));
  if (kind === 'recipe')
    return ruleset.recipes.map((r) => ({
      refId: r.id,
      name: r.name,
      detail: r.mastery
        ? `Mastery, ${ruleset.skillsById[r.masterySkill]?.name ?? r.masterySkill}`
        : `${rankText(r.rank)}, ${craftName(ruleset, r.discipline)}`,
    }));
  if (kind === 'performance')
    return ruleset.performances.performances.map((p) => ({
      refId: p.id,
      name: p.name,
      detail: `${rankText(p.tier)} performance`,
    }));
  return ruleset.performances.rituals.map((r) => ({ refId: r.id, name: r.name, detail: 'Ritual' }));
}

function schoolName(ruleset: Ruleset, id: string): string {
  return ruleset.ruleset.magicSchools.find((s) => s.id === id)?.name ?? id;
}

function craftName(ruleset: Ruleset, id: string): string {
  return ruleset.ruleset.craftingDisciplines.find((d) => d.id === id)?.name ?? id;
}

/** Matches every word of `query` against the name and detail, ignoring case. */
export function matchesSearch(item: { name: string; detail: string }, query: string): boolean {
  const haystack = `${item.name} ${item.detail}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** The pool an item would use: the first with a free slot, else one a memorization level grows. */
function choosePool(
  sheet: Sheet,
  poolIds: readonly string[],
): { pool: MemorySlotPool | null; needsSlot: boolean } {
  const pools = poolIds
    .map((id) => sheet.memory.slots.find((p) => p.pool === id))
    .filter((p): p is MemorySlotPool => p !== undefined);
  const free = pools.find((p) => p.free > 0);
  if (free) return { pool: free, needsSlot: false };
  return { pool: pools.find((p) => p.memorizationSkillId !== null) ?? null, needsSlot: true };
}

/**
 * Items the character may memorize now: known school or craft at the item's rank (or the
 * performance tier, or Ritualism), not a mastery ability or automatic ritual, not memorized yet.
 * Filtered by `query`, sorted by name.
 */
export function pickerItems(
  ruleset: Ruleset,
  sheet: Sheet,
  kind: SlotKind,
  query = '',
): PickerItem[] {
  const table = tableFromSheet(sheet);
  const known = new Set(
    sheet.memory.entries.filter((e) => e.kind === kind).map((e) => e.refId ?? ''),
  );
  const items: PickerItem[] = [];
  for (const c of candidates(ruleset, kind)) {
    if (known.has(c.refId) || !matchesSearch(c, query)) continue;
    const target = memoryTarget(ruleset, table, kind, c.refId);
    if (!target || target.notMemorizable !== null || target.unmet.length > 0) continue;
    items.push({ ...c, ...choosePool(sheet, target.pools) });
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

/** True when the character knows enough to memorize at least one item of `kind`. */
export function hasAccess(ruleset: Ruleset, sheet: Sheet, kind: MemoryKind): boolean {
  if (kind === 'knowledge') return true;
  const table = tableFromSheet(sheet);
  return candidates(ruleset, kind).some((c) => {
    const target = memoryTarget(ruleset, table, kind, c.refId);
    return target !== null && target.notMemorizable === null && target.unmet.length === 0;
  });
}

function orList(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1] ?? ''}`;
}

/** One line on how to unlock a tab the character has no access to. */
export function unlockText(ruleset: Ruleset, kind: SlotKind): string {
  const skillName = (id: string) => ruleset.skillsById[id]?.name ?? id;
  if (kind === 'spell')
    return `Learn a magic school (${orList(ruleset.ruleset.magicSchools.map((s) => skillName(s.skill)))}) to memorize spells.`;
  if (kind === 'recipe')
    return `Learn a craft (${orList(ruleset.ruleset.craftingDisciplines.map((d) => skillName(d.skill)))}) to memorize recipes.`;
  if (kind === 'performance')
    return `Learn ${performanceSkill(ruleset)?.name ?? 'Bardic Performance'} to memorize performances.`;
  return `Learn ${ritualSkill(ruleset)?.name ?? 'Ritualism'} to memorize rituals.`;
}

/**
 * Pools to show on a tab: the ones with slots or entries, plus the pool a memorization level
 * grows (universal, performance, ritual) while the tab is unlocked.
 */
export function visiblePools(sheet: Sheet, kind: SlotKind, unlocked: boolean): MemorySlotPool[] {
  return sheet.memory.slots.filter(
    (p) =>
      p.kind === kind &&
      (p.slots > 0 || p.used > 0 || (unlocked && p.memorizationSkillId !== null)),
  );
}

/** "Life: 2 of 3 used". */
export function poolSummary(pool: MemorySlotPool): string {
  return `${pool.name}: ${pool.used} of ${pool.slots} used`;
}

/** Where a pool's slots come from, one line per non-zero source. */
export function poolBreakdown(ruleset: Ruleset, pool: MemorySlotPool): string[] {
  const memName = pool.memorizationSkillId
    ? (ruleset.skillsById[pool.memorizationSkillId]?.name ?? pool.memorizationSkillId)
    : 'Memorization';
  const lines: [number, string][] = [
    [pool.fromBasic, 'from basic levels'],
    [pool.fromAdept, 'from adept levels'],
    [pool.fromAdvanced, 'from advanced levels'],
    [pool.fromMemorization, `from ${memName} levels`],
    [pool.fromGrant, `granted by ${ritualSkillNameFor(ruleset, pool)}`],
  ];
  return lines.filter(([n]) => n !== 0).map(([n, text]) => `${n} ${text}`);
}

function ritualSkillNameFor(ruleset: Ruleset, pool: MemorySlotPool): string {
  return pool.kind === 'ritual' ? (ritualSkill(ruleset)?.name ?? 'a skill') : 'a skill';
}

/** "Life slot", "Universal slot", "Performance slot". */
export function slotLabel(sheet: Sheet, entry: MemorizedEntry): string {
  if (entry.pool === null) return 'No slot';
  if (entry.pool === 'performance') return 'Performance slot';
  if (entry.pool === 'ritual') return 'Ritual slot';
  const pool = sheet.memory.slots.find((p) => p.pool === entry.pool);
  return `${pool?.name ?? entry.slot} slot`;
}

/** Name of the memorization skill a pool grows with, for the buy option. */
export function memorizationSkillName(ruleset: Ruleset, pool: MemorySlotPool | null): string {
  const id = pool?.memorizationSkillId;
  return id ? (ruleset.skillsById[id]?.name ?? id) : 'memorization';
}

/** Rule facts and text for a memorized item, or null when the id is not in the data. */
export function ruleDetails(
  ruleset: Ruleset,
  kind: SlotKind,
  refId: string,
): { facts: string[]; text: string } | null {
  if (kind === 'spell') {
    const s = ruleset.spellsById[refId];
    if (!s) return null;
    return { facts: s.mastery ? [] : [`Call: ${s.call}`], text: s.text };
  }
  if (kind === 'recipe') {
    const r = ruleset.recipesById[refId];
    if (!r) return null;
    return { facts: [`Cost: ${r.costText}`], text: r.text };
  }
  if (kind === 'performance') {
    const p = ruleset.performancesById[refId];
    if (!p) return null;
    const { min, max } = p.lengthMinutes;
    const length = min === max ? `${min} minutes` : `${min} to ${max} minutes`;
    return { facts: [`Length: ${length}`], text: p.text };
  }
  const r = ruleset.ritualsById[refId];
  if (!r) return null;
  return { facts: [`${frequencyText(r.frequency)}.`, ...(r.notes ? [r.notes] : [])], text: r.text };
}
