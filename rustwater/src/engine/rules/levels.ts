// A small mutable table of owned skill levels and chosen archetypes. Used by replay, by
// prerequisite checks, and by "what if" checks such as refunds.
import type { Ruleset } from '../../data/index.ts';
import type { SkillPart } from '../model.ts';
import type { Sheet } from '../sheet.ts';

export const PART_ORDER: readonly SkillPart[] = ['basic', 'adept', 'advanced', 'mastery', 'main'];

export interface SkillEntry {
  /** Chosen archetype for multi-archetype skills; null for fixed-archetype skills. */
  chosenArchetype: string | null;
  levels: Partial<Record<SkillPart, number>>;
}

export type LevelTable = Map<string, SkillEntry>;

export function getLevel(table: LevelTable, skillId: string, part: SkillPart): number {
  return table.get(skillId)?.levels[part] ?? 0;
}

/** The archetype whose AP a skill uses: fixed in the data, or chosen on first purchase. */
export function archetypeOf(ruleset: Ruleset, table: LevelTable, skillId: string): string | null {
  const skill = ruleset.skillsById[skillId];
  if (skill?.archetype !== undefined) return skill.archetype;
  return table.get(skillId)?.chosenArchetype ?? null;
}

/** True when any part of the entry has a level above 0. */
export function isOwned(entry: SkillEntry | undefined): boolean {
  if (!entry) return false;
  return PART_ORDER.some((p) => (entry.levels[p] ?? 0) > 0);
}

/** Sets a level in place. Removes the skill (and frees a chosen archetype) when nothing is left. */
export function setLevel(
  table: LevelTable,
  skillId: string,
  part: SkillPart,
  level: number,
  chosenArchetype: string | null,
): void {
  const entry = table.get(skillId) ?? { chosenArchetype, levels: {} };
  if (entry.chosenArchetype === null) entry.chosenArchetype = chosenArchetype;
  if (level > 0) entry.levels[part] = level;
  else delete entry.levels[part];
  if (isOwned(entry)) table.set(skillId, entry);
  else table.delete(skillId);
}

export function cloneTable(table: LevelTable): LevelTable {
  const out: LevelTable = new Map();
  for (const [id, e] of table)
    out.set(id, { chosenArchetype: e.chosenArchetype, levels: { ...e.levels } });
  return out;
}

export function tableFromSheet(sheet: Sheet): LevelTable {
  const table: LevelTable = new Map();
  for (const skill of sheet.skills) {
    const levels: Partial<Record<SkillPart, number>> = {};
    for (const p of skill.parts) levels[p.part] = p.level;
    table.set(skill.skillId, {
      chosenArchetype: skill.archetypeChosen ? skill.archetype : null,
      levels,
    });
  }
  return table;
}
