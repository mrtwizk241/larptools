// ruleset.json: season id, name, and every constant as a plain number. Page references for
// the constants live in `sources` and short notes in `notes`, both keyed by the dotted path
// of the value they describe (for example "xp.earnedCap").
import { z } from 'zod';
import {
  ByNamedLevel,
  CurrencyId,
  Element,
  Fraction,
  Id,
  NonNegInt,
  PositiveInt,
  Quality,
  Source,
  Technique,
  Text,
  uniqueList,
} from './common.ts';
import { CombatData } from './combat.ts';

export const TechniqueRow = z.strictObject({
  id: Technique,
  /** Skill level the Technique needs. */
  level: PositiveInt,
  /** XP (or CXP for Calling skills). */
  cost: PositiveInt,
  /** The Technique that must be owned first. */
  requires: Technique.optional(),
});
export type TechniqueRow = z.infer<typeof TechniqueRow>;

const RetirementShare = z.strictObject({
  fraction: Fraction,
  /** Subtracted from the earned amount before the fraction (XP: the starting 150). */
  deduct: NonNegInt.optional(),
  base: z.enum(['earned']),
});

export const SyRulesetFile = z.strictObject({
  id: z
    .string()
    .regex(/^sylvaris-[0-9]+\.[0-9]+\.[0-9]+$/, 'ruleset ids look like "sylvaris-1.3.1"'),
  name: Text,
  rulebookVersion: Text,
  callingsVersion: Text,
  currencies: uniqueList(z.strictObject({ id: CurrencyId, name: Text, abbr: Text })),
  ledgerKinds: uniqueList(z.strictObject({ id: Id, name: Text })),
  xp: z.strictObject({
    start: PositiveInt,
    perEvent: PositiveInt,
    /** Credits stop once total earned XP reaches this. */
    earnedCap: PositiveInt,
    earnedCapIncludesStart: z.boolean(),
  }),
  cxp: z.strictObject({
    start: NonNegInt,
    perEvent: PositiveInt,
    /** The full cost of one Calling (Q-CALL-1 default). */
    earnedCap: PositiveInt,
  }),
  axp: z.strictObject({ start: NonNegInt, perEvent: PositiveInt }),
  skills: z.strictObject({
    maxLevel: PositiveInt,
    /** Level n costs costPerLevel x n. */
    costPerLevel: PositiveInt,
    namedLevels: ByNamedLevel(PositiveInt),
    usesPerAbility: ByNamedLevel(PositiveInt),
    techniques: z.array(TechniqueRow).length(3),
    /** Advanced skills need each prerequisite at this Technique. */
    advancedPrereqTechnique: Technique,
    racialSkillsSameCost: z.boolean(),
  }),
  creation: z.strictObject({
    startingXp: PositiveInt,
    maxSkillLevel: PositiveInt,
    maxTechnique: Technique,
    startingEquipmentPicks: PositiveInt,
    minAgeCategory: PositiveInt,
    maxAgeCategory: PositiveInt,
    defaultAgeCategory: PositiveInt,
    literacyChoice: z.array(z.enum(['race-language', 'common'])).min(1),
    garbEnforcedByEvent: PositiveInt,
  }),
  languages: uniqueList(z.strictObject({ id: Id, name: Text })),
  magicSchools: uniqueList(z.strictObject({ id: Element, name: Text, skill: Id })),
  events: z.strictObject({
    repopsPerEvent: PositiveInt,
    sessions: z.array(z.strictObject({ session: PositiveInt, begins: Text, ends: Text })).min(1),
    ibgaPerGap: PositiveInt,
    ibgaDeadlineDaysBefore: PositiveInt,
    checkoutFormDue: Text,
    checkInSteps: z.array(Text).min(1),
  }),
  upkeep: z.strictObject({
    silverPerEvent: PositiveInt,
    firstEventFree: z.boolean(),
    modifiers: uniqueList(
      z.strictObject({
        id: Id,
        summary: Text,
        coversSilver: PositiveInt.optional(),
        coversAll: z.literal(true).optional(),
        source: Source,
      }),
    ),
  }),
  coins: z.strictObject({ copperPerSilver: PositiveInt, silverPerGold: PositiveInt }),
  body: z.strictObject({
    baseLifePoints: PositiveInt,
    baseArmorPoints: NonNegInt,
    spiritFragmentsStart: PositiveInt,
    spiritFragmentsMax: PositiveInt,
    unconsciousMinutes: PositiveInt,
    bleedOutSeconds: PositiveInt,
    deathCountMinutes: PositiveInt,
    raiseLifeFraction: Fraction,
    spiritFragmentLossAfterDeathCount: PositiveInt,
    refitCount: PositiveInt,
    killingBlowCount: PositiveInt,
    hastenMinCount: PositiveInt,
  }),
  caps: z.strictObject({
    passiveDamage: PositiveInt,
    passiveDamageFromBehind: PositiveInt,
    passiveDamageWeakened: PositiveInt,
    healableLifePoints: PositiveInt,
    temporaryLifePoints: PositiveInt,
    refittableArmorPoints: PositiveInt,
    temporaryArmorPoints: PositiveInt,
    skillRenewalsPerEncounter: PositiveInt,
  }),
  slots: z.strictObject({
    enhancement: PositiveInt,
    attunement: PositiveInt,
    greaterBoon: PositiveInt,
    lesserBoon: PositiveInt,
    attunementMinutes: PositiveInt,
    augmentSlotsByQuality: z.record(Quality, NonNegInt),
  }),
  familiarization: z.strictObject({
    maxLocations: PositiveInt,
    fixedLocation: Text,
    fixedLocationCountsTowardMax: z.boolean(),
    minutesToFamiliarize: PositiveInt,
  }),
  relic: z.strictObject({
    baseDamage: PositiveInt,
    damageByElement: z.record(Element, Text),
  }),
  racialInnateMinMinutesBetweenUses: PositiveInt,
  calling: z.strictObject({
    /** Full events completed before a Calling can start. */
    minFullEvents: PositiveInt,
    /** Starting buys this level in both Calling skills. */
    startLevelInBothSkills: PositiveInt,
    startCostCxp: PositiveInt,
    currency: z.literal('cxp'),
    maxActive: PositiveInt,
    techniquesPerEvent: PositiveInt,
    noTechniqueAtStartEvent: z.boolean(),
    /** The two Calling skills stay within this many Technique tiers. */
    maxTechniqueGap: NonNegInt,
  }),
  artifact: z.strictObject({
    maxPerPc: PositiveInt,
    minXpEarned: PositiveInt,
    /** Awakening buys the first slot. */
    awakenCostAxp: PositiveInt,
    slotCostAxp: PositiveInt,
    maxSlots: PositiveInt,
  }),
  retirement: z.strictObject({
    xp: RetirementShare,
    cxp: RetirementShare,
    axp: RetirementShare,
    /** Market value of goods: fraction first, then minus deductCopper, not below min. */
    goods: z.strictObject({ fraction: Fraction, deductCopper: NonNegInt, min: NonNegInt }),
    rounding: z.enum(['down']),
    /** The new character starts with the transfer only (Q-RET-2). */
    startingXpIsTransferOnly: z.boolean(),
    warnBelowXp: PositiveInt,
    creationLimitsWaived: z.boolean(),
    /** Teaching for these Techniques is paid in coin from the goods transfer. */
    coinPaidTechniques: z.array(Technique),
    targets: z.array(z.enum(['new-character', 'existing-character-same-player'])).min(1),
    lockedOnceAssigned: z.boolean(),
    summary: Text,
  }),
  /** Weapons, armor phys rep, and buffs for the Play screen calculators. */
  combat: CombatData,
  /** Dotted path of a value, for example "xp.earnedCap", to its page reference. */
  sources: z.record(z.string().min(1), Source),
  /** Dotted path to a short staff note. "townBuildings" covers optional town settings. */
  notes: z.record(z.string().min(1), Text),
  source: Source,
});
export type SyRulesetFile = z.infer<typeof SyRulesetFile>;
