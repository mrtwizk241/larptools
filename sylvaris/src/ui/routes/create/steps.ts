// Create wizard: the draft, the step list, each step's checks, and the commands the wizard sends.
// Pure (no React), so it is unit tested. The rules engine has the last word: every step that
// depends on the rules runs a dry-run plan of the commands.
import {
  cumulativeLevelCost,
  deriveSheet,
  plan,
  retirementStartingXp,
  techniqueCost,
  type AddJournalCommand,
  type Command,
  type CreateCharacterCommand,
  type LearnSkillCommand,
  type Notice,
  type RuleError,
  type Ruleset,
  type SetStartingItemsCommand,
  type Sheet,
  type TechniqueId,
} from '../../../engine/index.ts';
import type { SyRace, SySkill } from '../../../data/index.ts';
import type { Action } from '../../../engine/model.ts';
import { statWords } from '../character/skills/skillInfo.ts';
import { LOCAL_MODE } from '../../../localMode.ts';

/**
 * One starting skill: every level up to `level`, plus the Expert Technique when `expert`. A
 * retirement rebuild may also take the Master and Grandmaster Techniques ([RET-REBUILD]).
 */
export interface SkillPick {
  skillId: string;
  level: number;
  expert: boolean;
  master?: boolean;
  grandmaster?: boolean;
}

/** A character built from a retirement carry-over (staff, [RET-REBUILD]). */
export interface RetirementSource {
  /** The retired character, which records where its carry-over went. */
  characterId: string;
  fromName: string;
  xp: number;
  cxp: number;
  axp: number;
  coinCopper: number;
}

export interface WizardDraft {
  characterName: string;
  /** Staff only; a player's name and email come from their account. */
  playerName: string;
  playerEmail: string;
  concept: string;
  raceId: string;
  /** Race choices by choice id (element, natural weapon, size, extra language, text ones). */
  choices: Record<string, string>;
  literacy: 'race-language' | 'common';
  ageCategory: number;
  /** In the order they were first picked. */
  skills: SkillPick[];
  /** Starting items: option id to one detail per pick ('' when the option needs none or none yet). */
  items: Record<string, string[]>;
  backstory: string;
  /** Set in retirement mode: the carry-over this character is built from. */
  retirement: RetirementSource | null;
}

export const EMPTY_DRAFT: WizardDraft = {
  characterName: '',
  // The no-login builder has no accounts: the player name starts filled in (and can be changed).
  playerName: LOCAL_MODE ? 'You' : '',
  playerEmail: '',
  concept: '',
  raceId: '',
  choices: {},
  literacy: 'race-language',
  ageCategory: 2,
  skills: [],
  items: {},
  backstory: '',
  retirement: null,
};

export const MAX_CHARACTER_NAME = 200;
export const MAX_PLAYER_NAME = 100;
export const MAX_CONCEPT = 2000;
export const MAX_BACKSTORY = 20000;
export const MAX_DETAIL = 200;

/** Field errors by key (draft keys, `choice:<id>`, `item:<optionId>:<n>`), plus `form` problems. */
export interface DraftErrors {
  fields: Record<string, string>;
  form: string[];
}

export const NO_ERRORS: DraftErrors = { fields: {}, form: [] };

export function hasErrors(errors: DraftErrors): boolean {
  return Object.keys(errors.fields).length > 0 || errors.form.length > 0;
}

/** Every message, fields first, for the error summary. */
export function errorMessages(errors: DraftErrors): string[] {
  return [...Object.values(errors.fields), ...errors.form];
}

// ---------- Race ----------

export function raceOf(draft: WizardDraft, ruleset: Ruleset): SyRace | undefined {
  return draft.raceId ? ruleset.racesById[draft.raceId] : undefined;
}

/** Picks a race; clears the old race's choices and its racial skill picks. */
export function selectRace(draft: WizardDraft, raceId: string, ruleset: Ruleset): WizardDraft {
  if (draft.raceId === raceId) return draft;
  const skills = draft.skills.filter((pick) => {
    const skill = ruleset.skillsById[pick.skillId];
    return !(skill && 'raceId' in skill && skill.raceId !== raceId);
  });
  return { ...draft, raceId, choices: {}, literacy: 'race-language', skills };
}

/** Sets one race choice; '' removes it. */
export function setChoice(draft: WizardDraft, choiceId: string, value: string): WizardDraft {
  const choices = { ...draft.choices };
  if (value === '') delete choices[choiceId];
  else choices[choiceId] = value;
  return { ...draft, choices };
}

/** The language the character reads and writes: the race's own, or Common. */
export function literacyLanguageId(draft: WizardDraft, race: SyRace): string {
  return draft.literacy === 'common' ? 'common' : race.language;
}

export function languageName(ruleset: Ruleset, id: string): string {
  return ruleset.ruleset.languages.find((l) => l.id === id)?.name ?? id;
}

function words(id: string): string {
  const text = id.replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Fire", "Bite (Greatclaw), base 3 damage", "Small": the label of a pick choice option. */
export function choiceOptionLabel(
  ruleset: Ruleset,
  race: SyRace,
  choiceId: string,
  optionId: string,
): string {
  if (choiceId === 'element')
    return ruleset.ruleset.magicSchools.find((s) => s.id === optionId)?.name ?? words(optionId);
  for (const innate of race.innate) {
    const weapon = innate.naturalWeapon;
    if (weapon?.choiceId !== choiceId) continue;
    const option = weapon.options.find((o) => o.id === optionId);
    if (option)
      return `${words(optionId)}${option.greatclaw ? ' (Greatclaw)' : ''}, base ${option.baseDamage} damage`;
  }
  return words(optionId);
}

/** "Short (about 50 to 75 years)": the lifespan, for the age category hint. */
export const LIFESPAN_TEXT: Record<SyRace['lifespan'], string> = {
  short: 'short, about 50 to 75 years',
  moderate: 'moderate, about 75 to 150 years',
  long: 'long, about 150 to 300 years',
  'extra-long': 'extra long, about 300 to 500 years',
};

// ---------- Skills ----------

export function pickOf(draft: WizardDraft, skillId: string): SkillPick | undefined {
  return draft.skills.find((p) => p.skillId === skillId);
}

/** Sets a starting skill level; 0 removes the pick, below 3 drops the Expert Technique. */
export function setSkillLevel(
  draft: WizardDraft,
  skillId: string,
  level: number,
  ruleset: Ruleset,
): WizardDraft {
  if (level <= 0) return { ...draft, skills: draft.skills.filter((p) => p.skillId !== skillId) };
  const old = pickOf(draft, skillId);
  const keeps = (t: TechniqueId) => (old?.[t] ?? false) && level >= techniqueRow(ruleset, t).level;
  const pick: SkillPick = {
    skillId,
    level,
    expert: keeps('expert'),
    ...(keeps('master') ? { master: true } : {}),
    ...(keeps('grandmaster') ? { grandmaster: true } : {}),
  };
  return {
    ...draft,
    skills: old
      ? draft.skills.map((p) => (p.skillId === skillId ? pick : p))
      : [...draft.skills, pick],
  };
}

export function setExpert(draft: WizardDraft, skillId: string, expert: boolean): WizardDraft {
  return setTechnique(draft, skillId, 'expert', expert);
}

const TECHNIQUE_ORDER: readonly TechniqueId[] = ['expert', 'master', 'grandmaster'];

/** Turns a Technique on or off; turning one off also drops the higher ones. */
export function setTechnique(
  draft: WizardDraft,
  skillId: string,
  technique: TechniqueId,
  on: boolean,
): WizardDraft {
  const from = TECHNIQUE_ORDER.indexOf(technique);
  return {
    ...draft,
    skills: draft.skills.map((p) => {
      if (p.skillId !== skillId) return p;
      if (on) return technique === 'expert' ? { ...p, expert: true } : { ...p, [technique]: true };
      const next: SkillPick = { ...p };
      for (const t of TECHNIQUE_ORDER.slice(from)) {
        if (t === 'expert') next.expert = false;
        else delete next[t];
      }
      return next;
    }),
  };
}

/** The Techniques a pick includes, in order. */
export function pickTechniques(pick: SkillPick): TechniqueId[] {
  return TECHNIQUE_ORDER.filter((t) => pick[t] === true);
}

function techniqueRow(ruleset: Ruleset, id: TechniqueId) {
  const row = ruleset.ruleset.skills.techniques.find((t) => t.id === id);
  if (!row) throw new Error(`The ruleset has no ${id} Technique.`);
  return row;
}

function expertRow(ruleset: Ruleset) {
  return techniqueRow(ruleset, 'expert');
}

/** Level a Technique needs (Expert 3, Master 6, Grandmaster 10). */
export function techniqueLevel(ruleset: Ruleset, id: TechniqueId): number {
  return techniqueRow(ruleset, id).level;
}

/** A retirement rebuild: the creation limits do not apply ([RET-REBUILD]). */
export function isRebuild(draft: WizardDraft, ruleset: Ruleset): boolean {
  return draft.retirement !== null && ruleset.ruleset.retirement.creationLimitsWaived;
}

/** Highest level and the Techniques the wizard offers: creation limits, or none for a rebuild. */
export function skillLimits(
  draft: WizardDraft,
  ruleset: Ruleset,
): { maxLevel: number; techniques: readonly TechniqueId[] } {
  return isRebuild(draft, ruleset)
    ? { maxLevel: ruleset.ruleset.skills.maxLevel, techniques: TECHNIQUE_ORDER }
    : { maxLevel: ruleset.ruleset.creation.maxSkillLevel, techniques: ['expert'] };
}

/** Level the Expert Technique needs (3). */
export function expertLevel(ruleset: Ruleset): number {
  return expertRow(ruleset).level;
}

/** XP for one pick: every level up to it, plus its Techniques. */
export function pickCost(ruleset: Ruleset, pick: SkillPick): number {
  return pickTechniques(pick).reduce(
    (sum, t) => sum + techniqueCost(ruleset, t),
    cumulativeLevelCost(ruleset, pick.level),
  );
}

export interface XpTotals {
  total: number;
  spent: number;
  left: number;
}

/** Starting XP (150, or the retirement share), spent on the picks, and left. */
export function xpTotals(draft: WizardDraft, ruleset: Ruleset): XpTotals {
  const total = draft.retirement
    ? retirementStartingXp(ruleset, draft.retirement.xp)
    : ruleset.ruleset.creation.startingXp;
  const spent = draft.skills.reduce((sum, pick) => sum + pickCost(ruleset, pick), 0);
  return { total, spent, left: total - spent };
}

/** Why an advanced skill cannot be bought at creation: its prerequisites need Master Techniques. */
export function advancedReason(ruleset: Ruleset, skillId: string): string {
  const skill = ruleset.skillsById[skillId];
  if (!skill) return 'Not available at creation.';
  const technique = ruleset.ruleset.skills.advancedPrereqTechnique;
  const groups = skill.prereqs.map((group) =>
    group.of.map((p) => ruleset.skillsById[p.skill]?.name ?? p.skill).join(' or '),
  );
  const needs =
    groups.length > 0
      ? `It needs ${groups.join(', and ')} at the ${words(technique)} Technique`
      : 'It needs Master Techniques';
  return `Not available at creation. ${needs}, and a new character can only reach the Expert Technique.`;
}

// ---------- Starting items ----------

export type DetailKind = 'spell' | 'recipe' | 'performance' | 'element' | 'text';

/** How a pick's detail is chosen: a Basic spell, recipe, or performance, an element, or text. */
export function detailKind(choice: string | undefined): DetailKind | null {
  if (!choice) return null;
  if (choice === 'spell' || choice === 'recipe' || choice === 'performance') return choice;
  if (choice === 'element') return 'element';
  return 'text';
}

/** "weapon type", "craft": the detail's name in a sentence. */
export function detailNoun(choice: string): string {
  return choice.replace(/-/g, ' ');
}

export function itemCount(draft: WizardDraft): number {
  return Object.values(draft.items).reduce((sum, list) => sum + list.length, 0);
}

/** Sets how many times an option is picked, keeping the details already chosen. */
export function setItemCount(draft: WizardDraft, optionId: string, count: number): WizardDraft {
  const old = draft.items[optionId] ?? [];
  const list = Array.from({ length: Math.max(0, count) }, (_, i) => old[i] ?? '');
  const items = { ...draft.items };
  if (list.length === 0) delete items[optionId];
  else items[optionId] = list;
  return { ...draft, items };
}

export function setItemDetail(
  draft: WizardDraft,
  optionId: string,
  index: number,
  detail: string,
): WizardDraft {
  const list = [...(draft.items[optionId] ?? [])];
  list[index] = detail;
  return { ...draft, items: { ...draft.items, [optionId]: list } };
}

const JOURNAL_KINDS = { spell: 'spell', recipe: 'recipe', performance: 'performance' } as const;

/** The name of a spell, recipe, or performance detail, else the text itself. */
export function detailText(ruleset: Ruleset, choice: string | undefined, detail: string): string {
  if (choice === 'spell') return ruleset.spellsById[detail]?.name ?? detail;
  if (choice === 'recipe') return ruleset.recipesById[detail]?.name ?? detail;
  if (choice === 'performance') return ruleset.performancesById[detail]?.name ?? detail;
  if (choice === 'element')
    return ruleset.ruleset.magicSchools.find((s) => s.id === detail)?.name ?? detail;
  return detail;
}

// ---------- Commands ----------

export interface Player {
  name: string;
  email: string;
}

export function toCreateCommand(
  draft: WizardDraft,
  ruleset: Ruleset,
  player?: Player,
): CreateCharacterCommand {
  const race = raceOf(draft, ruleset);
  const choices: Record<string, string> = {};
  for (const def of race?.choices ?? []) {
    const value = draft.choices[def.id]?.trim();
    if (value) choices[def.id] = value;
  }
  const email = (player?.email ?? draft.playerEmail).trim();
  const concept = draft.concept.trim();
  const backstory = draft.backstory.trim();
  return {
    type: 'createCharacter',
    characterName: draft.characterName.trim(),
    playerName: (player?.name ?? draft.playerName).trim(),
    ...(email ? { playerEmail: email } : {}),
    raceId: draft.raceId,
    choices,
    literacy: draft.literacy,
    ageCategory: draft.ageCategory,
    ...(concept ? { concept } : {}),
    ...(backstory ? { backstory } : {}),
    startingSkills: [],
    ...(draft.retirement
      ? {
          retirement: {
            fromName: draft.retirement.fromName,
            xp: draft.retirement.xp,
            cxp: draft.retirement.cxp,
            axp: draft.retirement.axp,
            coinCopper: draft.retirement.coinCopper,
          },
        }
      : {}),
  };
}

/** The coin of a retirement carry-over, listed as owed to the new character. */
export function retirementCoinText(retirement: RetirementSource): string {
  return `${retirement.coinCopper} Copper, retirement carry-over from ${retirement.fromName}`;
}

/** learnSkill commands for the starting skills: each level target, then the Expert Technique. */
export function toSkillCommands(draft: WizardDraft): LearnSkillCommand[] {
  const commands: LearnSkillCommand[] = [];
  for (const pick of draft.skills) {
    if (pick.level <= 0) continue;
    commands.push({ type: 'learnSkill', skillId: pick.skillId, step: { level: pick.level } });
    if (pick.expert)
      commands.push({ type: 'learnSkill', skillId: pick.skillId, step: { technique: 'expert' } });
  }
  return commands;
}

/** Picks in the ruleset's option order. */
function itemPicks(draft: WizardDraft, ruleset: Ruleset) {
  const picks: { optionId: string; detail?: string }[] = [];
  for (const option of ruleset.startingEquipment.options)
    for (const detail of draft.items[option.id] ?? []) {
      const text = detail.trim();
      picks.push({ optionId: option.id, ...(text ? { detail: text } : {}) });
    }
  return picks;
}

export function toItemsCommand(
  draft: WizardDraft,
  ruleset: Ruleset,
): SetStartingItemsCommand | null {
  const picks = itemPicks(draft, ruleset);
  return picks.length > 0 ? { type: 'setStartingItems', picks } : null;
}

/** addJournal commands for the spells, recipes, and performance notes the starting items name. */
export function toJournalCommands(draft: WizardDraft, ruleset: Ruleset): AddJournalCommand[] {
  const commands: AddJournalCommand[] = [];
  for (const pick of itemPicks(draft, ruleset)) {
    const choice = ruleset.startingOptionsById[pick.optionId]?.choice;
    const kind = choice
      ? (JOURNAL_KINDS as Record<string, AddJournalCommand['kind']>)[choice]
      : undefined;
    if (kind && pick.detail)
      commands.push({ type: 'addJournal', kind, refId: pick.detail, source: 'starting' });
  }
  return commands;
}

/** Staff path: the commands run one by one through useCommand, creation first. */
export function staffCommands(draft: WizardDraft, ruleset: Ruleset): Command[] {
  const create = toCreateCommand(draft, ruleset);
  const commands: Command[] = [
    {
      ...create,
      startingSkills: draft.skills
        .filter((p) => p.level > 0)
        .map((p) => ({
          skillId: p.skillId,
          level: p.level,
          techniques: pickTechniques(p),
        })),
    },
  ];
  const items = toItemsCommand(draft, ruleset);
  if (items) commands.push(items);
  commands.push(...toJournalCommands(draft, ruleset));
  // The coin carried over from a retirement is handed over by Logistics ([RET-TRANSFER]).
  if (draft.retirement && draft.retirement.coinCopper > 0)
    commands.push({
      type: 'addOwed',
      text: retirementCoinText(draft.retirement),
      note: `Retirement carry-over from ${draft.retirement.fromName}`,
    });
  return commands;
}

/**
 * Player path: the body for POST /api/submissions (see SubmissionBody). The concept and
 * backstory travel in the createCharacter command; `draft` keeps the wizard answers so the
 * player can change them after staff send the character back.
 */
export function toSubmission(
  draft: WizardDraft,
  ruleset: Ruleset,
  characterId: string,
  player: Player,
) {
  const items = toItemsCommand(draft, ruleset);
  const journals = toJournalCommands(draft, ruleset);
  return {
    characterId,
    draft,
    create: toCreateCommand(draft, ruleset, player),
    skills: toSkillCommands(draft),
    ...(items ? { items } : {}),
    ...(journals.length > 0 ? { journals } : {}),
  };
}

// ---------- Dry run ----------

export type DryRun =
  { ok: true; sheet: Sheet; notices: Notice[] } | { ok: false; errors: RuleError[] };

export type DryRunScope = 'race' | 'skills' | 'items' | 'all';

/**
 * Plans the wizard's commands in a scratch log, without saving: the engine's verdict and the
 * sheet. `race` plans the creation alone, `skills` adds the starting skills, `items` and `all`
 * add the items, journal entries, and backstory.
 */
export function dryRun(draft: WizardDraft, ruleset: Ruleset, scope: DryRunScope = 'all'): DryRun {
  let n = 0;
  const filled: WizardDraft = {
    ...draft,
    characterName: draft.characterName.trim() || 'New character',
    playerName: draft.playerName.trim() || 'Player',
    skills: scope === 'race' ? [] : draft.skills,
    items: scope === 'race' || scope === 'skills' ? {} : draft.items,
    backstory: scope === 'race' || scope === 'skills' ? '' : draft.backstory,
  };
  let actions: Action[] = [];
  const notices: Notice[] = [];
  for (const command of staffCommands(filled, ruleset)) {
    const sheet = deriveSheet(ruleset, actions);
    const result = plan(ruleset, sheet, command, {
      actor: { role: 'staff' },
      now: () => '2000-01-01T00:00:00.000Z',
      newId: () => `dry-run-${++n}`,
      nextSeq: sheet.lastSeq + 1,
    });
    if (!result.ok) return { ok: false, errors: result.errors };
    actions = [...actions, ...result.actions];
    notices.push(...result.notices);
  }
  return { ok: true, sheet: deriveSheet(ruleset, actions), notices };
}

// ---------- Step checks ----------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateProfile(draft: WizardDraft, _ruleset: Ruleset, ctx: StepContext): DraftErrors {
  const fields: Record<string, string> = {};
  const name = draft.characterName.trim();
  if (name === '') fields.characterName = 'Enter the character name.';
  else if (name.length > MAX_CHARACTER_NAME)
    fields.characterName = `Keep the character name to ${MAX_CHARACTER_NAME} characters.`;
  if (!ctx.playerLocked) {
    const player = draft.playerName.trim();
    if (player === '') fields.playerName = 'Enter the player name.';
    else if (player.length > MAX_PLAYER_NAME)
      fields.playerName = `Keep the player name to ${MAX_PLAYER_NAME} characters.`;
    const email = draft.playerEmail.trim();
    if (email !== '' && (!EMAIL.test(email) || email.length > 254))
      fields.playerEmail = 'Enter an email address like name@example.com, or leave it blank.';
  }
  if (draft.concept.trim().length > MAX_CONCEPT)
    fields.concept = `Keep the concept to ${MAX_CONCEPT} characters.`;
  return { fields, form: [] };
}

function validateRace(draft: WizardDraft, ruleset: Ruleset): DraftErrors {
  const fields: Record<string, string> = {};
  const race = raceOf(draft, ruleset);
  if (!race) return { fields: { raceId: 'Choose a race.' }, form: [] };
  const literacyId = literacyLanguageId(draft, race);
  for (const def of race.choices) {
    const value = draft.choices[def.id]?.trim() ?? '';
    if (def.kind === 'pick' && !value)
      fields[`choice:${def.id}`] = `Choose the ${def.label.toLowerCase()} for ${race.name}.`;
    if (def.kind === 'language') {
      if (!value)
        fields[`choice:${def.id}`] = `Choose the ${def.label.toLowerCase()} for ${race.name}.`;
      else if (value === literacyId)
        fields[`choice:${def.id}`] =
          `${languageName(ruleset, value)} is already the language the character reads and writes. Choose another.`;
    }
    if (def.kind === 'text' && value.length > 500)
      fields[`choice:${def.id}`] = `Keep the ${def.label.toLowerCase()} to 500 characters.`;
  }
  const { minAgeCategory, maxAgeCategory } = ruleset.ruleset.creation;
  if (draft.ageCategory < minAgeCategory || draft.ageCategory > maxAgeCategory)
    fields.ageCategory = `Choose an age category from ${minAgeCategory} to ${maxAgeCategory}.`;
  if (Object.keys(fields).length > 0) return { fields, form: [] };
  const result = dryRun(draft, ruleset, 'race');
  return result.ok ? NO_ERRORS : { fields: {}, form: result.errors.map((e) => e.message) };
}

function validateSkills(draft: WizardDraft, ruleset: Ruleset): DraftErrors {
  const result = dryRun(draft, ruleset, 'skills');
  return result.ok ? NO_ERRORS : { fields: {}, form: result.errors.map((e) => e.message) };
}

function validateItems(draft: WizardDraft, ruleset: Ruleset): DraftErrors {
  const fields: Record<string, string> = {};
  const form: string[] = [];
  const max = ruleset.startingEquipment.picks;
  const total = itemCount(draft);
  if (total > max) form.push(`Choose at most ${max} starting items; ${total} chosen.`);
  const seen = new Set<string>();
  for (const option of ruleset.startingEquipment.options) {
    const list = draft.items[option.id] ?? [];
    list.forEach((detail, index) => {
      const key = `item:${option.id}:${index}`;
      const text = detail.trim();
      const label = list.length > 1 ? `${option.name} ${index + 1}` : option.name;
      if (option.choice && text === '') {
        fields[key] = `${label}: choose the ${detailNoun(option.choice)}.`;
        return;
      }
      if (text.length > MAX_DETAIL) fields[key] = `${label}: keep it to ${MAX_DETAIL} characters.`;
      const kind = detailKind(option.choice);
      if (kind === 'spell' || kind === 'recipe' || kind === 'performance') {
        const id = `${kind}:${text}`;
        if (seen.has(id))
          fields[key] =
            `${label}: ${detailText(ruleset, option.choice, text)} is already picked. Choose a different ${kind}.`;
        seen.add(id);
      }
    });
  }
  if (Object.keys(fields).length > 0 || form.length > 0) return { fields, form };
  const result = dryRun(draft, ruleset, 'items');
  return result.ok ? NO_ERRORS : { fields: {}, form: result.errors.map((e) => e.message) };
}

function validateBackstory(draft: WizardDraft): DraftErrors {
  return draft.backstory.trim().length > MAX_BACKSTORY
    ? { fields: { backstory: `Keep the backstory to ${MAX_BACKSTORY} characters.` }, form: [] }
    : NO_ERRORS;
}

function validateReview(draft: WizardDraft, ruleset: Ruleset, ctx: StepContext): DraftErrors {
  for (const step of WIZARD_STEPS) {
    if (step.id === 'review') continue;
    const errors = step.validate(draft, ruleset, ctx);
    if (hasErrors(errors))
      return {
        fields: {},
        form: [`${step.title}: ${errorMessages(errors)[0] ?? 'not finished.'}`],
      };
  }
  const result = dryRun(draft, ruleset, 'all');
  return result.ok ? NO_ERRORS : { fields: {}, form: result.errors.map((e) => e.message) };
}

export type StepId = 'profile' | 'race' | 'skills' | 'items' | 'backstory' | 'review';

export interface StepContext {
  /** A player sending a new character: names come from the account. */
  playerLocked: boolean;
}

export interface WizardStep {
  id: StepId;
  title: string;
  validate: (draft: WizardDraft, ruleset: Ruleset, ctx: StepContext) => DraftErrors;
}

const ALL_STEPS: readonly WizardStep[] = [
  { id: 'profile', title: 'Concept and profile', validate: validateProfile },
  { id: 'race', title: 'Race', validate: validateRace },
  { id: 'skills', title: 'Skills', validate: validateSkills },
  { id: 'items', title: 'Starting items', validate: validateItems },
  { id: 'backstory', title: 'Backstory', validate: validateBackstory },
  { id: 'review', title: 'Review', validate: validateReview },
];

/** The wizard's steps. The Character Playground skips starting items and the backstory. */
export const WIZARD_STEPS: readonly WizardStep[] = LOCAL_MODE
  ? ALL_STEPS.filter((s) => s.id !== 'items' && s.id !== 'backstory')
  : ALL_STEPS;

/** A saved or sent-back draft, made safe: unknown keys dropped, wrong types replaced. */
export function asDraft(value: unknown): WizardDraft {
  const raw = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const text = (key: keyof WizardDraft): string =>
    typeof raw[key] === 'string' ? (raw[key] as string) : (EMPTY_DRAFT[key] as string);
  const record = (v: unknown): Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const choices: Record<string, string> = {};
  for (const [k, v] of Object.entries(record(raw.choices)))
    if (typeof v === 'string') choices[k] = v;
  const items: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(record(raw.items)))
    if (Array.isArray(v)) items[k] = v.map((d) => (typeof d === 'string' ? d : ''));
  const skills: SkillPick[] = Array.isArray(raw.skills)
    ? raw.skills.flatMap((s: unknown) => {
        const r = record(s);
        return typeof r.skillId === 'string' && typeof r.level === 'number'
          ? [
              {
                skillId: r.skillId,
                level: r.level,
                expert: r.expert === true,
                ...(r.master === true ? { master: true } : {}),
                ...(r.grandmaster === true ? { grandmaster: true } : {}),
              },
            ]
          : [];
      })
    : [];
  const ret = record(raw.retirement);
  const whole = (v: unknown) =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0;
  const retirement: RetirementSource | null =
    typeof ret.characterId === 'string' && typeof ret.fromName === 'string'
      ? {
          characterId: ret.characterId,
          fromName: ret.fromName,
          xp: whole(ret.xp),
          cxp: whole(ret.cxp),
          axp: whole(ret.axp),
          coinCopper: whole(ret.coinCopper),
        }
      : null;
  return {
    characterName: text('characterName'),
    playerName: text('playerName'),
    playerEmail: text('playerEmail'),
    concept: text('concept'),
    raceId: text('raceId'),
    choices,
    literacy: raw.literacy === 'common' ? 'common' : 'race-language',
    ageCategory: typeof raw.ageCategory === 'number' ? raw.ageCategory : EMPTY_DRAFT.ageCategory,
    skills,
    items,
    backstory: text('backstory'),
    retirement,
  };
}

// ---------- Hints ----------

/**
 * What a Technique adds to the skill, for the toggle label (acceptance AC-7): its passives
 * ("+20 Life Points"), or the named ability it unlocks ("Expert ability, 2 uses").
 */
export function techniqueGivesText(skill: SySkill, technique: TechniqueId): string {
  const parts: string[] = [];
  for (const p of skill.passives ?? [])
    if (p.at === technique)
      parts.push(
        p.op === 'set'
          ? `${statWords(p.stat)} ${p.amount}`
          : `${p.amount > 0 ? '+' : ''}${p.amount} ${statWords(p.stat)}`,
      );
  for (const d of skill.derived ?? [])
    if (d.at === technique && d.perLevel !== undefined)
      parts.push(`${d.perLevel > 0 ? '+' : ''}${d.perLevel} ${statWords(d.stat)} per level`);
  for (const g of skill.grants ?? [])
    if (g.at === technique) parts.push(g.grant.replace(/-/g, ' '));
  const ability = skill.levels[technique];
  const label = `${technique[0]?.toUpperCase() ?? ''}${technique.slice(1)}`;
  if (ability && ability.kind !== 'passive' && ability.uses > 0)
    parts.push(`${label} ability, ${ability.uses} ${ability.uses === 1 ? 'use' : 'uses'}`);
  if (parts.length === 0) parts.push(`${label} ability`);
  return parts.join(', ');
}

/** Review hints (acceptance AC-7): unspent XP, and skills at level 3 or more without Expert. */
export function reviewHints(draft: WizardDraft, ruleset: Ruleset): string[] {
  const hints: string[] = [];
  const totals = xpTotals(draft, ruleset);
  if (totals.left > 0)
    hints.push(
      `${totals.left} XP is not spent. It stays on the character, but check that no level or Technique was missed.`,
    );
  const needed = expertLevel(ruleset);
  const cost = techniqueCost(ruleset, 'expert');
  for (const pick of draft.skills) {
    const skill = ruleset.skillsById[pick.skillId];
    if (!skill || pick.expert || pick.level < needed) continue;
    hints.push(
      `${skill.name} is level ${pick.level} without its Expert Technique (${techniqueGivesText(skill, 'expert')}; ${cost} XP).`,
    );
  }
  return hints;
}
