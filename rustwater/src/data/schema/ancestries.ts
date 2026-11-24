// ancestries.json: ancestries, subtypes, and their passives and leveled abilities.
import { z } from 'zod';
import {
  Effect,
  Frequency,
  Id,
  PositiveInt,
  RarityId,
  Source,
  Text,
  assumptionFields,
  uniqueList,
} from './common.ts';

/** What an ability hands out at check-in. */
const CheckInGrant = z.strictObject({
  resources: PositiveInt.optional(),
  resourcesPerLevel: PositiveInt.optional(),
  rarity: RarityId.optional(),
  /** Bits instead of the resources. */
  orBits: PositiveInt.optional(),
  orBitsPerLevel: PositiveInt.optional(),
  /** Several uses may combine into a higher rarity resource. */
  stackForHigherRarity: z.boolean().optional(),
  randomDrawsPerLevel: PositiveInt.optional(),
  drawPool: z.array(z.enum(['random-resource', 'unstable-consumable'])).optional(),
});

export const AncestryAbility = z.strictObject({
  id: Id,
  name: Text,
  sheetName: Text,
  frequency: Frequency,
  /** From Legends takes the frequency of the copied ability. */
  frequencyFrom: z.enum(['chosen-ability']).optional(),
  timing: z.enum(['check-in']).optional(),
  /** Leveled abilities get one use per level and take LXP. */
  leveled: z.boolean(),
  multiUse: z.literal(true).optional(),
  hasPassivePart: z.literal(true).optional(),
  checkInGrant: CheckInGrant.optional(),
  effects: z.array(Effect).optional(),
  /** Cryptid From Legends: copies another ancestry ability chosen at creation. */
  choice: z
    .strictObject({
      field: z.string().min(1),
      allowedAbilityIds: z.array(Id).min(1),
      excludedAbilityIds: z.array(Id),
      chosenAt: z.enum(['creation']),
      text: Text,
      ...assumptionFields,
    })
    .optional(),
  text: Text,
  source: Source,
});
export type AncestryAbility = z.infer<typeof AncestryAbility>;

export const Subtype = z.strictObject({
  id: Id,
  name: Text,
  /** Other names, including the sheet's, for import matching. */
  aliases: z.array(Text),
  sheetName: Text,
  /** Replaces the ancestry passive when set (Hybrid). */
  passive: AncestryAbility.optional(),
  ability: AncestryAbility,
  source: Source,
});
export type Subtype = z.infer<typeof Subtype>;

export const Ancestry = z.strictObject({
  id: Id,
  name: Text,
  baseInfection: z.int().min(0),
  /** Infection track id from infection.json. */
  infectionTrack: Id,
  ages: z.boolean(),
  /** null when there is no fixed maximum (Aware) or the GM sets it (Cryptid). */
  maxAge: PositiveInt.nullable(),
  maxAgeSetByGm: z.literal(true).optional(),
  ageBracket: z.enum(['standard', 'above-average', 'long-lived', 'varied']),
  costumeRequirements: Text,
  passive: AncestryAbility.optional(),
  sharedAbility: AncestryAbility,
  subtypes: uniqueList(Subtype),
  source: Source,
});
export type Ancestry = z.infer<typeof Ancestry>;

export const AncestriesFile = z.strictObject({
  rules: z.strictObject({
    startingAbilityLevel: PositiveInt,
    lxpCostPerLevel: PositiveInt,
    /** Uses per period = level * usesPerLevel. */
    usesPerLevel: PositiveInt,
    passiveLeveled: z.boolean(),
    subtypePassiveOverridesAncestryPassive: z.boolean(),
    /** ageNumber = round(scale * age / maxAge). */
    ageNumber: z.strictObject({ scale: PositiveInt, rounding: z.enum(['floor']) }),
    costumeDeadlineEvent: PositiveInt,
    source: Source,
  }),
  ancestries: uniqueList(Ancestry),
});
export type AncestriesFile = z.infer<typeof AncestriesFile>;
