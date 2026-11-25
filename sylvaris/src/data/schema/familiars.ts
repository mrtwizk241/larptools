// familiars.json: familiar rules, trick slots by quality, and special tricks.
import { z } from 'zod';
import {
  Frequency,
  Id,
  NamedLevel,
  NonNegInt,
  PositiveInt,
  Quality,
  Source,
  Technique,
  Text,
  uniqueList,
} from './common.ts';

export const SpecialTrick = z.strictObject({
  id: Id,
  /** Short display name from the trick's line in the rulebook. */
  name: Text,
  summary: Text,
  frequency: Frequency,
  uses: PositiveInt.optional(),
  /** Options the owner picks from when training it. */
  choice: z.array(Id).min(2).optional(),
  source: Source,
});
export type SpecialTrick = z.infer<typeof SpecialTrick>;

export const FamiliarsFile = z.strictObject({
  rules: z.strictObject({
    maxPerPc: PositiveInt,
    sources: z.array(z.enum(['adventure', 'flesh-craft-elixir', 'ritual'])).min(1),
    unstableLeavesAtEventEnd: z.boolean(),
    hasLifeOrArmor: z.boolean(),
    trickSlotsByQuality: z.record(Quality, NonNegInt),
    maxTrickSlots: PositiveInt,
    skillTricks: z.strictObject({
      allowedNote: Text,
      levelBySlots: z
        .array(
          z.strictObject({
            slots: PositiveInt,
            level: NamedLevel,
            needsTechnique: Technique.optional(),
          }),
        )
        .min(1),
      maxSlotsPerSkill: PositiveInt,
      usesPerRepopEqualsSlots: z.boolean(),
      constantPassivesGranted: z.boolean(),
    }),
    skillSpecials: z
      .array(
        z.strictObject({
          skill: Id,
          summary: Text,
          checkInCopperPerSlot: PositiveInt.optional(),
          checkInBasicComponentsPerSlot: PositiveInt.optional(),
        }),
      )
      .min(1),
    retrainingNote: Text,
    physRepNote: Text,
    source: Source,
  }),
  specialTricks: uniqueList(SpecialTrick),
  source: Source,
});
export type FamiliarsFile = z.infer<typeof FamiliarsFile>;
