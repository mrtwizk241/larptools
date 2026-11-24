// Prerequisite checks for skill parts ([SKL-PREREQ], [SKL-MASTERY], [MULTI-COG]).
//
// Readings applied on top of the data (docs/DECISIONS.md):
// - Q-MULTI-3: a count over the Magic or Crafting archetype means the four schools or the four
//   crafts, not every basic skill of that archetype (Channeling, Efficient Crafting... do not count).
// - Q-MULTI-10: a multi-archetype skill (Bardic Performance) counts for the archetype it was bought in.
import type { Ruleset, Skill } from '../../data/index.ts';
import type { SkillPart } from '../model.ts';
import type { PartDef } from './costs.ts';
import { archetypeOf, getLevel, type LevelTable } from './levels.ts';

export type Prereq = PartDef['prereqs'][number];
type SkillPrereq = Extract<Prereq, { skill: string }>;
type CountPrereq = Extract<Prereq, { count: number }>;
type Leaf = SkillPrereq | CountPrereq;

export interface PrereqResult {
  ok: boolean;
  /** Plain-English descriptions of what is missing, for example "Assault level 9". */
  unmet: string[];
  /**
   * Archetypes that a satisfying selection of skills could involve. Used by the
   * "one-of-prereq-archetypes" rule: the cost must be paid from one of these.
   */
  usable: Set<string>;
}

const PART_LABEL: Record<SkillPart, string> = {
  basic: '',
  adept: ' Adept',
  advanced: ' Advanced',
  mastery: ' Mastery',
  main: '',
};

/** "Assault", "Assault Adept", "Toughness (Warrior)". */
export function partName(ruleset: Ruleset, skillId: string, part: SkillPart): string {
  const name = ruleset.skillsById[skillId]?.name ?? skillId;
  return `${name}${PART_LABEL[part]}`;
}

function archetypeName(ruleset: Ruleset, id: string): string {
  return ruleset.archetypesById[id]?.name ?? id;
}

function orList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1] ?? ''}`;
}

/** Q-MULTI-3 and Q-MULTI-10: which skills count as "a Magic skill" or "a Crafting skill". */
function countsForArchetype(ruleset: Ruleset, skill: Skill, archetype: string): boolean {
  if (skill.category === 'multi') return true;
  if (archetype === 'magic') return ruleset.ruleset.magicSchools.some((s) => s.skill === skill.id);
  if (archetype === 'crafting')
    return ruleset.ruleset.craftingDisciplines.some((d) => d.skill === skill.id);
  return true;
}

function checkSkillLeaf(ruleset: Ruleset, p: SkillPrereq, table: LevelTable): PrereqResult {
  const ok = getLevel(table, p.skill, p.part) >= p.minLevel;
  const arch = archetypeOf(ruleset, table, p.skill);
  return {
    ok,
    unmet: ok ? [] : [`${partName(ruleset, p.skill, p.part)} level ${p.minLevel}`],
    usable: new Set(ok && arch ? [arch] : []),
  };
}

function checkCountLeaf(ruleset: Ruleset, p: CountPrereq, table: LevelTable): PrereqResult {
  const qualifying: { id: string; archetype: string }[] = [];
  for (const id of table.keys()) {
    const skill = ruleset.skillsById[id];
    const arch = archetypeOf(ruleset, table, id);
    if (!skill || !arch || getLevel(table, id, p.part) < p.minLevel) continue;
    const from = p.from;
    let matches = false;
    if (from.skills) matches = from.skills.includes(id);
    else if (from.archetype !== undefined)
      matches = arch === from.archetype && countsForArchetype(ruleset, skill, arch);
    else if (from.archetypes)
      matches = from.archetypes.includes(arch) && countsForArchetype(ruleset, skill, arch);
    if (matches) qualifying.push({ id, archetype: arch });
  }

  let ok: boolean;
  const usable = new Set<string>();
  if (p.from.sameArchetype && p.from.archetypes) {
    const byArch = new Map<string, number>();
    for (const q of qualifying) byArch.set(q.archetype, (byArch.get(q.archetype) ?? 0) + 1);
    for (const [arch, n] of byArch) if (n >= p.count) usable.add(arch);
    ok = usable.size > 0;
  } else {
    ok = qualifying.length >= p.count;
    if (ok) for (const q of qualifying) usable.add(q.archetype);
  }
  return { ok, unmet: ok ? [] : [describeCount(ruleset, p)], usable };
}

function describeCount(ruleset: Ruleset, p: CountPrereq): string {
  const skills = p.count === 1 ? 'skill' : 'skills';
  const from = p.from;
  if (from.skills) {
    const names = from.skills.map((id) => partName(ruleset, id, p.part));
    return `level ${p.minLevel} in ${p.count} of ${orList(names)}`;
  }
  if (from.archetype !== undefined)
    return `level ${p.minLevel} in ${p.count} ${archetypeName(ruleset, from.archetype)} ${skills}`;
  const names = (from.archetypes ?? []).map((a) => archetypeName(ruleset, a));
  if (from.sameArchetype)
    return `level ${p.minLevel} in ${p.count} ${skills} of one archetype (${orList(names)})`;
  return `level ${p.minLevel} in ${p.count} ${orList(names)} ${skills}`;
}

function checkLeaf(ruleset: Ruleset, p: Leaf, table: LevelTable): PrereqResult {
  return 'skill' in p ? checkSkillLeaf(ruleset, p, table) : checkCountLeaf(ruleset, p, table);
}

function checkAll(ruleset: Ruleset, list: readonly Prereq[], table: LevelTable): PrereqResult {
  const results = list.map((p) => checkOne(ruleset, p, table));
  const ok = results.every((r) => r.ok);
  const usable = new Set<string>();
  if (ok) for (const r of results) for (const a of r.usable) usable.add(a);
  return { ok, unmet: results.flatMap((r) => r.unmet), usable };
}

function checkOne(ruleset: Ruleset, p: Prereq, table: LevelTable): PrereqResult {
  if ('allOf' in p) {
    const r = checkAll(ruleset, p.allOf, table);
    return r.ok ? r : { ...r, unmet: [r.unmet.join(' and ')] };
  }
  if ('anyOf' in p) {
    const results = p.anyOf.map((b) => checkOne(ruleset, b, table));
    const passing = results.filter((r) => r.ok);
    if (passing.length > 0) {
      const usable = new Set<string>();
      for (const r of passing) for (const a of r.usable) usable.add(a);
      return { ok: true, unmet: [], usable };
    }
    const options = results.map((r) => r.unmet.join(' and '));
    return { ok: false, unmet: [options.map((o) => `(${o})`).join(' or ')], usable: new Set() };
  }
  return checkLeaf(ruleset, p, table);
}

/** Checks a part's prerequisite list (an implicit "all of"). */
export function checkPrereqs(
  ruleset: Ruleset,
  prereqs: readonly Prereq[],
  table: LevelTable,
): PrereqResult {
  return checkAll(ruleset, prereqs, table);
}
