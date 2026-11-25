// The wiki reads the Sylvaris rules data directly, so its numbers always match the data the
// character sheet uses. Small helpers turn data values into plain English.
import {
  loadSylvarisRuleset,
  type SyNamedLevel,
  type SyPrereqGroup,
  type SyRuleset,
  type SySkill,
} from '../../../data/index.ts';

export type WikiRuleset = SyRuleset;

/** The season the public wiki describes. */
export function wikiRuleset(): WikiRuleset {
  return loadSylvarisRuleset();
}

export const NAMED_LEVELS = ['basic', 'expert', 'master', 'grandmaster'] as const;

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** 2 -> "two" (up to nine), otherwise digits. */
export function word(n: number): string {
  return WORDS[n] ?? String(n);
}

/** "grandmaster" -> "Grandmaster", "short-claws" -> "Short claws". */
export function humanize(id: string): string {
  const text = id.replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "fam-breath-weapon" -> "Breath Weapon". */
export function titleFromId(id: string, prefix = ''): string {
  return id
    .replace(new RegExp(`^${prefix}`), '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function levelName(level: string): string {
  return humanize(level);
}

/** 3 -> "3rd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  const last = n % 10;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : last === 1
        ? 'st'
        : last === 2
          ? 'nd'
          : last === 3
            ? 'rd'
            : 'th';
  return `${n}${suffix}`;
}

/** 0.25 -> "25%". */
export function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function frequencyText(frequency: string): string {
  switch (frequency) {
    case 'passive':
      return 'Always on';
    case 'per-encounter':
      return 'Once per encounter';
    case 'per-repop':
      return 'Per re-pop';
    case 'per-event':
      return 'Per event';
    case 'per-year':
      return 'Per year';
    default:
      return 'Special';
  }
}

export function abilityKind(kind: 'active' | 'passive' | 'both'): string {
  return kind === 'both' ? 'Active and passive' : kind === 'active' ? 'Active' : 'Passive';
}

export function usesText(uses: number): string {
  return uses === 1 ? '1 use' : `${uses} uses`;
}

/** XP (or CXP) cost of level n of a skill. */
export function levelCost(rs: WikiRuleset, n: number): number {
  return rs.ruleset.skills.costPerLevel * n;
}

/** Total cost of levels 1 to n. */
export function costToLevel(rs: WikiRuleset, n: number): number {
  return (rs.ruleset.skills.costPerLevel * n * (n + 1)) / 2;
}

export function techniqueCost(rs: WikiRuleset, id: string): number {
  return rs.techniquesById[id]?.cost ?? 0;
}

/** All three Techniques together. */
export function allTechniquesCost(rs: WikiRuleset): number {
  return rs.ruleset.skills.techniques.reduce((sum, t) => sum + t.cost, 0);
}

/** Levels 1 to 10 plus all Techniques. */
export function fullSkillCost(rs: WikiRuleset): number {
  return costToLevel(rs, rs.ruleset.skills.maxLevel) + allTechniquesCost(rs);
}

export function skillName(rs: WikiRuleset, id: string): string {
  return rs.skillsById[id]?.name ?? humanize(id);
}

function joinWords(items: string[], conjunction: 'and' | 'or'): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1] ?? ''}`;
}

function groupText(rs: WikiRuleset, group: SyPrereqGroup, withTechnique: boolean): string {
  const names = group.of.map(
    (req) =>
      `${skillName(rs, req.skill)}${withTechnique ? ` (${levelName(req.technique)} Technique)` : ''}`,
  );
  if (group.need === names.length) return joinWords(names, 'and');
  if (group.need === 1) return joinWords(names, 'or');
  return `any ${word(group.need)} of ${joinWords(names, 'or')}`;
}

/** A skill's prerequisites in words, or undefined when it has none. */
export function prereqText(rs: WikiRuleset, skill: SySkill): string | undefined {
  if (skill.prereqs.length === 0) return undefined;
  const techniques = new Set(skill.prereqs.flatMap((g) => g.of.map((r) => r.technique)));
  const shared = techniques.size === 1 ? [...techniques][0] : undefined;
  const parts = skill.prereqs.map((g) => {
    const text = groupText(rs, g, shared === undefined);
    return skill.prereqs.length > 1 && g.of.length > 1 && g.need < g.of.length ? `(${text})` : text;
  });
  const body = parts.join(' and ');
  return shared ? `The ${levelName(shared)} Technique in ${body}.` : `${body}.`;
}

export const CATEGORY_TITLES = {
  offensive: 'Offensive skills',
  defensive: 'Defensive skills',
  utility: 'Utility skills',
  magic: 'Magic skills',
  crafting: 'Crafting skills',
} as const;

export type RegularCategory = keyof typeof CATEGORY_TITLES;

export function namedLevelOf(rs: WikiRuleset, level: SyNamedLevel): number {
  return rs.ruleset.skills.namedLevels[level];
}
