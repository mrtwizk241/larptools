// skills.json: every regular and advanced skill. The same leveled shape is used for racial
// skills (inline in races.json) and Calling skills (inline in callings.json).
import { z } from 'zod';
import {
  ByNamedLevel,
  Element,
  GrantId,
  Id,
  NamedLevel,
  NonNegInt,
  PositiveInt,
  Source,
  Stat,
  Technique,
  Text,
  uniqueList,
} from './common.ts';

/** One named ability (basic at level 1, expert 3, master 6, grandmaster 10). */
export const LevelAbility = z
  .strictObject({
    /** Uses spent per activation. 0 for a passive. */
    uses: NonNegInt,
    /** active spends uses, passive is always on, both has an active and a passive part. */
    kind: z.enum(['active', 'passive', 'both']),
    summary: Text,
  })
  .refine((a) => (a.kind === 'passive') === (a.uses === 0), {
    message: 'passive abilities have 0 uses, active and both have 1 or more',
  });
export type LevelAbility = z.infer<typeof LevelAbility>;

/** Needs a skill with a Technique. */
export const SkillReq = z.strictObject({ skill: Id, technique: Technique });
export type SkillReq = z.infer<typeof SkillReq>;

/**
 * Prerequisite group: met when at least `need` of `of` are met. A skill's `prereqs` list is
 * an AND of groups. So "A + B" is two groups of one, "A or B" is one group with need 1, and
 * "any two of A, B, C" is one group with need 2.
 */
export const PrereqGroup = z
  .strictObject({ need: PositiveInt, of: z.array(SkillReq).min(1) })
  .refine((g) => g.need <= g.of.length, { message: 'need is larger than the group' });
export type PrereqGroup = z.infer<typeof PrereqGroup>;

/** A fixed number the sheet adds once the Technique `at` is owned. */
export const SkillPassive = z.strictObject({
  at: NamedLevel,
  stat: Stat,
  amount: z.number(),
  /** add (default) or set. */
  op: z.enum(['add', 'set']).optional(),
  /** level: per named level reached (1, 3, 6, 10) instead of per Technique owned. */
  basis: z.enum(['level']).optional(),
  when: Text.optional(),
  pool: z.enum(['dex']).optional(),
});
export type SkillPassive = z.infer<typeof SkillPassive>;

/** A number that scales with the skill's level (perLevel) or is fixed (amount). */
export const SkillDerived = z
  .strictObject({
    at: NamedLevel,
    stat: Stat,
    perLevel: z.number().optional(),
    amount: z.number().optional(),
    note: Text.optional(),
  })
  .refine((d) => (d.perLevel === undefined) !== (d.amount === undefined), {
    message: 'set exactly one of perLevel and amount',
  });
export type SkillDerived = z.infer<typeof SkillDerived>;

export const SkillGrant = z.strictObject({
  at: NamedLevel,
  grant: GrantId,
  note: Text.optional(),
  source: Source.optional(),
});
export type SkillGrant = z.infer<typeof SkillGrant>;

const CheckInOption = z.strictObject({
  basicComponents: PositiveInt.optional(),
  exoticComponents: PositiveInt.optional(),
  masterBuildingMaterials: PositiveInt.optional(),
  copper: PositiveInt.optional(),
  ownUpkeepSilver: PositiveInt.optional(),
  /** A trade item of this quality. */
  tradeItem: NamedLevel.optional(),
  /** A mix of copper and items worth up to this many copper. */
  mixCopperValue: PositiveInt.optional(),
  maxItems: PositiveInt.optional(),
});
const CheckInGrant = z.strictObject({
  basicComponents: PositiveInt.optional(),
  exoticComponents: PositiveInt.optional(),
  /** Pick one. */
  choice: z.array(CheckInOption).min(2).optional(),
  /** May take this instead. */
  alternative: CheckInOption.optional(),
  trade: z.strictObject({ basicPerExotic: PositiveInt, maxExoticTotal: PositiveInt }).optional(),
});
/** Check-in income: perLevel for each level, plus only the highest Technique's bonus. */
export const CheckIn = z.strictObject({
  techniqueRule: z.literal('highest-only'),
  perLevel: CheckInGrant,
  byTechnique: z.strictObject({
    expert: CheckInGrant,
    master: CheckInGrant,
    grandmaster: CheckInGrant,
  }),
});

const skillShape = {
  id: Id,
  name: Text,
  advanced: z.boolean(),
  /** Base magic skills: the school (element) they cast. */
  school: Element.optional(),
  prereqs: z.array(PrereqGroup),
  /** The prerequisite line as printed, when its grouping needed a decision (Q-SKL-2). */
  prereqsPrinted: Text.optional(),
  /** Equipment or other conditions, display only. */
  requirement: Text.optional(),
  defenseType: z.enum(['avoidance', 'resistance']).optional(),
  /** This skill stands in for another skill (Clockwork Armor Plating for Wear Armor). */
  replacesSkill: Id.optional(),
  /** Calling skills that copy a chosen racial skill (The Distinctive). */
  mirrorsChoice: Id.optional(),
  aliases: z.array(Text).min(1).optional(),
  levels: ByNamedLevel(LevelAbility),
  passives: z.array(SkillPassive).min(1).optional(),
  derived: z.array(SkillDerived).min(1).optional(),
  grants: z.array(SkillGrant).min(1).optional(),
  checkIn: CheckIn.optional(),
  /** The skill is a suit of armor of this quality per Technique. */
  builtInArmor: z
    .strictObject({
      qualityByTechnique: ByNamedLevel(NamedLevel),
      usesAttunementSlot: z.boolean(),
    })
    .optional(),
  notes: Text.optional(),
  source: Source,
};

const advancedNeedsPrereqs = (s: { advanced: boolean; prereqs: readonly unknown[] }) =>
  s.advanced === s.prereqs.length > 0;

export const RegularSkill = z
  .strictObject({
    ...skillShape,
    category: z.enum(['offensive', 'defensive', 'utility', 'magic', 'crafting']),
  })
  .refine(advancedNeedsPrereqs, { message: 'advanced skills, and only they, have prereqs' });
export type RegularSkill = z.infer<typeof RegularSkill>;

export const RacialSkill = z
  .strictObject({ ...skillShape, category: z.literal('racial'), raceId: Id })
  .refine(advancedNeedsPrereqs, { message: 'advanced skills, and only they, have prereqs' });
export type RacialSkill = z.infer<typeof RacialSkill>;

export const CallingSkill = z
  .strictObject({ ...skillShape, category: z.literal('calling'), callingId: Id })
  .refine(advancedNeedsPrereqs, { message: 'advanced skills, and only they, have prereqs' });
export type CallingSkill = z.infer<typeof CallingSkill>;

export const SkillsFile = uniqueList(RegularSkill);
export type SkillsFile = z.infer<typeof SkillsFile>;
