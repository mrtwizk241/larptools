// Plain-English labels, filters, and states for the Skills screens. Pure, so it is unit tested.
import {
  abilityStates,
  checkPrereqs,
  displayContext,
  displayRuleText,
  skillDisplayNameFor,
  hasTechnique,
  stepOrderProblem,
  type AbilityState,
  type NamedLevelId,
  type OwnedSkill,
  type Ruleset,
  type Sheet,
  type SheetSkill,
  type SkillStep,
  type TechniqueId,
} from '../../../../engine/index.ts';
import { LOCAL_MODE } from '../../../../localMode.ts';
import type { CharacterView } from '../view.ts';

const NOT_OWNED_SKILL: OwnedSkill = { level: 0, techniques: [] };

/** Any skill from the rules data: regular, racial, or Calling. */
export type Skill = NonNullable<Ruleset['skillsById'][string]>;

export type SkillCategory =
  'offensive' | 'defensive' | 'utility' | 'magic' | 'crafting' | 'racial' | 'calling';

const ALL_CATEGORIES: readonly { id: SkillCategory; label: string }[] = [
  { id: 'offensive', label: 'Offensive' },
  { id: 'defensive', label: 'Defensive' },
  { id: 'utility', label: 'Utility' },
  { id: 'magic', label: 'Magic' },
  { id: 'crafting', label: 'Crafting' },
  { id: 'racial', label: 'Racial' },
  { id: 'calling', label: 'Calling' },
];

/** Skill tabs in order. The Character Playground puts the racial skills first. */
export const CATEGORIES: readonly { id: SkillCategory; label: string }[] = LOCAL_MODE
  ? [
      ...ALL_CATEGORIES.filter((c) => c.id === 'racial'),
      ...ALL_CATEGORIES.filter((c) => c.id !== 'racial'),
    ]
  : ALL_CATEGORIES;

export function isCategory(value: string | null): value is SkillCategory {
  return CATEGORIES.some((c) => c.id === value);
}

export function categoryLabel(category: string): string {
  return CATEGORIES.find((c) => c.id === category)?.label ?? category;
}

/** "Expert", "Grandmaster". */
export function namedLabel(named: NamedLevelId): string {
  return `${named[0]?.toUpperCase() ?? ''}${named.slice(1)}`;
}

/** "level 4", "Expert Technique". */
export function stepText(step: SkillStep): string {
  return 'level' in step ? `level ${step.level}` : `${namedLabel(step.technique)} Technique`;
}

/** "Level 4", "Expert Technique" (sentence start). */
export function stepTitle(step: SkillStep): string {
  return 'level' in step ? `Level ${step.level}` : `${namedLabel(step.technique)} Technique`;
}

export function sameStep(a: SkillStep, b: SkillStep): boolean {
  if ('level' in a) return 'level' in b && a.level === b.level;
  return 'technique' in b && a.technique === b.technique;
}

/** The skill as owned on the sheet, or undefined. */
export function ownedSkill(sheet: Sheet, skillId: string): SheetSkill | undefined {
  return sheet.skills.find((s) => s.skillId === skillId);
}

/** Level and Techniques of any skill on the sheet (level 0 when not owned). */
export function ownedLookup(sheet: Sheet) {
  return (skillId: string) => {
    const s = ownedSkill(sheet, skillId);
    return s ? { level: s.level, techniques: s.techniques } : NOT_OWNED_SKILL;
  };
}

/** Skills of one tab: regular skills by category, the race's skills, the Calling skills. */
export function skillsForCategory(
  ruleset: Ruleset,
  sheet: Sheet,
  category: SkillCategory,
): Skill[] {
  if (category === 'racial') {
    const raceId = sheet.race?.raceId;
    return raceId ? [...(ruleset.racesById[raceId]?.skills ?? [])] : [];
  }
  if (category === 'calling') {
    const ids = [sheet.calling, ...sheet.formerCallings]
      .filter((c) => c !== null)
      .map((c) => c.callingId);
    const out: Skill[] = [];
    for (const id of ids)
      for (const skill of ruleset.callingsById[id]?.skills ?? [])
        if (!out.some((s) => s.id === skill.id)) out.push(skill);
    return out;
  }
  return ruleset.skills.filter((s) => s.category === category);
}

export interface SkillFilter {
  category: SkillCategory;
  query: string;
  ownedOnly: boolean;
}

/** Skills of one tab, filtered by a name search and "Owned only". */
export function filterSkills(ruleset: Ruleset, sheet: Sheet, filter: SkillFilter): Skill[] {
  const query = filter.query.trim().toLowerCase();
  return skillsForCategory(ruleset, sheet, filter.category).filter((skill) => {
    if (filter.ownedOnly && (ownedSkill(sheet, skill.id)?.level ?? 0) === 0) return false;
    if (query === '') return true;
    const names = [skill.name, skillName(ruleset, sheet, skill.id), ...(skill.aliases ?? [])];
    return names.some((n) => n.toLowerCase().includes(query));
  });
}

/** True for a skill of a Calling the character left (kept, not usable). */
export function isLockedSkill(sheet: Sheet, skill: Skill): boolean {
  if (ownedSkill(sheet, skill.id)?.locked) return true;
  return (
    skill.category === 'calling' &&
    'callingId' in skill &&
    sheet.calling?.callingId !== skill.callingId
  );
}

/** Advanced skill whose prerequisites are not all met yet. */
export function prereqsMissing(ruleset: Ruleset, sheet: Sheet, skill: Skill): boolean {
  return skill.advanced && !checkPrereqs(ruleset, skill, ownedLookup(sheet)).ok;
}

/** "Level 3", or "Not learned". */
export function levelText(owned: SheetSkill | undefined): string {
  return owned && owned.level > 0 ? `Level ${owned.level}` : 'Not learned';
}

/** "1 use", "3 uses". */
export function usesText(count: number): string {
  return `${count} ${count === 1 ? 'use' : 'uses'}`;
}

export function kindText(kind: AbilityState['kind']): string {
  if (kind === 'active') return 'Active';
  if (kind === 'passive') return 'Passive';
  return 'Active and passive';
}

/** "2 uses", or "No uses" for a passive. */
export function abilityCostText(ability: Pick<AbilityState, 'uses' | 'kind'>): string {
  return ability.uses === 0 ? 'No uses' : usesText(ability.uses);
}

export interface AbilityCard extends AbilityState {
  /** Level the named ability belongs to (1, 3, 6, 10). */
  level: number;
  /** Why it cannot be used yet, else null. */
  lockedReason: string | null;
}

/**
 * One card per named ability, with whether it is unlocked and why not. Above Basic, reaching
 * the level is not enough: the Technique unlocks it ([SKL-TECH], Rulebook p.88).
 */
export function abilityCards(ruleset: Ruleset, sheet: Sheet, skill: Skill): AbilityCard[] {
  const owned = ownedSkill(sheet, skill.id);
  const state = owned ? { level: owned.level, techniques: owned.techniques } : NOT_OWNED_SKILL;
  const levels = ruleset.ruleset.skills.namedLevels;
  const left = owned?.locked === true;
  return abilityStates(skill, state).map((a) => {
    const level = levels[a.named];
    let lockedReason: string | null = null;
    if (left && owned) lockedReason = 'Locked: the character left this Calling.';
    else if (!a.unlocked)
      lockedReason =
        a.named === 'basic'
          ? 'Needs level 1.'
          : state.level >= level
            ? `Needs the ${namedLabel(a.named)} Technique (level ${level} reached).`
            : `Needs level ${level} and the ${namedLabel(a.named)} Technique.`;
    return {
      ...a,
      summary: skillText(ruleset, sheet, a.summary),
      unlocked: a.unlocked && !left,
      level,
      lockedReason,
    };
  });
}

export interface PrereqItem {
  skillId: string;
  name: string;
  technique: TechniqueId;
  met: boolean;
}

export interface PrereqGroupState {
  /** "Needs", "One of", "2 of". */
  lead: string;
  met: boolean;
  items: PrereqItem[];
}

/** Advanced skill prerequisites, group by group, with met or missing state ([SKL-ADV]). */
export function prereqGroups(ruleset: Ruleset, sheet: Sheet, skill: Skill): PrereqGroupState[] {
  const owned = ownedLookup(sheet);
  return skill.prereqs.map((group) => {
    const items = group.of.map((r) => ({
      skillId: r.skill,
      name: ruleset.skillsById[r.skill]?.name ?? r.skill,
      technique: r.technique,
      met: hasTechnique(owned(r.skill), r.technique),
    }));
    const count = items.filter((i) => i.met).length;
    const lead =
      group.need === group.of.length
        ? group.of.length === 1
          ? 'Needs'
          : 'All of'
        : group.need === 1
          ? 'One of'
          : `${group.need} of`;
    return { lead, met: count >= group.need, items };
  });
}

const STAT_WORDS: Readonly<Record<string, string>> = {
  lifePoints: 'Life Points',
  armorPoints: 'Armor Points',
  armorRefitCount: 'armor refits',
  bleedOutSeconds: 'bleed out count (seconds)',
  passiveDamage1h: 'passive damage with one-handed weapons',
  passiveDamage2h: 'passive damage with two-handed weapons',
  passiveDamageWeapon: 'passive damage with all weapons',
  passiveDamageBehind: 'passive damage from behind',
  passiveDamageRanged: 'passive damage with ranged weapons',
  passiveDamageRelic: 'passive damage with Relics',
  attunementSlots: 'Attunement Slots',
  lesserBoonSlots: 'Lesser Boon Slots',
  languages: 'languages read and written',
  battleUnitSize: 'Battle Unit members',
  familiarLocations: 'familiarized locations',
  familiarTrees: 'familiarized trees',
  storedEnergyMax: 'stored energy at most',
  checkInBasicComponents: 'Basic Components at check-in',
  upkeepCovered: 'upkeep covered (Silver)',
};

/** "passive damage with Relics" for `passiveDamageRelic`; unknown ids are split into words. */
export function statWords(stat: string): string {
  return STAT_WORDS[stat] ?? stat.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/** "dual wield long short" for `dual-wield-long-short`. */
export function grantWords(grant: string): string {
  const text = grant.replace(/-/g, ' ');
  return `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`;
}

function signed(amount: number): string {
  return amount > 0 ? `+${amount}` : String(amount);
}

export interface PassiveLine {
  at: NamedLevelId;
  /** "Expert Technique", "Basic". */
  atText: string;
  text: string;
}

/** The fixed numbers, scaling numbers, and always-on benefits the skill adds. */
export function passiveLines(skill: Skill): PassiveLine[] {
  const atText = (at: NamedLevelId) => (at === 'basic' ? 'Basic' : `${namedLabel(at)} Technique`);
  const lines: PassiveLine[] = [];
  for (const p of skill.passives ?? []) {
    let text =
      p.op === 'set'
        ? `${statWords(p.stat)}: ${p.amount}`
        : `${signed(p.amount)} ${statWords(p.stat)}`;
    if (p.basis === 'level') text += ' for each named level reached';
    if (p.when) text += ` (${p.when})`;
    lines.push({ at: p.at, atText: atText(p.at), text });
  }
  for (const d of skill.derived ?? []) {
    let text =
      d.perLevel !== undefined
        ? `${signed(d.perLevel)} ${statWords(d.stat)} per level`
        : `${statWords(d.stat)}: ${d.amount ?? 0}`;
    if (d.note) text += ` (${d.note})`;
    lines.push({ at: d.at, atText: atText(d.at), text });
  }
  for (const g of skill.grants ?? []) {
    const text = g.note ? `${grantWords(g.grant)} (${g.note})` : grantWords(g.grant);
    lines.push({ at: g.at, atText: atText(g.at), text });
  }
  return lines;
}

/** The next level and the next Technique, when the step order allows them now. */
export function nextSteps(ruleset: Ruleset, sheet: Sheet, skill: Skill): SkillStep[] {
  const owned = ownedLookup(sheet)(skill.id);
  const candidates: SkillStep[] = [];
  if (owned.level < ruleset.ruleset.skills.maxLevel) candidates.push({ level: owned.level + 1 });
  const next = ownedSkill(sheet, skill.id)?.nextTechnique?.technique;
  if (next) candidates.push({ technique: next });
  return candidates.filter((step) => stepOrderProblem(ruleset, owned, step) === null);
}

/** Players send learnings for an approved character that is not retired. Staff edit directly. */
export function canRequest(view: CharacterView): boolean {
  return (
    !view.isStaff && !view.sheet.retired && (view.status === undefined || view.status === 'active')
  );
}

/** A player may ask for this skill: a next step exists and it is not a left Calling's skill. */
export function requestable(view: CharacterView, skill: Skill): boolean {
  return (
    canRequest(view) &&
    !isLockedSkill(view.sheet, skill) &&
    nextSteps(view.ruleset, view.sheet, skill).length > 0
  );
}

/** Name of an attended event, else the key. */
export function eventName(sheet: Sheet, key: string): string {
  return sheet.events.find((e) => e.key === key)?.name ?? key;
}

/** Events the character attended, newest first (for the event pickers). */
export function eventsNewestFirst(sheet: Sheet): Sheet['events'][number][] {
  return [...sheet.events].sort((a, b) => b.date.localeCompare(a.date));
}

/** The name to show for any skill, owned or not, with the character's race choices filled in
 * ("Fire's Gift" for a Fire Dragonborn). The skill id never changes. */
export function skillName(ruleset: Ruleset, sheet: Sheet, skillId: string): string {
  return (
    ownedSkill(sheet, skillId)?.displayName ?? skillDisplayNameFor(ruleset, skillId, sheet.race)
  );
}

/** A rule text with the character's race choices filled in ("your element" becomes Fire). */
export function skillText(ruleset: Ruleset, sheet: Sheet, text: string): string {
  return displayRuleText(text, displayContext(ruleset, sheet.race));
}

/** The tab Skills opens on: the first category with an owned skill, else Offensive (AC-5). */
export function defaultCategory(sheet: Sheet): SkillCategory {
  const owned = new Set(sheet.skills.filter((s) => s.level > 0).map((s) => s.category));
  return CATEGORIES.find((c) => owned.has(c.id))?.id ?? 'offensive';
}

/** The character has this named level's passive now: Basic from level 1, the others with their Technique. */
export function passiveOwned(mine: SheetSkill | undefined, at: NamedLevelId): boolean {
  if (!mine || mine.level < 1 || mine.locked) return false;
  return at === 'basic' || mine.techniques.includes(at);
}
