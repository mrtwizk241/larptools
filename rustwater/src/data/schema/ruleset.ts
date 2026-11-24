// ruleset.json: season id, name, and every point constant.
import { z } from 'zod';
import {
  CurrencyId,
  Id,
  PositiveInt,
  RarityId,
  Rank,
  ResourceTypeId,
  Source,
  Text,
  assumptionFields,
  uniqueList,
} from './common.ts';

const ArchetypeCost = z.strictObject({
  costPerLevel: PositiveInt,
  /** escalating: level n costs costPerLevel * n. flat: every level costs costPerLevel. */
  scaling: z.enum(['escalating', 'flat']),
  /** null means no limit. */
  maxLevel: PositiveInt.nullable(),
});

export const RulesetFile = z.strictObject({
  id: z.string().regex(/^[0-9]{4}-[0-9]+\.[0-9]+$/, 'ruleset ids look like "2026-2.0"'),
  name: Text,
  season: z.int(),
  rulebookVersion: z.string().min(1),
  sources: uniqueList(z.strictObject({ id: Id, name: Text })),
  currencies: uniqueList(
    z.strictObject({
      id: CurrencyId,
      name: Text,
      abbr: Text,
      aliases: z.array(Text).optional(),
      scope: z.enum(['character', 'character-per-archetype']),
      /** Derived currencies are computed from other numbers, never awarded. */
      derived: z.boolean(),
      source: Source,
    }),
  ),
  ledgerKinds: uniqueList(z.strictObject({ id: Id, name: Text })),
  startingCxp: PositiveInt,
  eventCxp: PositiveInt,
  earnedCxpCap: z.strictObject({
    amount: PositiveInt,
    /** Ledger kinds that do not count as "earned" (starting grants). */
    excludedKinds: z.array(Id),
    onExceed: z.enum(['clamp-and-warn']),
    ...assumptionFields,
    source: Source,
  }),
  /** Buying level n of a basic skill earns n * apPerBasicLevel AP in its archetype. */
  apPerBasicLevel: PositiveInt,
  basicSkill: z.strictObject({
    currency: z.literal('cxp'),
    /** Level n costs costPerLevel * n. */
    costPerLevel: PositiveInt,
    maxLevel: PositiveInt,
    source: Source,
  }),
  archetypeSkill: z.strictObject({
    currency: z.literal('ap'),
    maxLevel: PositiveInt,
    costs: z.strictObject({
      adept: ArchetypeCost,
      advanced: ArchetypeCost,
      encounter: ArchetypeCost,
      passive: ArchetypeCost,
      memorization: ArchetypeCost,
      mastery: ArchetypeCost,
    }),
    source: Source,
  }),
  lxp: z.strictObject({
    atCreation: z.int().min(0),
    /** One more LXP for every perCxp CXP the character has. */
    perCxp: PositiveInt,
    countsStartingCxp: z.boolean(),
    costPerLevel: PositiveInt,
    abilityStartLevel: PositiveInt,
    maxAbilityLevel: PositiveInt.nullable(),
    sheetMaxAbilityLevel: PositiveInt,
    ...assumptionFields,
    source: Source,
  }),
  pxp: z.strictObject({
    atCreation: z.int().min(0),
    earnedByAttendance: z.boolean(),
    source: Source,
  }),
  /** Starting values of sheet stats before skills, ancestry, and boons change them. */
  baseStats: z.strictObject({
    maxHealth: z.int().min(0),
    armor: z.int().min(0),
    ...assumptionFields,
    source: Source,
  }),
  extraInfection: z.strictObject({
    maxLevels: z.int().min(0),
    cxpPerLevel: z.int().min(0),
    ledgerKind: Id,
    source: Source,
  }),
  retirement: z.strictObject({
    /** carryCxp = floor((cxpSpent - subtractCxp) / divisor) + cxpAvailable, never below 0 before adding. */
    subtractCxp: z.int().min(0),
    subtractFp: z.int().min(0),
    divisor: PositiveInt,
    rounding: z.enum(['floor']),
    carries: z.array(CurrencyId),
    kinds: z.array(z.enum(['planned', 'unplanned'])),
    ...assumptionFields,
    source: Source,
  }),
  upkeep: z.strictObject({
    /** Pay any one option. */
    options: z.array(
      z.strictObject({
        kind: z.enum(['resource', 'bits']),
        rarity: RarityId.optional(),
        qty: PositiveInt,
      }),
    ),
    firstEventFree: z.boolean(),
    zeroForAncestries: z.array(Id),
    /** Shiny purchase id that covers upkeep. */
    coveredByPurchase: Id,
    gmModifiable: z.boolean(),
    source: Source,
  }),
  penalties: z.strictObject({
    cxpLossAllowed: z.boolean(),
    banBlocksPurchases: z.boolean(),
    infectionLevelPenalty: z.boolean(),
    source: Source,
  }),
  magicSchools: uniqueList(z.strictObject({ id: Id, name: Text, skill: Id })),
  craftingDisciplines: uniqueList(
    z.strictObject({ id: Id, name: Text, skill: Id, resourceType: ResourceTypeId }),
  ),
  resourceTypes: uniqueList(z.strictObject({ id: ResourceTypeId, name: Text })),
  rarities: uniqueList(z.strictObject({ id: RarityId, name: Text, rank: Rank })),
  source: Source,
});
export type RulesetFile = z.infer<typeof RulesetFile>;
export type ArchetypeCostKind = keyof RulesetFile['archetypeSkill']['costs'];
