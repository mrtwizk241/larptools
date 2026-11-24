// familiar.json: familiar levels, FP and Essence costs, and familiar skills.
import { z } from 'zod';
import { Frequency, Id, PositiveInt, Source, Text, uniqueList } from './common.ts';

export const FamiliarSkill = z.strictObject({
  id: Id,
  name: Text,
  /** Essence tier (5, 10, or 15). */
  tier: PositiveInt,
  costEssence: PositiveInt,
  frequency: Frequency,
  /** What the player picks when the skill is learned. */
  choiceOnLearn: z.enum(['recipe', 'craft', 'skill']).optional(),
  repeatable: z.literal(true).optional(),
  maxPurchases: PositiveInt.optional(),
  sheetName: Text.optional(),
  text: Text,
  source: Source,
});
export type FamiliarSkill = z.infer<typeof FamiliarSkill>;

export const AwakenedSkill = z.strictObject({
  id: Id,
  name: Text,
  frequency: Frequency,
  text: Text,
  source: Source,
});
export type AwakenedSkill = z.infer<typeof AwakenedSkill>;

export const FamiliarFile = z.strictObject({
  familiarPoints: z.strictObject({
    abbr: Text,
    spend: z.strictObject({ breakBond: z.int().min(0), forgetSkill: z.int().min(0) }),
    notes: Text.optional(),
    source: Source,
  }),
  levels: z.strictObject({
    min: PositiveInt,
    max: PositiveInt,
    /** FP to reach each level and the Essence it adds. Level 1 is bonding, level 2 awakening. */
    table: z
      .array(
        z.strictObject({
          level: PositiveInt,
          fpCost: z.int().min(0),
          essenceGained: z.int().min(0),
          step: z.enum(['bond', 'awaken']).optional(),
        }),
      )
      .min(1),
    source: Source,
  }),
  essence: z.strictObject({
    name: Text,
    abbr: Text,
    baseSkillSlots: PositiveInt,
    extraSlotCost: PositiveInt,
    maxExtraSlots: z.int().min(0),
    teacherRequired: z.boolean(),
    source: Source,
  }),
  bonding: z.strictObject({
    maxBonds: PositiveInt,
    physrepMinInches: PositiveInt,
    canAwakenSameEvent: z.boolean(),
    source: Source,
  }),
  awakenedSkills: uniqueList(AwakenedSkill),
  skills: uniqueList(FamiliarSkill),
});
export type FamiliarFile = z.infer<typeof FamiliarFile>;
