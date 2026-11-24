// character.created: identity, ancestry, extra infection, starting CXP ([PTS-CXP-START],
// [PTS-CXP-INFECTION], [ANC-STRUCTURE], [ANC-INFECTION-BASE]).
import { z } from 'zod';
import { credit, warn } from '../derive/draft.ts';
import { AgeStepSchema, AgeYearsSchema } from '../rules/age.ts';
import { replayAge } from './profileUpdated.ts';
import { defineAction, NameSchema, RefIdSchema } from './define.ts';

export const CharacterCreatedPayload = z.object({
  characterName: NameSchema,
  playerName: NameSchema,
  playerEmail: z.string().trim().max(320).optional(),
  ancestryId: RefIdSchema,
  subtypeId: RefIdSchema,
  extraInfection: z.int().min(0).max(10),
  /** Cryptid From Legends: the copied ability id. */
  fromLegendsChoice: RefIdSchema.optional(),
  /** Age step 1 to 10 ([ANC-AGE]). Wins over `age` when both are present. */
  ageStep: AgeStepSchema.optional(),
  /** Old logs only: age in years, converted to a step on replay. */
  age: AgeYearsSchema.optional(),
  /** Computed at creation; replay falls back to the ruleset when missing. */
  startingCxp: z.int().min(0).optional(),
  infectionBonusCxp: z.int().min(0).optional(),
  retirement: z
    .object({
      fromName: z.string().trim().max(200),
      cxp: z.int().min(0),
      fp: z.int().min(0),
      shinies: z.int().min(0),
    })
    .optional(),
});
export type CharacterCreatedPayload = z.infer<typeof CharacterCreatedPayload>;

export const characterCreated = defineAction({
  type: 'character.created',
  payload: CharacterCreatedPayload,
  requiresCharacter: false,
  apply(draft, p, action) {
    if (draft.created) {
      warn(draft, action.id, 'DUPLICATE_CREATED', 'The character was already created; skipped.');
      return;
    }
    const rs = draft.ruleset;
    draft.created = true;
    draft.profile = {
      characterName: p.characterName,
      playerName: p.playerName,
      playerEmail: p.playerEmail ? p.playerEmail : null,
      age: null,
      effects: '',
      createdAt: action.at,
      retirementFrom: p.retirement ?? null,
    };

    let extra = p.extraInfection;
    const ancestry = rs.ancestriesById[p.ancestryId];
    const entry = rs.subtypesById[p.subtypeId];
    if (!ancestry || !entry || entry.ancestry.id !== ancestry.id) {
      warn(
        draft,
        action.id,
        'UNKNOWN_ANCESTRY',
        `Unknown ancestry or subtype "${p.ancestryId}" / "${p.subtypeId}".`,
      );
    } else {
      draft.ancestryId = ancestry.id;
      draft.subtypeId = entry.subtype.id;
      const start = rs.ancestries.rules.startingAbilityLevel;
      draft.abilityLevels = { shared: start, subtype: start };
      const track = ancestry.infectionTrack === 'connection' ? 'connection' : 'infection';
      if (track === 'connection' && extra > 0) {
        warn(
          draft,
          action.id,
          'EXTRA_INFECTION_AWARE',
          'Aware cannot take extra infection; ignored.',
        );
        extra = 0;
      } else if (extra > rs.ruleset.extraInfection.maxLevels) {
        warn(
          draft,
          action.id,
          'EXTRA_INFECTION_RANGE',
          `Extra infection ${extra} is above the maximum ${rs.ruleset.extraInfection.maxLevels}.`,
        );
      }
      const trackDef = rs.infection.tracks.find((t) => t.id === track);
      const max = trackDef?.max ?? 10;
      draft.infection = {
        track,
        base: ancestry.baseInfection,
        extra,
        current: Math.min(max, ancestry.baseInfection + extra),
      };
      const choice = ancestry.sharedAbility.choice;
      if (p.fromLegendsChoice !== undefined) {
        if (choice?.allowedAbilityIds.includes(p.fromLegendsChoice))
          draft.fromLegendsChoice = p.fromLegendsChoice;
        else
          warn(
            draft,
            action.id,
            'FROM_LEGENDS_INVALID',
            `"${p.fromLegendsChoice}" is not an allowed From Legends ability; ignored.`,
          );
      }
    }

    replayAge(draft, p.ageStep, p.age);

    credit(draft, action, 'cxp', p.startingCxp ?? rs.ruleset.startingCxp, 'start', null);
    const bonus = p.infectionBonusCxp ?? extra * rs.ruleset.extraInfection.cxpPerLevel;
    credit(draft, action, 'cxp', bonus, rs.ruleset.extraInfection.ledgerKind, null);
    if (p.retirement) {
      credit(draft, action, 'cxp', p.retirement.cxp, 'retirement-carry', null);
      credit(draft, action, 'fp', p.retirement.fp, 'retirement-carry', null);
      credit(draft, action, 'shinies', p.retirement.shinies, 'retirement-carry', null);
    }
  },
});
