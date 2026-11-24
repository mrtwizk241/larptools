// skills.json: every standard, magic, crafting, and multi-archetype skill.
import { z } from 'zod';
import {
  Effect,
  Frequency,
  Id,
  PartId,
  PositiveInt,
  RarityId,
  Rank,
  ResourceTypeId,
  Source,
  Text,
  assumptionFields,
  uniqueList,
} from './common.ts';

/** Which ruleset cost line prices a part (ruleset.json basicSkill or archetypeSkill.costs). */
export const CostKind = z.enum([
  'basic',
  'adept',
  'advanced',
  'encounter',
  'passive',
  'memorization',
  'mastery',
]);
export type CostKind = z.infer<typeof CostKind>;

/** Needs a level in one specific skill part. */
export const SkillPrereq = z.strictObject({
  skill: Id,
  part: PartId,
  minLevel: PositiveInt,
  ...assumptionFields,
});

/** Needs `count` different skills, picked from a pool, each with `part` at `minLevel`. */
export const CountPrereq = z.strictObject({
  count: PositiveInt,
  from: z
    .strictObject({
      archetype: Id.optional(),
      archetypes: z.array(Id).min(1).optional(),
      /** All `count` skills must come from one of `archetypes`. */
      sameArchetype: z.boolean().optional(),
      skills: z.array(Id).min(1).optional(),
    })
    .refine(
      (f) =>
        [f.archetype !== undefined, f.archetypes !== undefined, f.skills !== undefined].filter(
          Boolean,
        ).length === 1,
      'set exactly one of archetype, archetypes, skills',
    ),
  part: PartId,
  minLevel: PositiveInt,
});

const LeafPrereq = z.union([SkillPrereq, CountPrereq]);
const AllOf = z.strictObject({ allOf: z.array(LeafPrereq).min(1) });
const AnyOf = z.strictObject({ anyOf: z.array(z.union([LeafPrereq, AllOf])).min(1) });

/** A part's prereqs list is an implicit "all of". */
export const Prereq = z.union([SkillPrereq, CountPrereq, AllOf, AnyOf]);
export type Prereq = z.infer<typeof Prereq>;

export const SkillPart = z.strictObject({
  costKind: CostKind,
  frequency: Frequency,
  /** Used at check-in rather than in play. */
  timing: z.enum(['check-in']).optional(),
  /** Display text for unusual frequencies. */
  frequencyText: Text.optional(),
  /** Can also be used between events. */
  betweenEvents: z.literal(true).optional(),
  /** The rulebook's cost heading, for display. */
  costText: Text.optional(),
  prereqs: z.array(Prereq),
  teacherRequired: z.literal(true).optional(),
  notAtCreation: z.literal(true).optional(),
  usesPerRepop: PositiveInt.optional(),
  /** Each level of this part gives `perLevel` memorization slots in `pool` (a school, discipline, or "any"). */
  memorizationSlots: z
    .strictObject({
      kind: z.enum(['spell', 'recipe']),
      pool: Id,
      perLevel: PositiveInt,
    })
    .optional(),
  targets: z
    .strictObject({
      max: PositiveInt.optional(),
      area: z.enum(['voice-radius']).optional(),
    })
    .optional(),
  unlocks: z.strictObject({ performanceTier: Rank }).optional(),
  /** Granted when learned (Ritualism). */
  grants: z
    .array(
      z.union([z.strictObject({ ritual: Id }), z.strictObject({ chooseRituals: PositiveInt })]),
    )
    .optional(),
  /** Mastery magic: spell ids of its passive, basic, adept, and advanced abilities. */
  abilities: z.array(Id).optional(),
  effects: z.array(Effect).optional(),
  ...assumptionFields,
  text: Text,
});
export type SkillPart = z.infer<typeof SkillPart>;

const ArchetypeRule = z.union([
  z.strictObject({ kind: z.literal('locked-on-first-purchase') }),
  z.strictObject({ kind: z.literal('one-of-prereq-archetypes') }),
  z.strictObject({ kind: z.literal('same-as-skill'), skill: Id }),
]);

export const Skill = z
  .strictObject({
    id: Id,
    name: Text,
    category: z.enum(['standard', 'magic', 'crafting', 'multi']),
    /** Archetype whose AP the skill earns and spends. */
    archetype: Id.optional(),
    /** Multi-archetype skills: the archetype is chosen when learned. */
    archetypeOptions: z.array(Id).min(2).optional(),
    archetypeRule: ArchetypeRule.optional(),
    type: z.enum(['basic', 'encounter', 'passive', 'memorization', 'mastery']),
    /** R = resistance, Av = avoidance. */
    marks: z.array(z.enum(['R', 'Av'])),
    /** Same skill listed in two archetypes (Toughness, Rally, Stealth) or one family (meditation). */
    skillGroup: Id.optional(),
    /** Magic school this skill casts (school skills only). */
    school: Id.optional(),
    /** Crafting discipline this skill crafts (craft skills only). */
    discipline: Id.optional(),
    /** Mastery magic or crafting: the two schools or disciplines it combines. */
    components: z.array(Id).length(2).optional(),
    packetDamageTypes: z.array(z.string().min(1)).optional(),
    cognitivePower: z.literal(true).optional(),
    canBeUnstable: z.boolean().optional(),
    parts: z
      .strictObject({
        basic: SkillPart.optional(),
        adept: SkillPart.optional(),
        advanced: SkillPart.optional(),
        mastery: SkillPart.optional(),
        main: SkillPart.optional(),
      })
      .refine((p) => Object.keys(p).length > 0, 'a skill needs at least one part'),
    /** Alchemy and Enchanting craft tiers. */
    tiers: z
      .array(
        z.strictObject({
          tier: Rank,
          materials: z.strictObject({
            count: PositiveInt,
            rarity: RarityId,
            kinds: z.array(ResourceTypeId).min(1),
          }),
          text: Text,
        }),
      )
      .optional(),
    /** Rule text that covers the whole skill. */
    text: Text.optional(),
    /** Names the current Google Sheet uses, per part, for .xlsx import. */
    sheetNames: z.strictObject({
      basic: Text.optional(),
      adept: Text.optional(),
      advanced: Text.optional(),
      mastery: Text.optional(),
      main: Text.optional(),
    }),
    /** Staff notes on the source text. */
    notes: Text.optional(),
    source: Source,
  })
  .refine(
    (s) => (s.archetype === undefined) !== (s.archetypeOptions === undefined),
    'set exactly one of archetype and archetypeOptions',
  );
export type Skill = z.infer<typeof Skill>;
export type SkillPartId = z.infer<typeof PartId>;

export const SkillsFile = uniqueList(Skill);
export type SkillsFile = z.infer<typeof SkillsFile>;
