// Create wizard: the draft, the step list, and each step's checks. Pure, so it is unit tested.
// To add a step (starting items), add an entry to WIZARD_STEPS and a view for
// its id in CreatePage.tsx.
import {
  apEarnedByBasic,
  cumulativeCost,
  deriveSheet,
  plan,
  preview,
  type CreateCharacterCommand,
  type Notice,
  type RuleError,
  type Ruleset,
  type Sheet,
} from '../../../engine/index.ts';
import type { SkillPart } from '../../../engine/model.ts';
import {
  DEFAULT_START_AGE,
  NEW_CHARACTER_AGE,
  parseAge,
  profileFieldErrors,
} from './validation.ts';
import type { SetStartingItemsCommand } from '../../../engine/index.ts';
import { picksFromCounts, totalCount } from '../character/extras/startingItems.ts';

/** One starting skill pick: every level up to `level` of one part is bought. */
export interface StartingPick {
  skillId: string;
  part: SkillPart;
  level: number;
}

export interface WizardDraft {
  characterName: string;
  playerName: string;
  playerEmail: string;
  /** Age step as typed (2 to 10). */
  age: string;
  ancestryId: string;
  subtypeId: string;
  extraInfection: number;
  /** Cryptid From Legends: the ability it copies ('' until chosen). */
  fromLegendsChoice: string;
  /** Ability raised to level 2 by the starting LXP ('' until chosen). */
  startingLxpAbilityId: string;
  /** Starting skills, in the order they were first picked. */
  startingSkills: StartingPick[];
  /** Multi-archetype skills: the archetype chosen for each skill id. */
  skillArchetypes: Record<string, string>;
  /** Starting equipment: how many times each option is picked (repeats allowed). */
  startingItems: Record<string, number>;
}

export const EMPTY_DRAFT: WizardDraft = {
  characterName: '',
  playerName: '',
  playerEmail: '',
  age: DEFAULT_START_AGE,
  ancestryId: '',
  subtypeId: '',
  extraInfection: 0,
  fromLegendsChoice: '',
  startingLxpAbilityId: '',
  startingSkills: [],
  skillArchetypes: {},
  startingItems: {},
};

/** Field errors by draft key, plus whole-step problems under `form`. */
export type DraftErrors = { [K in keyof WizardDraft]?: string } & { form?: string[] };

export type StepId = 'names' | 'ancestry' | 'lxp' | 'skills' | 'items' | 'review';

export interface WizardStep {
  id: StepId;
  title: string;
  validate: (draft: WizardDraft, ruleset: Ruleset) => DraftErrors;
}

export function hasErrors(errors: DraftErrors): boolean {
  return Object.values(errors).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v)));
}

/** Every message in an errors object, fields first, for the error summary. */
export function errorMessages(errors: DraftErrors): string[] {
  const list: string[] = [];
  for (const [key, value] of Object.entries(errors)) {
    if (key === 'form') continue;
    if (typeof value === 'string' && value) list.push(value);
  }
  return [...list, ...(errors.form ?? [])];
}

/** Ancestry, subtype entry, and whether extra infection and From Legends apply. */
export function ancestryInfo(draft: WizardDraft, ruleset: Ruleset) {
  const ancestry = draft.ancestryId ? ruleset.ancestriesById[draft.ancestryId] : undefined;
  const entry = draft.subtypeId ? ruleset.subtypesById[draft.subtypeId] : undefined;
  const subtype =
    entry && ancestry && entry.ancestry.id === ancestry.id ? entry.subtype : undefined;
  return {
    ancestry,
    subtype,
    /** Aware use Connection Damage and cannot take extra infection. */
    allowsExtraInfection: ancestry !== undefined && ancestry.infectionTrack === 'infection',
    fromLegends: ancestry?.sharedAbility.choice,
  };
}

/** Picks an ancestry and clears the choices that depended on the old one. */
export function selectAncestry(draft: WizardDraft, ancestryId: string): WizardDraft {
  if (draft.ancestryId === ancestryId) return draft;
  return {
    ...draft,
    ancestryId,
    subtypeId: '',
    extraInfection: 0,
    fromLegendsChoice: '',
    startingLxpAbilityId: '',
  };
}

/** Picks a subtype; a starting LXP pick on the old subtype ability is cleared. */
export function selectSubtype(
  draft: WizardDraft,
  subtypeId: string,
  ruleset: Ruleset,
): WizardDraft {
  if (draft.subtypeId === subtypeId) return draft;
  const old = draft.subtypeId ? ruleset.subtypesById[draft.subtypeId]?.subtype.ability.id : '';
  return {
    ...draft,
    subtypeId,
    startingLxpAbilityId: draft.startingLxpAbilityId === old ? '' : draft.startingLxpAbilityId,
  };
}

/**
 * Archetype a starting pick of this skill is bought in: its own archetype, the one chosen for a
 * multi-archetype skill, or (same-as-skill) the one chosen for the skill it follows.
 */
export function pickArchetype(
  draft: WizardDraft,
  ruleset: Ruleset,
  skillId: string,
): string | undefined {
  const skill = ruleset.skillsById[skillId];
  if (!skill) return undefined;
  if (skill.archetype !== undefined) return skill.archetype;
  const rule = skill.archetypeRule;
  if (rule?.kind === 'same-as-skill') return draft.skillArchetypes[rule.skill] || undefined;
  return draft.skillArchetypes[skillId] || undefined;
}

/** Level picked for one part (0 when not picked). */
export function pickLevel(draft: WizardDraft, skillId: string, part: SkillPart): number {
  return draft.startingSkills.find((p) => p.skillId === skillId && p.part === part)?.level ?? 0;
}

/** Sets the picked level of one part; 0 removes the pick. */
export function setPickLevel(
  draft: WizardDraft,
  skillId: string,
  part: SkillPart,
  level: number,
): WizardDraft {
  const others = draft.startingSkills.filter((p) => !(p.skillId === skillId && p.part === part));
  if (level <= 0) return { ...draft, startingSkills: others };
  const index = draft.startingSkills.findIndex((p) => p.skillId === skillId && p.part === part);
  const pick: StartingPick = { skillId, part, level };
  const startingSkills =
    index === -1
      ? [...draft.startingSkills, pick]
      : draft.startingSkills.map((p, i) => (i === index ? pick : p));
  return { ...draft, startingSkills };
}

export interface PoolTotals {
  archetype: string;
  earned: number;
  spent: number;
  left: number;
}

export interface PickTotals {
  /** 250 plus the infection bonus. */
  cxpTotal: number;
  cxpSpent: number;
  cxpLeft: number;
  /** AP per pool the picks earn or spend, in ruleset order; pools with no activity left out. */
  pools: PoolTotals[];
}

/** CXP and AP math for the starting skill picks, from the engine's cost tables. */
export function pickTotals(draft: WizardDraft, ruleset: Ruleset): PickTotals {
  const { allowsExtraInfection } = ancestryInfo(draft, ruleset);
  const bonus = allowsExtraInfection
    ? draft.extraInfection * ruleset.ruleset.extraInfection.cxpPerLevel
    : 0;
  const cxpTotal = ruleset.ruleset.startingCxp + bonus;
  let cxpSpent = 0;
  const earned = new Map<string, number>();
  const spent = new Map<string, number>();
  const add = (map: Map<string, number>, key: string, amount: number) =>
    map.set(key, (map.get(key) ?? 0) + amount);
  for (const pick of draft.startingSkills) {
    const def = ruleset.skillsById[pick.skillId]?.parts[pick.part];
    if (!def) continue;
    const cost = cumulativeCost(ruleset, def.costKind, pick.level);
    const archetype = pickArchetype(draft, ruleset, pick.skillId);
    if (def.costKind === 'basic') {
      cxpSpent += cost;
      if (archetype) add(earned, archetype, apEarnedByBasic(ruleset, pick.level));
    } else if (archetype) {
      add(spent, archetype, cost);
    }
  }
  const pools = ruleset.archetypes
    .map((a) => a.id)
    .filter((id) => earned.has(id) || spent.has(id))
    .map((id) => {
      const e = earned.get(id) ?? 0;
      const s = spent.get(id) ?? 0;
      return { archetype: id, earned: e, spent: s, left: e - s };
    });
  return { cxpTotal, cxpSpent, cxpLeft: cxpTotal - cxpSpent, pools };
}

export type DryRun =
  { ok: true; sheet: Sheet; notices: Notice[] } | { ok: false; errors: RuleError[] };

/** Plans createCharacter for the draft without saving: the engine's verdict and the sheet. */
export function dryRunCreate(draft: WizardDraft, ruleset: Ruleset): DryRun {
  let n = 0;
  const result = plan(ruleset, deriveSheet(ruleset, []), toCreateCommand(draft, ruleset), {
    actor: { role: 'staff' },
    now: () => '2000-01-01T00:00:00.000Z',
    newId: () => `dry-run-${++n}`,
    nextSeq: 1,
  });
  if (!result.ok) return result;
  return { ok: true, sheet: deriveSheet(ruleset, result.actions), notices: result.notices };
}

/** Builds the createCharacter command, with the starting skills and their archetypes. */
export function toCreateCommand(draft: WizardDraft, ruleset: Ruleset): CreateCharacterCommand {
  const email = draft.playerEmail.trim();
  const age = parseAge(draft.age);
  const startingSkills = draft.startingSkills.map((pick) => {
    const skill = ruleset.skillsById[pick.skillId];
    const archetype =
      skill && skill.archetype === undefined && skill.archetypeRule?.kind !== 'same-as-skill'
        ? draft.skillArchetypes[pick.skillId]
        : undefined;
    return { ...pick, ...(archetype ? { archetype } : {}) };
  });
  return {
    type: 'createCharacter',
    characterName: draft.characterName.trim(),
    playerName: draft.playerName.trim(),
    ...(email ? { playerEmail: email } : {}),
    ...(age !== undefined ? { age } : {}),
    ancestryId: draft.ancestryId,
    subtypeId: draft.subtypeId,
    extraInfection: draft.extraInfection,
    ...(draft.fromLegendsChoice ? { fromLegendsChoice: draft.fromLegendsChoice } : {}),
    ...(draft.startingLxpAbilityId ? { startingLxpAbilityId: draft.startingLxpAbilityId } : {}),
    ...(startingSkills.length > 0 ? { startingSkills } : {}),
  };
}

function validateNames(draft: WizardDraft): DraftErrors {
  return profileFieldErrors(draft, NEW_CHARACTER_AGE);
}

function validateAncestry(draft: WizardDraft, ruleset: Ruleset): DraftErrors {
  const errors: DraftErrors = {};
  const { ancestry, subtype, allowsExtraInfection, fromLegends } = ancestryInfo(draft, ruleset);
  if (!ancestry) {
    errors.ancestryId = 'Choose an ancestry.';
    return errors;
  }
  if (!subtype) errors.subtypeId = `Choose a subtype for ${ancestry.name}.`;
  const max = ruleset.ruleset.extraInfection.maxLevels;
  if (!allowsExtraInfection && draft.extraInfection > 0)
    errors.extraInfection = `${ancestry.name} cannot take extra infection levels.`;
  else if (draft.extraInfection < 0 || draft.extraInfection > max)
    errors.extraInfection = `Extra infection is 0 to ${max} levels.`;
  if (fromLegends) {
    if (!draft.fromLegendsChoice)
      errors.fromLegendsChoice = `Choose the ability ${ancestry.sharedAbility.name} copies.`;
    else if (!fromLegends.allowedAbilityIds.includes(draft.fromLegendsChoice))
      errors.fromLegendsChoice = `${ancestry.sharedAbility.name} cannot copy that ability.`;
  }
  return errors;
}

function validateLxp(draft: WizardDraft, ruleset: Ruleset): DraftErrors {
  const { ancestry, subtype } = ancestryInfo(draft, ruleset);
  const ids = [ancestry?.sharedAbility.id, subtype?.ability.id];
  if (!draft.startingLxpAbilityId || !ids.includes(draft.startingLxpAbilityId))
    return { startingLxpAbilityId: 'Choose which ability starts at level 2.' };
  return {};
}

function validateSkills(draft: WizardDraft, ruleset: Ruleset): DraftErrors {
  const result = dryRunCreate(draft, ruleset);
  return result.ok ? {} : { form: result.errors.map((e) => e.message) };
}

/** The setStartingItems command run right after creation, or null when nothing is picked. */
export function toStartingItemsCommand(
  draft: WizardDraft,
  ruleset: Ruleset,
): SetStartingItemsCommand | null {
  const order = ruleset.startingItems.options.map((o) => o.id);
  const picks = picksFromCounts(draft.startingItems, order);
  return picks.length > 0 ? { type: 'setStartingItems', picks } : null;
}

function validateStartingItems(draft: WizardDraft, ruleset: Ruleset): DraftErrors {
  const max = ruleset.startingItems.rules.picks;
  const total = totalCount(draft.startingItems);
  return total > max
    ? { startingItems: `Choose at most ${max} starting items; ${total} chosen.` }
    : {};
}

function validateReview(draft: WizardDraft, ruleset: Ruleset): DraftErrors {
  const result = preview(ruleset, deriveSheet(ruleset, []), toCreateCommand(draft, ruleset));
  return result.allowed ? {} : { form: result.reasons };
}

export const WIZARD_STEPS: readonly WizardStep[] = [
  { id: 'names', title: 'Names', validate: validateNames },
  { id: 'ancestry', title: 'Ancestry and subtype', validate: validateAncestry },
  { id: 'lxp', title: 'Starting LXP', validate: validateLxp },
  { id: 'skills', title: 'Starting skills', validate: validateSkills },
  { id: 'items', title: 'Starting items', validate: validateStartingItems },
  { id: 'review', title: 'Review and create', validate: validateReview },
];
