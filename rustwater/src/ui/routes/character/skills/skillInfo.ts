// Plain-English labels and filters for skills, shared by the Skills screens and the create
// wizard's starting skills step. Pure, so it is unit tested.
import {
  preview,
  type Cost,
  type PreviewResult,
  type Ruleset,
  type Sheet,
  type SheetSkill,
  type SheetSkillPart,
} from '../../../../engine/index.ts';
import type { SkillPart } from '../../../../engine/model.ts';
import { usesText } from '../format.ts';

/** One skill from the rules data. */
export type Skill = Ruleset['skills'][number];

export type SkillCategory = Skill['category'];

export const CATEGORIES: readonly { id: SkillCategory; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'magic', label: 'Magic' },
  { id: 'crafting', label: 'Crafting' },
  { id: 'multi', label: 'Multi' },
];

/** Standard skills are filtered by these archetypes. */
export const STANDARD_ARCHETYPES = ['warrior', 'defender', 'rogue', 'utility'] as const;

export const PART_ORDER: readonly SkillPart[] = ['basic', 'adept', 'advanced', 'mastery', 'main'];

export function isCategory(value: string | null): value is SkillCategory {
  return CATEGORIES.some((c) => c.id === value);
}

export function archetypeName(ruleset: Ruleset, id: string): string {
  return ruleset.archetypesById[id]?.name ?? id;
}

/** "Toughness (Warrior)" for skills listed in two archetypes, else the plain name. */
export function skillDisplayName(ruleset: Ruleset, skill: Skill): string {
  if (skill.skillGroup !== undefined && skill.archetype !== undefined)
    return `${skill.name} (${archetypeName(ruleset, skill.archetype)})`;
  return skill.name;
}

/** "Delay Effect (R)": the name with its heading marks. */
export function skillTitle(ruleset: Ruleset, skill: Skill): string {
  const marks = skill.marks.map((m) => ` (${m})`).join('');
  return `${skillDisplayName(ruleset, skill)}${marks}`;
}

/** Badge text: Basic, Encounter, Passive, Mastery, Memorization, or Cognitive. */
export function typeLabel(skill: Skill): string {
  if (skill.cognitivePower === true) return 'Cognitive';
  switch (skill.type) {
    case 'basic':
      return 'Basic';
    case 'encounter':
      return 'Encounter';
    case 'passive':
      return 'Passive';
    case 'mastery':
      return 'Mastery';
    case 'memorization':
      return 'Memorization';
  }
}

/** Heading for one part: Basic, Adept, Advanced, Mastery, or the type for a single-part skill. */
export function partTitle(skill: Skill, part: SkillPart): string {
  switch (part) {
    case 'basic':
      return 'Basic';
    case 'adept':
      return 'Adept';
    case 'advanced':
      return 'Advanced';
    case 'mastery':
      return 'Mastery';
    case 'main':
      return typeLabel(skill);
  }
}

/** "Assault", "Assault Adept", "Assault Mastery" (matches the engine's wording). */
export function partLabel(ruleset: Ruleset, skill: Skill, part: SkillPart): string {
  const name = skillDisplayName(ruleset, skill);
  return part === 'basic' || part === 'main' ? name : `${name} ${partTitle(skill, part)}`;
}

/** Parts in display order. */
export function skillParts(skill: Skill): SkillPart[] {
  return PART_ORDER.filter((p) => skill.parts[p] !== undefined);
}

/** True when a part can be bought at character creation (no mastery, cognitive, or flagged part). */
export function allowedAtCreation(skill: Skill, part: SkillPart): boolean {
  const def = skill.parts[part];
  if (!def) return false;
  return def.notAtCreation !== true && def.costKind !== 'mastery' && skill.cognitivePower !== true;
}

type PartDef = NonNullable<Skill['parts'][SkillPart]>;

const FREQUENCY_WORDS: Record<string, string> = {
  'per-repop': 'per repop',
  'per-encounter': 'per encounter',
  'per-event': 'per event',
  passive: 'passive, always on',
};

/** "per repop", "passive, always on", "at check-in", plus "also between events". */
export function frequencyWords(def: PartDef): string {
  let words: string;
  if (def.timing === 'check-in') words = 'at check-in';
  else if (def.frequencyText) words = def.frequencyText;
  else words = FREQUENCY_WORDS[def.frequency] ?? 'special';
  return def.betweenEvents ? `${words}, also between events` : words;
}

export const MARK_TEXT: Record<'R' | 'Av', string> = {
  R: 'Resistance (R): you resist the effect after being hit. Cannot be used against an unresistable effect.',
  Av: 'Avoidance (Av): you get out of or knock away the effect. Cannot be used against an unavoidable effect.',
};

/** Uses of an owned part in words, for example "3 uses per repop; 1 use per encounter". */
export function usesWords(part: SheetSkillPart): string | null {
  const list = [part.uses, ...part.extraUses].filter((u) => u !== null && u.count > 0);
  if (list.length === 0) return null;
  return list.map((u) => (u ? usesText(u) : '')).join('; ');
}

/** Compact owned levels: "Basic 3 · Adept 1 · Mastery", or "Not learned". */
export function ownedSummary(skill: Skill, owned: SheetSkill | undefined): string {
  const parts = owned?.parts.filter((p) => p.level > 0) ?? [];
  if (parts.length === 0) return 'Not learned';
  return parts
    .map((p) => {
      if (p.part === 'main') return p.maxLevel === 1 ? 'Learned' : `Level ${p.level}`;
      if (p.maxLevel === 1) return partTitle(skill, p.part);
      return `${partTitle(skill, p.part)} ${p.level}`;
    })
    .join(' · ');
}

/** "40 CXP", "6 Warrior AP", "10 AP" (archetype not chosen yet). */
export function costText(ruleset: Ruleset, cost: Cost): string {
  if (cost.currency === 'ap')
    return cost.archetype
      ? `${cost.amount} ${archetypeName(ruleset, cost.archetype)} AP`
      : `${cost.amount} AP`;
  return `${cost.amount} ${cost.currency === 'essence' ? 'AE' : cost.currency.toUpperCase()}`;
}

/**
 * Archetype a multi-archetype skill is locked to: its own first purchase, or the skill it must
 * share an archetype with. Null when it can still be chosen (or for single-archetype skills).
 */
export function lockedArchetype(sheet: Sheet, skill: Skill): string | null {
  if (skill.archetype !== undefined) return skill.archetype;
  const own = sheet.skills.find((s) => s.skillId === skill.id);
  if (own?.archetype) return own.archetype;
  const rule = skill.archetypeRule;
  if (rule?.kind === 'same-as-skill')
    return sheet.skills.find((s) => s.skillId === rule.skill)?.archetype ?? null;
  return null;
}

/** True when buying this skill needs an archetype choice from the user. */
export function needsArchetypeChoice(sheet: Sheet, skill: Skill): boolean {
  return (
    skill.archetype === undefined &&
    skill.archetypeRule?.kind !== 'same-as-skill' &&
    lockedArchetype(sheet, skill) === null
  );
}

/**
 * preview() of learning the next level of a part. For a multi-archetype skill whose archetype
 * is still open, `archetype` is the one chosen in a form; without one, each option is tried and
 * the first allowed one is reported (the label then names no archetype).
 */
export function previewLearn(
  ruleset: Ruleset,
  sheet: Sheet,
  skill: Skill,
  part: SkillPart,
  archetype?: string,
): PreviewResult {
  const run = (a: string | undefined) =>
    preview(ruleset, sheet, {
      type: 'learnSkill',
      skillId: skill.id,
      part,
      ...(a ? { archetype: a } : {}),
    });
  if (archetype || !needsArchetypeChoice(sheet, skill)) return run(archetype);
  const options = skill.archetypeOptions ?? [];
  const results = options.map((a) => run(a));
  const allowed = results.find((r) => r.allowed);
  const chosen = allowed ?? results[0] ?? run(undefined);
  if (!chosen.cost) return chosen;
  return { ...chosen, cost: { currency: chosen.cost.currency, amount: chosen.cost.amount } };
}

/** Level of a part on the sheet (0 when not owned). */
export function ownedPart(owned: SheetSkill | undefined, part: SkillPart): SheetSkillPart | null {
  return owned?.parts.find((p) => p.part === part) ?? null;
}

export interface FilterChip {
  id: string;
  label: string;
}

/** Chip id for mastery magic or mastery crafts. */
export const MASTERY_CHIP = 'mastery';
/** Chip id for magic or crafting skills without a school or base craft. */
export const GENERAL_CHIP = 'general';

/**
 * Chip ids a skill shows under. Standard: its archetype. Magic: its school, Mastery magic, or
 * General. Crafting: its base craft, Mastery crafts, or General. Multi: every archetype it can
 * belong to.
 */
export function skillChipIds(skill: Skill): string[] {
  switch (skill.category) {
    case 'standard':
      return skill.archetype ? [skill.archetype] : [];
    case 'magic':
      if (skill.type === 'mastery') return [MASTERY_CHIP];
      return [skill.school ?? GENERAL_CHIP];
    case 'crafting':
      if (skill.type === 'mastery') return [MASTERY_CHIP];
      return [skill.discipline ?? GENERAL_CHIP];
    case 'multi':
      return [...(skill.archetypeOptions ?? (skill.archetype ? [skill.archetype] : []))];
  }
}

/** Filter chips for one tab, in rules order, for groups that have at least one skill. */
export function filterChips(ruleset: Ruleset, category: SkillCategory): FilterChip[] {
  const used = new Set(
    ruleset.skills.filter((s) => s.category === category).flatMap((s) => skillChipIds(s)),
  );
  let chips: FilterChip[];
  switch (category) {
    case 'standard':
      chips = STANDARD_ARCHETYPES.map((id) => ({ id, label: archetypeName(ruleset, id) }));
      break;
    case 'magic':
      chips = [
        ...ruleset.ruleset.magicSchools.map((s) => ({ id: s.id, label: s.name })),
        { id: MASTERY_CHIP, label: 'Mastery magic' },
        { id: GENERAL_CHIP, label: 'General' },
      ];
      break;
    case 'crafting':
      chips = [
        ...ruleset.ruleset.craftingDisciplines.map((d) => ({ id: d.id, label: d.name })),
        { id: MASTERY_CHIP, label: 'Mastery crafts' },
        { id: GENERAL_CHIP, label: 'General' },
      ];
      break;
    case 'multi':
      chips = poolsForCategory(ruleset, category).map((id) => ({
        id,
        label: archetypeName(ruleset, id),
      }));
      break;
  }
  return chips.filter((c) => used.has(c.id));
}

export interface SkillFilter {
  category: SkillCategory;
  /** Chip ids from `filterChips` to show; empty shows all. */
  chips: readonly string[];
  query: string;
  ownedOnly: boolean;
}

/** Skills of one tab, filtered by its chips, a name search, and "owned only". */
export function filterSkills(ruleset: Ruleset, sheet: Sheet, filter: SkillFilter): Skill[] {
  const query = filter.query.trim().toLowerCase();
  const owned = new Set(
    sheet.skills.filter((s) => s.parts.some((p) => p.level > 0)).map((s) => s.skillId),
  );
  return ruleset.skills.filter((skill) => {
    if (skill.category !== filter.category) return false;
    if (filter.chips.length > 0 && !skillChipIds(skill).some((id) => filter.chips.includes(id)))
      return false;
    if (query && !skillDisplayName(ruleset, skill).toLowerCase().includes(query)) return false;
    if (filter.ownedOnly && !owned.has(skill.id)) return false;
    return true;
  });
}

/** AP pools a tab's skills earn or spend, in ruleset order. */
export function poolsForCategory(ruleset: Ruleset, category: SkillCategory): string[] {
  const used = new Set<string>();
  for (const skill of ruleset.skills) {
    if (skill.category !== category) continue;
    if (skill.archetype) used.add(skill.archetype);
    for (const a of skill.archetypeOptions ?? []) used.add(a);
  }
  return ruleset.archetypes.map((a) => a.id).filter((id) => used.has(id));
}

export interface CreationGroup {
  id: string;
  title: string;
  skills: Skill[];
}

/** Skills of a category with a part allowed at creation, grouped by archetype, name search. */
export function creationGroups(
  ruleset: Ruleset,
  category: SkillCategory,
  query: string,
): CreationGroup[] {
  const q = query.trim().toLowerCase();
  const skills = ruleset.skills.filter(
    (s) =>
      s.category === category &&
      skillParts(s).some((p) => allowedAtCreation(s, p)) &&
      (q === '' || skillDisplayName(ruleset, s).toLowerCase().includes(q)),
  );
  if (category === 'standard')
    return STANDARD_ARCHETYPES.map((id) => ({
      id,
      title: archetypeName(ruleset, id),
      skills: skills.filter((s) => s.archetype === id),
    })).filter((g) => g.skills.length > 0);
  const title = category === 'multi' ? 'Multi-archetype' : archetypeName(ruleset, category);
  return skills.length > 0 ? [{ id: category, title, skills }] : [];
}
