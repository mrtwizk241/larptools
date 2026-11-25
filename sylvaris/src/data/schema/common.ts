// Building blocks shared by the Sylvaris rules data schemas. Every object is strict, so an
// unknown or misspelt key in a season's JSON fails validation.
import { z } from 'zod';

/** Stable kebab-case id, for example `back-strike` or `fam-scouting`. */
export const Id = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are lowercase kebab-case, for example "back-strike"');

/** Page reference shown to staff, for example "Rulebook p.91" or "Callings p.5". */
export const Source = z.string().min(1);
/** Our own short summary that players read in the app. */
export const Text = z.string().min(1);

export const NonNegInt = z.int().min(0);
export const PositiveInt = z.int().min(1);
/** A share such as 0.25, between 0 and 1. */
export const Fraction = z.number().min(0).max(1);

/** The four named levels of a leveled skill (levels 1, 3, 6, 10). */
export const NamedLevel = z.enum(['basic', 'expert', 'master', 'grandmaster']);
export type NamedLevel = z.infer<typeof NamedLevel>;
/** Techniques are bought separately from levels; Basic needs none. */
export const Technique = z.enum(['expert', 'master', 'grandmaster']);
export type Technique = z.infer<typeof Technique>;
/** Item and familiar quality. */
export const Quality = z.enum(['mundane', 'basic', 'expert', 'master', 'grandmaster']);

/** The six base elements, also the six base magic schools. */
export const Element = z.enum(['air', 'death', 'earth', 'fire', 'life', 'water']);
export type Element = z.infer<typeof Element>;

export const CurrencyId = z.enum(['xp', 'cxp', 'axp', 'mt']);
export type CurrencyId = z.infer<typeof CurrencyId>;

export const Frequency = z.enum([
  'passive',
  'per-encounter',
  'per-repop',
  'per-event',
  'per-year',
  'other',
]);

/** Every sheet number a rule can change. */
export const Stat = z.enum([
  // Life and armor
  'lifePoints',
  'armorPoints',
  'armorRefitCount',
  'bleedOutSeconds',
  'deathCountMinutes',
  // Passive damage (each has its own cap handling in the engine)
  'passiveDamage1h',
  'passiveDamage2h',
  'passiveDamageWeapon',
  'passiveDamageMelee',
  'passiveDamageBehind',
  'passiveDamageRanged',
  'passiveDamageRelic',
  'passiveDamageDualWield',
  'passiveDamageBondedWeapon',
  // Slots
  'attunementSlots',
  'attunementSlotsToolOnly',
  'lesserBoonSlots',
  'amplifiedLifeSlots',
  'amplifiedArmorSlots',
  // Counts the sheet shows
  'languages',
  'battleUnitSize',
  'familiarLocations',
  'familiarTrees',
  'storedEnergyMax',
  // Check-in and upkeep
  'checkInSilver',
  'checkInBasicComponents',
  'upkeepCovered',
  'upkeepSilver',
  // Calling specifics
  'blockedMagicSchool',
  'canCastFromSpellbook',
  'focusedChargeCap',
  'infiltrationGroupSize',
  'luckyItemsRequired',
  'planarAsylum',
  'protectionStackMax',
  'relicPermanentDamageTypes',
  'researchCostReductionSpecialization',
  'selfResistFearMax',
  'wardInterceptSlots',
  'wardsMax',
]);
export type Stat = z.infer<typeof Stat>;

/** Abilities a skill, innate, or power hands out that are not numbers. */
export const GrantId = z.enum([
  'immune-aging',
  'dual-wield-long-short',
  'dual-wield-long-long',
  'speak-with-animals',
  'special-animal-familiar',
  'special-animal-familiar-upgrade-or-extra',
  'hideout',
  'lair',
  'planar-asylum-all-primary',
  'planar-asylum-nature',
  'speak-with-monsters',
  'claws-or-bite',
]);

/**
 * A change to a sheet number from an innate, a Calling, or an Artifact power. `op` add (the
 * default) adds `amount`, set replaces the value, base sets the starting value that later
 * adds build on. `value` holds a non-number setting. `when` makes it conditional (listed
 * separately on the sheet). `perCallingTechnique` and `perTechniqueInSkill` scale it.
 */
export const Effect = z.strictObject({
  stat: Stat,
  amount: z.number().optional(),
  op: z.enum(['add', 'set', 'base']).optional(),
  value: z.union([Text, z.boolean()]).optional(),
  when: Text.optional(),
  /** Armor pool, e.g. Halfling Dex Armor. */
  pool: z.enum(['dex']).optional(),
  /** The value comes from a choice of the same race or Calling. */
  fromChoice: Id.optional(),
  /** How the choice maps to the value (the choice's `opposites` table). */
  via: z.enum(['opposites']).optional(),
  perCallingTechnique: z.number().optional(),
  perTechniqueInSkill: Id.optional(),
  max: z.number().optional(),
  note: Text.optional(),
});
export type Effect = z.infer<typeof Effect>;

/** A race or Calling choice made at creation or Calling start. */
export const Choice = z
  .strictObject({
    id: Id,
    label: Text,
    kind: z.enum(['text', 'pick', 'language', 'racial-passive', 'racial-skill', 'spell-list']),
    options: z.array(Id).min(1).optional(),
    multi: z.literal(true).optional(),
    summary: Text.optional(),
    /** Racial passive or skill picks: exclude what the character already has. */
    excludeOwned: z.boolean().optional(),
    /** The Calling skill this choice fills in (The Distinctive). */
    appliesToSkill: Id.optional(),
    opposites: z.record(Element, Element).optional(),
    relicDamage: z.record(Element, Text).optional(),
    /** The number of picks comes from this passive stat. */
    maxFromPassives: Stat.optional(),
    perMagicTypePerLevel: PositiveInt.optional(),
    source: Source.optional(),
  })
  .refine((c) => (c.kind === 'pick') === (c.options !== undefined), {
    message: 'pick choices need options, other kinds have none',
  });
export type Choice = z.infer<typeof Choice>;

/** Returns ids that appear more than once. */
export function duplicateIds(items: readonly { id: string }[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const { id } of items) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

/** Array of records whose ids must be unique within the array. */
export function uniqueList<T extends z.ZodType<{ id: string }>>(item: T) {
  return z.array(item).superRefine((items, ctx) => {
    for (const id of duplicateIds(items)) {
      ctx.addIssue({ code: 'custom', message: `duplicate id "${id}"` });
    }
  });
}

/** One number per named level. */
export const ByNamedLevel = <T extends z.ZodType>(v: T) =>
  z.strictObject({ basic: v, expert: v, master: v, grandmaster: v });
