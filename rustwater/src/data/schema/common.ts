// Building blocks shared by the rules data schemas. Every object is strict, so an
// unknown or misspelt key in a season's JSON fails validation.
import { z } from 'zod';

/** Stable kebab-case id, for example `aimed-strike` or `100-count-search`. */
export const Id = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are lowercase kebab-case, for example "aimed-strike"');

/** Page reference shown to staff, for example "Rulebook p.48". */
export const Source = z.string().min(1);
/** Rule text that players read in the app. */
export const Text = z.string().min(1);

export const Level = z.int().min(0);
export const PositiveInt = z.int().min(1);

/** Marks a guessed value so staff can find and confirm it. */
export const assumptionFields = {
  assumed: z.literal(true).optional(),
  assumptionNote: Text.optional(),
};

export const CurrencyId = z.enum(['cxp', 'ap', 'lxp', 'pxp', 'shinies', 'fp']);
export const Frequency = z.enum(['passive', 'per-encounter', 'per-repop', 'per-event', 'other']);
export const Rank = z.enum(['basic', 'adept', 'advanced']);
export const RarityId = z.enum(['common', 'uncommon', 'rare']);
export const ResourceTypeId = z.enum(['chemical', 'organic', 'scrap', 'junk']);
export const PartId = z.enum(['basic', 'adept', 'advanced', 'mastery', 'main']);

/** Every number a rule can change on the sheet. */
export const Stat = z.enum([
  'maxHealth',
  'armor',
  'reflexArmor',
  'armorLocationsUpgraded',
  'weaponDamage',
  'damage',
  'packetDamage',
  'uses',
  'countSeconds',
  'bleedOutSeconds',
  'deathCountSeconds',
  'checkInResources',
  'checkInUpgrades',
  'checkInBits',
  'betweenEventQuestions',
  'disguises',
  'countertrackingLevel',
  'performanceSlots',
  'upkeep',
  'ageRank',
]);

const SkillPartRef = z.strictObject({ skill: Id, part: PartId });

/**
 * A change to a sheet number. Amount fields combine: `base` is the starting value,
 * `perLevel` scales with the owning part's level (from `fromLevel` when set, or with
 * the level of `levelOf`), `add` is flat (only from `atLevel` when set), `set` and
 * `multiply` replace or scale the value. `condition` and `note` are display text.
 */
export const Effect = z.strictObject({
  stat: Stat,
  skill: Id.optional(),
  part: PartId.optional(),
  base: z.number().optional(),
  perLevel: z.number().optional(),
  add: z.number().optional(),
  set: z.number().optional(),
  multiply: z.number().optional(),
  all: z.literal(true).optional(),
  atLevel: PositiveInt.optional(),
  fromLevel: PositiveInt.optional(),
  per: z.enum(['encounter']).optional(),
  levelOf: SkillPartRef.optional(),
  rarity: RarityId.optional(),
  qty: PositiveInt.optional(),
  resourceTypes: z.array(ResourceTypeId).min(1).optional(),
  alternative: z.strictObject({ stat: Stat, perLevel: z.number() }).optional(),
  rounding: z.enum(['down-when-attacking']).optional(),
  exclusiveWith: z.array(z.enum(['armor-skill', 'worn-armor'])).optional(),
  who: z.enum(['caster', 'target']).optional(),
  optional: z.boolean().optional(),
  condition: Text.optional(),
  note: Text.optional(),
});
export type Effect = z.infer<typeof Effect>;

/** An item handed out (owed) rather than a point award. */
export const ItemGrant = z.strictObject({
  kind: z.enum(['resource', 'bits', 'upkeep-covered']),
  rarity: RarityId.optional(),
  qty: PositiveInt,
});
export type ItemGrant = z.infer<typeof ItemGrant>;

/** A point award written to a currency ledger. */
export const PointGrant = z.strictObject({
  currency: CurrencyId,
  amount: z.int(),
  kind: Id,
});
export type PointGrant = z.infer<typeof PointGrant>;

/** Builds a "unique by id" refinement message list for arrays of records. */
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
