// artifacts.json: Artifact rules (the core numbers are in ruleset.json), allowed conditions,
// and the 76 powers by tier.
import { z } from 'zod';
import {
  Effect,
  Frequency,
  Id,
  NonNegInt,
  PositiveInt,
  Source,
  Text,
  uniqueList,
} from './common.ts';

export const ArtifactPower = z.strictObject({
  id: Id,
  /** Short display name from the power's line in the rulebook. */
  name: Text,
  /** Fills this many Artifact slots. */
  tier: z.int().min(1).max(5),
  summary: Text,
  /** What the owner names when setting the power. */
  choice: z
    .enum([
      'text',
      'element',
      'condition',
      'skill',
      'recipe',
      'language',
      'location',
      'performance',
    ])
    .optional(),
  choiceOptions: z.array(Id).min(2).optional(),
  frequency: Frequency,
  gmApproval: z.literal(true).optional(),
  effects: z.array(Effect).min(1).optional(),
  naturalWeapon: z.strictObject({ baseDamage: PositiveInt }).optional(),
  maxPerArtifact: PositiveInt.optional(),
  source: Source,
});
export type ArtifactPower = z.infer<typeof ArtifactPower>;

export const ArtifactsFile = z.strictObject({
  rules: z.strictObject({
    maxArtifactsPerPc: PositiveInt,
    slotsPerPowerEqualsTier: z.boolean(),
    /** Powers of Tier 4 or higher held at once. */
    maxPowersTier4Plus: PositiveInt,
    powerSlotCostAxp: NonNegInt,
    removePowersPerYear: PositiveInt,
    fillOnlyBetweenEvents: z.boolean(),
    fillNoticeDaysBeforeEvent: PositiveInt,
    reshapePerYear: PositiveInt,
    reshapeNeedsGmApproval: z.boolean(),
    summary: Text,
    source: Source,
  }),
  allowedConditions: uniqueList(z.strictObject({ id: Id, label: Text })),
  allowedConditionsSource: Source,
  powers: uniqueList(ArtifactPower),
  source: Source,
});
export type ArtifactsFile = z.infer<typeof ArtifactsFile>;
