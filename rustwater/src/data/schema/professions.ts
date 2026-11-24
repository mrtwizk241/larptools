// professions.json: profession rules (PXP costs, uses per level) and the 19 professions.
import { z } from 'zod';
import {
  Effect,
  Frequency,
  Id,
  PositiveInt,
  Rank,
  Source,
  Text,
  assumptionFields,
  uniqueList,
} from './common.ts';

const SlotId = z.enum(['passive', 'skill-1', 'skill-2']);

/** A number that depends on the level of one profession skill. Below level 1 it is `base`. */
const LevelTable = z.strictObject({
  base: z.int().min(0),
  skill: Id,
  byLevel: z.array(z.strictObject({ level: PositiveInt, value: z.int().min(0) })).min(1),
  alternativeAtLevel5: z.int().min(0).optional(),
  ...assumptionFields,
});

const PerEventChoice = z.strictObject({
  field: z.string().min(1),
  kind: z.enum(['memorized-spell', 'magic-school']),
  rank: Rank.optional(),
  excludeSpells: z.array(Id).optional(),
  /** Only the tier named here uses the choice. */
  tier: Rank.optional(),
});

export const ProfessionPassive = z.strictObject({
  id: Id,
  name: Text,
  sheetName: Text,
  frequency: Frequency,
  effects: z.array(Effect).optional(),
  craftedItems: uniqueList(
    z.strictObject({
      id: Id,
      name: Text,
      rating: PositiveInt,
      effect: Text,
      source: Source,
    }),
  ).optional(),
  ratingCap: LevelTable.optional(),
  ledgerSlots: LevelTable.optional(),
  craftTimeMinutes: PositiveInt.optional(),
  requiresSafeArea: z.boolean().optional(),
  rechargeCountSeconds: PositiveInt.optional(),
  resetsAt: z.enum(['event-end']).optional(),
  perEventChoice: PerEventChoice.optional(),
  onStartGrant: z
    .strictObject({
      kind: z.enum(['memorized-spell']),
      rank: Rank,
      condition: z.enum(['no-memorized-spells']),
      free: z.boolean(),
      ...assumptionFields,
    })
    .optional(),
  text: Text,
  source: Source,
});

const Tier = z.strictObject({ minLevel: PositiveInt, text: Text });

const TierPassive = z.strictObject({
  ratingCap: PositiveInt.optional(),
  ratingRaiseForFrontalCone: PositiveInt.optional(),
  ratingRaiseForLash: PositiveInt.optional(),
  ledgerSlotsAdd: PositiveInt.optional(),
});

export const ProfessionSkill = z
  .strictObject({
    id: Id,
    name: Text,
    sheetName: Text,
    slot: z.enum(['skill-1', 'skill-2']),
    frequency: Frequency,
    altFrequency: Frequency.optional(),
    frequencyText: Text.optional(),
    betweenEvents: z.literal(true).optional(),
    perEventChoice: PerEventChoice.optional(),
    tiers: z.strictObject({ basic: Tier, adept: Tier, advanced: Tier }).optional(),
    /** Numbers a tier adds while the skill is at or above the tier's level. */
    tierPassives: z
      .strictObject({ adept: TierPassive.optional(), advanced: TierPassive.optional() })
      .optional(),
    /** Display notes for staff on what a tier changes on another sheet. */
    sheetEffects: z.strictObject({ adept: Text.optional(), advanced: Text.optional() }).optional(),
    /** Designer notes copied from the Professions Document; shown as draft. */
    designNote: Text.optional(),
    text: Text.optional(),
    source: Source,
  })
  .refine((s) => s.text !== undefined || s.tiers !== undefined, 'set text or tiers');
export type ProfessionSkill = z.infer<typeof ProfessionSkill>;

export const Profession = z.strictObject({
  id: Id,
  name: Text,
  heading: Text,
  kind: z.enum(['standard', 'patron']),
  domain: Text.optional(),
  patron: Text.optional(),
  sheetName: Text,
  passive: ProfessionPassive,
  skills: z.array(ProfessionSkill).length(2),
  source: Source,
});
export type Profession = z.infer<typeof Profession>;

export const ProfessionsFile = z.strictObject({
  rules: z.strictObject({
    currency: z.literal('pxp'),
    maxProfessionsPerCharacter: PositiveInt,
    /** Level n costs costPerLevel * n. */
    costPerLevel: PositiveInt,
    costScaling: z.enum(['escalating']),
    maxLevel: PositiveInt,
    maxLevelsPerSkillPerEvent: PositiveInt,
    start: z.strictObject({
      eventsPlayedBefore: z.int().min(0),
      countsPurchasedMissedEvents: z.boolean(),
      firstPurchaseMinLevel: PositiveInt,
      passiveGrantedOnStart: z.boolean(),
      recordOnTeachingSheet: z.boolean(),
      ...assumptionFields,
    }),
    slots: z.array(
      z.strictObject({
        id: SlotId,
        frequency: Frequency,
        leveled: z.boolean(),
        tiered: z.boolean(),
      }),
    ),
    /** Uses per period by skill level. Upgrades apply to the tiered skill only. */
    usesByLevel: z
      .array(
        z.strictObject({
          level: PositiveInt,
          basic: z.int().min(0),
          adeptUpgrades: z.int().min(0),
          advancedUpgrades: z.int().min(0),
        }),
      )
      .min(1),
    upgradeConsumesBasicUse: z.boolean(),
    abilitiesAreNonCore: z.boolean(),
    restore: z.strictObject({
      byRulebookSkills: z.boolean(),
      byGmOrAbility: z.boolean(),
      text: Text,
    }),
    exclusiveText: Text,
    notes: Text.optional(),
    source: Source,
  }),
  professions: uniqueList(Profession),
});
export type ProfessionsFile = z.infer<typeof ProfessionsFile>;
