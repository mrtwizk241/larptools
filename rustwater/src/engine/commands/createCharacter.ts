// createCharacter: names, ancestry and subtype, extra infection, the starting LXP pick, and the
// starting skills ([PTS-CXP-START], [PTS-CXP-INFECTION], [ANC-STRUCTURE], [ANC-LEVELS],
// [ANC-CRYPTID-LEGENDS]). Produces character.created, an ancestry.leveled for the LXP pick, and
// one skill.learned per level with atCreation true. Each purchase is validated against the
// sheet as it stands after the previous ones, so CXP stays within 250 plus the infection bonus.
import { z } from 'zod';
import { NameSchema, RefIdSchema } from '../actions/define.ts';
import type { CharacterCreatedPayload } from '../actions/characterCreated.ts';
import { deriveSheet } from '../derive/deriveSheet.ts';
import { notice, ruleError } from '../errors.ts';
import { SkillPartSchema } from '../model.ts';
import { AGE_STEP_MAX, AGE_STEP_START_MIN } from '../rules/age.ts';
import { defineCommand, evaluation } from './define.ts';
import { OptionalText } from './helpers.ts';
import { evaluateLearn } from './learnSkill.ts';

export const StartingSkillSchema = z.object({
  skillId: RefIdSchema,
  part: SkillPartSchema,
  /** Target level; every level up to it is bought. */
  level: z.int().min(1).max(1000),
  /** Multi-archetype skills: the archetype to buy it in. */
  archetype: RefIdSchema.optional(),
});

export const CreateCharacterCommand = z.object({
  type: z.literal('createCharacter'),
  characterName: NameSchema,
  playerName: NameSchema,
  playerEmail: z.string().trim().max(320).optional(),
  /** Age step 2 to 10 for a new character ([ANC-AGE]). */
  age: z.int().optional(),
  ancestryId: RefIdSchema,
  subtypeId: RefIdSchema,
  /** Extra infection levels at 10 CXP each (0 to 2). Not offered to Aware. */
  extraInfection: z.int().min(0).max(100).default(0),
  /** Cryptids: the ability From Legends copies. */
  fromLegendsChoice: RefIdSchema.optional(),
  /** The ancestry ability (shared or subtype ability id) raised to level 2 by the starting LXP. */
  startingLxpAbilityId: RefIdSchema.optional(),
  startingSkills: z.array(StartingSkillSchema).max(200).default([]),
  /** Carry-over from a retired character ([PTS-RETIRE]). */
  retirement: z
    .object({
      fromName: z.string().trim().max(200),
      cxp: z.int().min(0),
      fp: z.int().min(0),
      shinies: z.int().min(0),
    })
    .optional(),
  note: OptionalText,
});
export type CreateCharacterCommand = z.input<typeof CreateCharacterCommand>;

export const createCharacter = defineCommand<z.output<typeof CreateCharacterCommand>>({
  type: 'createCharacter',
  schema: CreateCharacterCommand,
  requiresCharacter: false,
  evaluate(ruleset, _sheet, cmd, builder) {
    const ev = evaluation();
    const ancestry = ruleset.ancestriesById[cmd.ancestryId];
    const entry = ruleset.subtypesById[cmd.subtypeId];
    if (!ancestry) {
      ev.errors.push(
        ruleError('UNKNOWN_ANCESTRY', `Unknown ancestry "${cmd.ancestryId}".`, 'ANC-STRUCTURE'),
      );
      return ev;
    }
    if (!entry || entry.ancestry.id !== ancestry.id) {
      ev.errors.push(
        ruleError(
          'UNKNOWN_SUBTYPE',
          `"${cmd.subtypeId}" is not a ${ancestry.name} subtype.`,
          'ANC-STRUCTURE',
        ),
      );
      return ev;
    }
    const extraRule = ruleset.ruleset.extraInfection;
    if (ancestry.infectionTrack !== 'infection' && cmd.extraInfection > 0)
      ev.errors.push(
        ruleError(
          'EXTRA_INFECTION_AWARE',
          `${ancestry.name} cannot take extra infection levels.`,
          'ANC-INFECTION-BASE',
        ),
      );
    else if (cmd.extraInfection > extraRule.maxLevels)
      ev.errors.push(
        ruleError(
          'EXTRA_INFECTION_RANGE',
          `Extra infection is 0 to ${extraRule.maxLevels} levels.`,
          'PTS-CXP-INFECTION',
        ),
      );

    const choice = ancestry.sharedAbility.choice;
    if (choice) {
      if (cmd.fromLegendsChoice === undefined)
        ev.errors.push(
          ruleError(
            'FROM_LEGENDS_REQUIRED',
            `Choose the ability ${ancestry.sharedAbility.name} copies.`,
            'ANC-CRYPTID-LEGENDS',
          ),
        );
      else if (!choice.allowedAbilityIds.includes(cmd.fromLegendsChoice))
        ev.errors.push(
          ruleError(
            'FROM_LEGENDS_INVALID',
            `${ancestry.sharedAbility.name} cannot copy "${cmd.fromLegendsChoice}": only a per encounter or per repop ability of another ancestry.`,
            'ANC-CRYPTID-LEGENDS',
          ),
        );
    } else if (cmd.fromLegendsChoice !== undefined) {
      ev.errors.push(
        ruleError(
          'FROM_LEGENDS_INVALID',
          `Only Cryptids choose a From Legends ability.`,
          'ANC-CRYPTID-LEGENDS',
        ),
      );
    }

    const abilityIds = [ancestry.sharedAbility.id, entry.subtype.ability.id];
    if (cmd.startingLxpAbilityId !== undefined && !abilityIds.includes(cmd.startingLxpAbilityId))
      ev.errors.push(
        ruleError(
          'UNKNOWN_ABILITY',
          `The starting LXP can raise ${ancestry.sharedAbility.name} or ${entry.subtype.ability.name} only.`,
          'ANC-LEVELS',
        ),
      );
    if (cmd.age !== undefined && (cmd.age < AGE_STEP_START_MIN || cmd.age > AGE_STEP_MAX))
      ev.errors.push(
        ruleError(
          'AGE_RANGE',
          `Age is a step from ${AGE_STEP_START_MIN} to ${AGE_STEP_MAX} for a new character.`,
          'ANC-AGE',
        ),
      );
    if (ev.errors.length > 0) return ev;

    const payload: CharacterCreatedPayload = {
      characterName: cmd.characterName,
      playerName: cmd.playerName,
      ...(cmd.playerEmail ? { playerEmail: cmd.playerEmail } : {}),
      ancestryId: ancestry.id,
      subtypeId: entry.subtype.id,
      extraInfection: cmd.extraInfection,
      ...(cmd.fromLegendsChoice !== undefined ? { fromLegendsChoice: cmd.fromLegendsChoice } : {}),
      ...(cmd.age !== undefined ? { ageStep: cmd.age } : {}),
      startingCxp: ruleset.ruleset.startingCxp,
      infectionBonusCxp: cmd.extraInfection * extraRule.cxpPerLevel,
      ...(cmd.retirement ? { retirement: cmd.retirement } : {}),
    };
    const created = builder.add('character.created', payload, { note: cmd.note });

    let sheet = deriveSheet(ruleset, builder.actions);
    if (cmd.startingLxpAbilityId !== undefined) {
      builder.add(
        'ancestry.leveled',
        {
          abilityId: cmd.startingLxpAbilityId,
          toLevel: ruleset.ancestries.rules.startingAbilityLevel + 1,
          atCreation: true,
        },
        { causedBy: created.id },
      );
      sheet = deriveSheet(ruleset, builder.actions);
    }

    // Basic parts first so the AP they earn can pay for archetype parts; otherwise keep order.
    const picks = [...cmd.startingSkills].sort(
      (a, b) =>
        Number(ruleset.skillsById[b.skillId]?.parts[b.part]?.costKind === 'basic') -
        Number(ruleset.skillsById[a.skillId]?.parts[a.part]?.costKind === 'basic'),
    );
    for (const pick of picks) {
      const before = builder.actions.length;
      const r = evaluateLearn(
        ruleset,
        sheet,
        { skillId: pick.skillId, part: pick.part, toLevel: pick.level, archetype: pick.archetype },
        { atCreation: true, causedBy: created.id },
        builder,
      );
      ev.errors.push(...r.errors);
      ev.notices.push(...r.notices);
      if (builder.actions.length > before) sheet = deriveSheet(ruleset, builder.actions);
    }
    if (ev.errors.length > 0) return ev;

    if (sheet.points.lxp.available > 0)
      ev.notices.push(
        notice(
          'LXP_UNSPENT',
          `${sheet.points.lxp.available} starting LXP left unspent.`,
          'PTS-LXP-SPEND',
        ),
      );
    if (sheet.points.cxp.available > 0)
      ev.notices.push(
        notice(
          'CXP_UNSPENT',
          `${sheet.points.cxp.available} starting CXP left unspent.`,
          'PTS-CXP-START',
        ),
      );
    ev.cost = { currency: 'cxp', amount: sheet.points.cxp.spent };
    return ev;
  },
});
