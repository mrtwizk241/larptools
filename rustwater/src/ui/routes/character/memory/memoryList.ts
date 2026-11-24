// Rows for the Spells and Recipes screens: every spell, recipe, performance, or ritual in the
// rules (mastery magic abilities are skills, not spells), with a filter group, whether the
// character has it memorized, and what memorizing it still needs. Pure, so it is unit tested.
import { memoryTarget, type Ruleset, type Sheet } from '../../../../engine/index.ts';
import { tableFromSheet } from '../../../../engine/rules/levels.ts';
import { rankText, type SlotKind } from './model.ts';

export interface MemoryRow {
  readonly refId: string;
  readonly name: string;
  /** Filter chip id: school, craft, `mastery`, or tier. */
  readonly group: string;
  /** "Basic · Life". */
  readonly detail: string;
  /** Memorized (or, for rituals, known automatically). */
  readonly memorized: boolean;
  /** What memorizing it still needs, for example "Life Magic Adept". Empty when it can be. */
  readonly unmet: readonly string[];
  /** Why it can never be memorized, if so. */
  readonly notMemorizable: string | null;
}

export interface FilterGroup {
  readonly id: string;
  readonly label: string;
}

function schoolName(ruleset: Ruleset, id: string): string {
  return ruleset.ruleset.magicSchools.find((s) => s.id === id)?.name ?? id;
}

function craftName(ruleset: Ruleset, id: string): string {
  return ruleset.ruleset.craftingDisciplines.find((d) => d.id === id)?.name ?? id;
}

/** Filter chips for a kind: schools, crafts (plus Mastery), or performance tiers. */
export function filterGroups(ruleset: Ruleset, kind: SlotKind): FilterGroup[] {
  if (kind === 'spell')
    return ruleset.ruleset.magicSchools.map((s) => ({ id: s.id, label: s.name }));
  if (kind === 'recipe')
    return [
      ...ruleset.ruleset.craftingDisciplines.map((d) => ({ id: d.id, label: d.name })),
      { id: 'mastery', label: 'Mastery' },
    ];
  if (kind === 'performance')
    return ['basic', 'adept', 'advanced'].map((t) => ({ id: t, label: rankText(t) }));
  return [];
}

function baseRows(ruleset: Ruleset, kind: SlotKind) {
  if (kind === 'spell')
    return ruleset.spells.flatMap((s) =>
      s.mastery
        ? []
        : [
            {
              refId: s.id,
              name: s.name,
              group: s.school,
              detail: `${rankText(s.rank)} · ${schoolName(ruleset, s.school)}`,
            },
          ],
    );
  if (kind === 'recipe')
    return ruleset.recipes.map((r) =>
      r.mastery
        ? {
            refId: r.id,
            name: r.name,
            group: 'mastery',
            detail: `Mastery · ${ruleset.skillsById[r.masterySkill]?.name ?? r.masterySkill}`,
          }
        : {
            refId: r.id,
            name: r.name,
            group: r.discipline,
            detail: `${rankText(r.rank)} · ${craftName(ruleset, r.discipline)}`,
          },
    );
  if (kind === 'performance')
    return ruleset.performances.performances.map((p) => ({
      refId: p.id,
      name: p.name,
      group: p.tier,
      detail: `${rankText(p.tier)} performance`,
    }));
  return ruleset.performances.rituals.map((r) => ({
    refId: r.id,
    name: r.name,
    group: '',
    detail: 'Ritual',
  }));
}

/** Every row of a kind, in rules order, with the character's state. */
export function memoryRows(ruleset: Ruleset, sheet: Sheet, kind: SlotKind): MemoryRow[] {
  const table = tableFromSheet(sheet);
  const known = new Set([
    ...sheet.memory.entries.filter((e) => e.kind === kind).map((e) => e.refId ?? ''),
    ...(kind === 'ritual' ? sheet.memory.autoLearned.map((a) => a.refId) : []),
  ]);
  return baseRows(ruleset, kind).map((row) => {
    const target = memoryTarget(ruleset, table, kind, row.refId);
    return {
      ...row,
      memorized: known.has(row.refId),
      unmet: target?.unmet ?? [],
      notMemorizable: target?.notMemorizable ?? null,
    };
  });
}

/** Rows matching the chips (none pressed shows all), a name search, and "memorized only". */
export function filterRows(
  rows: readonly MemoryRow[],
  filter: { groups: readonly string[]; query: string; ownedOnly: boolean },
): MemoryRow[] {
  const query = filter.query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (filter.groups.length === 0 || filter.groups.includes(row.group)) &&
      (query === '' || row.name.toLowerCase().includes(query)) &&
      (!filter.ownedOnly || row.memorized),
  );
}
