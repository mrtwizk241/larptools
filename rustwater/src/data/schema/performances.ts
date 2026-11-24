// performances.json: Bardic performances and Ritualism rituals.
import { z } from 'zod';
import {
  Effect,
  Frequency,
  Id,
  PartId,
  PositiveInt,
  Rank,
  Source,
  Text,
  uniqueList,
} from './common.ts';

const SkillUse = z.strictObject({ skill: Id, part: PartId, uses: PositiveInt.optional() });

/** What a performance gives each target (for a future buff tracker). */
const TargetEffect = z.strictObject({
  stat: z.enum(['buff', 'buffSlots', 'damage', 'restoreBasicUses']),
  name: Text.optional(),
  add: z.number().optional(),
  duration: z.enum(['repop', 'next-encounter']).optional(),
  slot: z.enum(['buff']).optional(),
  grants: SkillUse.optional(),
  grantsOneOf: z.array(SkillUse).min(2).optional(),
  uses: PositiveInt.optional(),
  stacks: PositiveInt.optional(),
  maxHeld: PositiveInt.optional(),
  /** Amount per performance step (see scaling). */
  perStep: PositiveInt.optional(),
  stacksPerStep: PositiveInt.optional(),
  maxStacks: PositiveInt.optional(),
});

export const Performance = z.strictObject({
  id: Id,
  name: Text,
  /** Bardic Performance part needed to memorize and perform it. */
  tier: Rank,
  lengthMinutes: z.strictObject({ min: PositiveInt, max: PositiveInt }),
  /** Variable-length performances: one step per stepMinutes, up to maxSteps. */
  scaling: z.strictObject({ stepMinutes: PositiveInt, maxSteps: PositiveInt }).optional(),
  targetEffects: z.array(TargetEffect).min(1),
  text: Text,
  source: Source,
});
export type Performance = z.infer<typeof Performance>;

export const Ritual = z.strictObject({
  id: Id,
  name: Text,
  frequency: Frequency,
  /** Learned automatically with Ritualism. */
  autoLearned: z.literal(true).optional(),
  circleMaxPeople: PositiveInt.optional(),
  circleCastable: z.boolean().optional(),
  effects: z.array(Effect).optional(),
  notes: Text.optional(),
  text: Text,
  source: Source,
});
export type Ritual = z.infer<typeof Ritual>;

export const PerformancesFile = z.strictObject({
  performances: uniqueList(Performance),
  rituals: uniqueList(Ritual),
});
export type PerformancesFile = z.infer<typeof PerformancesFile>;
