// createCharacter, updateProfile, retireCharacter, changeRace ([RACE-CREATE-STEPS],
// [PTS-XP-START], [SKL-CREATE-LIMIT], [RET-*], [MAG-RIT] Race Change).
// - Creation: names, race and its choices, literacy, age category (2 to 10), starting skills
//   validated one by one against the sheet as it grows (150 XP, levels up to 5, Techniques up to
//   Expert), or a retirement rebuild (the share as starting XP, no creation limits).
// - Retirement: carry-over from ruleset.retirement and the goods value Logistics enters; the
//   carry-over is assigned once, to a new or an existing character ([RET-ASSIGN]).
// - Race change: racial skills of the old race are refunded (Q-MAG-5).
import { z } from 'zod';
import type { SyRace, SyRuleset } from '../../data/index.ts';
import { ChoicesSchema, NameSchema, RefIdSchema } from '../actions/define.ts';
import {
  LiteracySchema,
  RetirementFromSchema,
  type CharacterCreatedPayload,
  type ProfileUpdatedPayload,
} from '../actions/character.ts';
import { deriveSheet } from '../derive/deriveSheet.ts';
import { notice, ruleError, RULE_IDS, type RuleError } from '../errors.ts';
import { IdSchema, TechniqueSchema } from '../model.ts';
import { retirementCarry, retirementStartingXp } from '../rules/retirement.ts';
import { stepsTo } from '../rules/skills.ts';
import type { Choices } from '../sheet.ts';
import { defineCommand, evaluation } from './define.ts';
import { OptionalText, ownedFromSheet } from './helpers.ts';
import { evaluateLearn } from './learnSkill.ts';

/** Checks race choices: pick and language choices are required, options must exist. */
export function raceChoiceErrors(
  ruleset: SyRuleset,
  race: SyRace,
  choices: Choices,
  literacy: 'race-language' | 'common',
): RuleError[] {
  const errors: RuleError[] = [];
  const defs = new Map(race.choices.map((c) => [c.id, c]));
  for (const id of Object.keys(choices))
    if (!defs.has(id))
      errors.push(
        ruleError('CHOICE_INVALID', `${race.name} has no choice "${id}".`, 'RACE-CREATE-STEPS'),
      );
  const literacyId = literacy === 'common' ? 'common' : race.language;
  for (const def of race.choices) {
    const value = choices[def.id];
    if (value === undefined) {
      if (def.kind === 'pick' || def.kind === 'language')
        errors.push(
          ruleError(
            'CHOICE_REQUIRED',
            `Choose ${def.label} for ${race.name}.`,
            'RACE-CREATE-STEPS',
          ),
        );
      continue;
    }
    const values = typeof value === 'string' ? [value] : [...value];
    if (def.kind === 'pick')
      for (const v of values)
        if (!def.options?.includes(v))
          errors.push(
            ruleError(
              'CHOICE_INVALID',
              `${def.label}: "${v}" is not one of ${(def.options ?? []).join(', ')}.`,
              'RACE-CREATE-STEPS',
            ),
          );
    if (def.kind === 'language')
      for (const v of values) {
        if (!ruleset.ruleset.languages.some((l) => l.id === v))
          errors.push(
            ruleError('CHOICE_INVALID', `${def.label}: unknown language "${v}".`, 'RACE-LANG'),
          );
        else if (v === literacyId)
          errors.push(
            ruleError(
              'CHOICE_INVALID',
              `${def.label}: the character already reads and writes that language.`,
              'RACE-LANG',
            ),
          );
      }
  }
  return errors;
}

export const StartingSkillSchema = z.object({
  skillId: RefIdSchema,
  /** Target level; every level up to it is bought. */
  level: z.int().min(0).max(100),
  techniques: z.array(TechniqueSchema).max(3).default([]),
});

export const CreateCharacterCommand = z.object({
  type: z.literal('createCharacter'),
  characterName: NameSchema,
  playerName: NameSchema,
  playerEmail: z.string().trim().max(320).optional(),
  raceId: RefIdSchema,
  choices: ChoicesSchema.default({}),
  /** Starting literacy: the race's language or Common. */
  literacy: LiteracySchema.default('race-language'),
  ageCategory: z.int().min(0).max(100).optional(),
  ageYears: z.int().min(0).max(100000).optional(),
  concept: z.string().trim().max(2000).optional(),
  backstory: z.string().trim().max(20000).optional(),
  startingSkills: z.array(StartingSkillSchema).max(100).default([]),
  /** A rebuild from a retired character ([RET-REBUILD]). */
  retirement: RetirementFromSchema.optional(),
  note: OptionalText,
});
export type CreateCharacterCommand = z.input<typeof CreateCharacterCommand>;

export const createCharacter = defineCommand<z.output<typeof CreateCharacterCommand>>({
  type: 'createCharacter',
  schema: CreateCharacterCommand,
  requiresCharacter: false,
  evaluate(ruleset, _sheet, cmd, builder) {
    const ev = evaluation();
    const rs = ruleset.ruleset;
    const race = ruleset.racesById[cmd.raceId];
    if (!race) {
      ev.errors.push(ruleError('UNKNOWN_RACE', `Unknown race "${cmd.raceId}".`, 'RACE-COMMON'));
      return ev;
    }
    ev.errors.push(...raceChoiceErrors(ruleset, race, cmd.choices, cmd.literacy));
    if (!rs.creation.literacyChoice.includes(cmd.literacy))
      ev.errors.push(ruleError('CHOICE_INVALID', 'Unknown literacy choice.', 'RACE-LANG'));
    const age = cmd.ageCategory ?? rs.creation.defaultAgeCategory;
    if (age < rs.creation.minAgeCategory || age > rs.creation.maxAgeCategory)
      ev.errors.push(
        ruleError(
          'AGE_CATEGORY_RANGE',
          `Age category is ${rs.creation.minAgeCategory} to ${rs.creation.maxAgeCategory} at creation.`,
          'RACE-AGE',
        ),
      );
    const retirement = cmd.retirement;
    const startingXp = retirement
      ? retirementStartingXp(ruleset, retirement.xp)
      : rs.creation.startingXp;
    if (retirement && startingXp < rs.retirement.warnBelowXp)
      ev.notices.push(
        notice(
          'RETIREMENT_BELOW_START',
          `The retirement share gives ${startingXp} XP, below the ${rs.retirement.warnBelowXp} XP a new character gets (Q-RET-2).`,
          'RET-TRANSFER',
        ),
      );
    if (ev.errors.length > 0) return ev;

    const payload: CharacterCreatedPayload = {
      characterName: cmd.characterName,
      playerName: cmd.playerName,
      ...(cmd.playerEmail ? { playerEmail: cmd.playerEmail } : {}),
      raceId: race.id,
      choices: cmd.choices,
      literacy: cmd.literacy,
      ageCategory: age,
      ...(cmd.ageYears !== undefined ? { ageYears: cmd.ageYears } : {}),
      ...(cmd.concept ? { concept: cmd.concept } : {}),
      ...(cmd.backstory ? { backstory: cmd.backstory } : {}),
      startingXp,
      ...(retirement ? { retirement } : {}),
    };
    const created = builder.add('character.created', payload, { note: cmd.note });

    // Regular skills first, advanced ones (which need prerequisites) after; otherwise in order.
    const picks = [...cmd.startingSkills].sort(
      (a, b) =>
        Number(ruleset.skillsById[a.skillId]?.advanced === true) -
        Number(ruleset.skillsById[b.skillId]?.advanced === true),
    );
    let sheet = deriveSheet(ruleset, builder.actions);
    const rebuild = retirement !== undefined && rs.retirement.creationLimitsWaived;
    for (const pick of picks) {
      const current = ownedFromSheet(sheet)(pick.skillId);
      const steps = stepsTo(ruleset, current, pick.level, pick.techniques);
      const before = builder.actions.length;
      const r = evaluateLearn(
        ruleset,
        sheet,
        { skillId: pick.skillId, steps },
        { atCreation: true, retirementRebuild: rebuild, causedBy: created.id },
        builder,
      );
      ev.errors.push(...r.errors);
      ev.notices.push(...r.notices);
      if (builder.actions.length > before) sheet = deriveSheet(ruleset, builder.actions);
    }
    if (ev.errors.length > 0) return ev;
    if (sheet.points.xp.available > 0)
      ev.notices.push(
        notice(
          'XP_UNSPENT',
          `${sheet.points.xp.available} starting XP left unspent; it carries over.`,
          'PTS-XP-START',
        ),
      );
    ev.cost = { currency: 'xp', amount: sheet.points.xp.spent };
    return ev;
  },
});

export const UpdateProfileCommand = z.object({
  type: z.literal('updateProfile'),
  characterName: NameSchema.optional(),
  playerName: NameSchema.optional(),
  /** null or '' clears it. */
  playerEmail: z.string().trim().max(320).nullable().optional(),
  concept: z.string().max(2000).optional(),
  backstory: z.string().max(20000).optional(),
  notes: z.string().max(5000).optional(),
  ageCategory: z.int().min(0).max(100).optional(),
  /** null clears it. */
  ageYears: z.int().min(0).max(100000).nullable().optional(),
  /** Replaces the race choices. */
  choices: ChoicesSchema.optional(),
  literacy: LiteracySchema.optional(),
  note: OptionalText,
});
export type UpdateProfileCommand = z.input<typeof UpdateProfileCommand>;

export const updateProfile = defineCommand<z.output<typeof UpdateProfileCommand>>({
  type: 'updateProfile',
  schema: UpdateProfileCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const p = sheet.profile;
    const changes: ProfileUpdatedPayload = {};
    if (cmd.characterName !== undefined && cmd.characterName !== p.characterName)
      changes.characterName = cmd.characterName;
    if (cmd.playerName !== undefined && cmd.playerName !== p.playerName)
      changes.playerName = cmd.playerName;
    if (cmd.playerEmail !== undefined) {
      const email = cmd.playerEmail === '' ? null : cmd.playerEmail;
      if (email !== p.playerEmail) changes.playerEmail = email;
    }
    if (cmd.concept !== undefined && cmd.concept !== p.concept) changes.concept = cmd.concept;
    if (cmd.backstory !== undefined && cmd.backstory !== p.backstory)
      changes.backstory = cmd.backstory;
    if (cmd.notes !== undefined && cmd.notes !== p.notes) changes.notes = cmd.notes;
    if (cmd.ageYears !== undefined && cmd.ageYears !== p.ageYears) changes.ageYears = cmd.ageYears;
    if (cmd.ageCategory !== undefined && cmd.ageCategory !== p.ageCategory) {
      // Aging raises the category during play, up to the top of the scale ([PLAY-AGE]).
      const c = ruleset.ruleset.creation;
      if (cmd.ageCategory < c.minAgeCategory || cmd.ageCategory > c.maxAgeCategory)
        ev.errors.push(
          ruleError(
            'AGE_CATEGORY_RANGE',
            `Age category is ${c.minAgeCategory} to ${c.maxAgeCategory}.`,
            'RACE-AGE',
          ),
        );
      changes.ageCategory = cmd.ageCategory;
    }
    const race = sheet.race ? ruleset.racesById[sheet.race.raceId] : undefined;
    if (cmd.choices !== undefined || cmd.literacy !== undefined) {
      const choices = cmd.choices ?? sheet.race?.choices ?? {};
      const literacy = cmd.literacy ?? sheet.race?.literacy ?? 'race-language';
      if (race) ev.errors.push(...raceChoiceErrors(ruleset, race, choices, literacy));
      if (cmd.choices !== undefined) changes.choices = cmd.choices;
      if (cmd.literacy !== undefined && cmd.literacy !== sheet.race?.literacy)
        changes.literacy = cmd.literacy;
    }
    if (ev.errors.length > 0) return ev;
    if (Object.keys(changes).length === 0) {
      ev.errors.push(ruleError('NOTHING_CHANGED', 'Nothing changed.', RULE_IDS.command));
      return ev;
    }
    builder.add('profile.updated', changes, { note: cmd.note });
    return ev;
  },
  /** A retired character's notes can still be edited. */
  allowedWhenRetired: (cmd) =>
    Object.entries(cmd).every(
      ([key, value]) => key === 'type' || key === 'notes' || key === 'note' || value === undefined,
    ),
});

export const RetireCharacterCommand = z.object({
  type: z.literal('retireCharacter'),
  /** Required to record the retirement. */
  reason: OptionalText,
  /** Market value of everything the character owns, in Copper (Q-RET-6). */
  goodsValueCopper: z.int().min(0).max(100_000_000).default(0),
  note: OptionalText,
});
export type RetireCharacterCommand = z.input<typeof RetireCharacterCommand>;

export const retireCharacter = defineCommand<z.output<typeof RetireCharacterCommand>>({
  type: 'retireCharacter',
  schema: RetireCharacterCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const reason = cmd.reason ?? '';
    if (reason === '')
      ev.errors.push(
        ruleError('REASON_REQUIRED', 'Give a reason for the retirement.', 'RET-CHOICE'),
      );
    const carry = retirementCarry(
      ruleset,
      { xp: sheet.points.xp.earned, cxp: sheet.points.cxp.earned, axp: sheet.points.axp.earned },
      cmd.goodsValueCopper,
    );
    ev.carry = carry;
    if (ev.errors.length > 0) return ev;
    builder.add(
      'character.retired',
      { reason, goodsValueCopper: cmd.goodsValueCopper, carry },
      { note: cmd.note },
    );
    return ev;
  },
});

export const AssignRetirementCommand = z.object({
  type: z.literal('assignRetirement'),
  /** The character that receives the carry-over (a new one, or one of the same player's). */
  toCharacterId: IdSchema,
  toName: NameSchema,
  kind: z.enum(['new', 'existing']),
  note: OptionalText,
});
export type AssignRetirementCommand = z.input<typeof AssignRetirementCommand>;

/** On the retired character: records where its carry-over went, once ([RET-ASSIGN]). */
export const assignRetirement = defineCommand<z.output<typeof AssignRetirementCommand>>({
  type: 'assignRetirement',
  schema: AssignRetirementCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const retired = sheet.retired;
    if (retired === null)
      ev.errors.push(ruleError('NOT_RETIRED', 'Retire the character first.', 'RET-ASSIGN'));
    else if (retired.assignedTo !== null)
      ev.errors.push(
        ruleError(
          'RETIREMENT_ALREADY_ASSIGNED',
          `The carry-over already went to ${retired.assignedTo.characterName}.`,
          'RET-ASSIGN',
        ),
      );
    if (ev.errors.length > 0) return ev;
    builder.add(
      'retirement.assigned',
      { toCharacterId: cmd.toCharacterId, toName: cmd.toName, kind: cmd.kind },
      { note: cmd.note },
    );
    return ev;
  },
  allowedWhenRetired: () => true,
});

export const ChangeRaceCommand = z.object({
  type: z.literal('changeRace'),
  toRaceId: RefIdSchema,
  choices: ChoicesSchema.default({}),
  reason: OptionalText,
  note: OptionalText,
});
export type ChangeRaceCommand = z.input<typeof ChangeRaceCommand>;

export const changeRace = defineCommand<z.output<typeof ChangeRaceCommand>>({
  type: 'changeRace',
  schema: ChangeRaceCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const from = sheet.race?.raceId;
    const to = ruleset.racesById[cmd.toRaceId];
    if (!to || !from) {
      ev.errors.push(ruleError('UNKNOWN_RACE', `Unknown race "${cmd.toRaceId}".`, 'MAG-RIT'));
      return ev;
    }
    if (to.id === from)
      ev.errors.push(ruleError('SAME_RACE', `The character is already ${to.name}.`, 'MAG-RIT'));
    ev.errors.push(
      ...raceChoiceErrors(ruleset, to, cmd.choices, sheet.race?.literacy ?? 'race-language'),
    );
    const reason = cmd.reason ?? '';
    if (reason === '')
      ev.errors.push(ruleError('REASON_REQUIRED', 'A race change needs a reason.', 'MAG-RIT'));
    // Old racial skills (Q-MAG-5) and skills a racial skill of the new race replaces (Clockwork
    // Armor Plating replaces Wear Armor, Rulebook p.27) are removed and refunded.
    const replaced = new Set(
      to.skills.flatMap((s) => (s.replacesSkill !== undefined ? [s.replacesSkill] : [])),
    );
    const refunds: { skillId: string; amount: number }[] = [];
    for (const s of sheet.skills)
      if ((s.category === 'racial' && s.raceId !== to.id) || replaced.has(s.skillId))
        refunds.push({ skillId: s.skillId, amount: s.spent });
    const total = refunds.reduce((n, r) => n + r.amount, 0);
    ev.refund = { currency: 'xp', amount: total };
    if (refunds.length > 0)
      ev.notices.push(
        notice(
          'RACIAL_SKILLS_REFUNDED',
          `${refunds.length} skill${refunds.length === 1 ? '' : 's'} (racial skills of the old race, or replaced by the new race) are removed and ${total} XP comes back (Q-MAG-5).`,
          'MAG-RIT',
        ),
      );
    if (ev.errors.length > 0) return ev;
    builder.add(
      'race.changed',
      { fromRaceId: from, toRaceId: to.id, reason, choices: cmd.choices, refunds },
      { note: cmd.note },
    );
    return ev;
  },
});
