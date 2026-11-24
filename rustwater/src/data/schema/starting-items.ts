// starting-items.json: the starting equipment picks made at character creation.
import { z } from 'zod';
import { Id, PositiveInt, RarityId, Source, Text, assumptionFields, uniqueList } from './common.ts';

const StartingGrant = z.strictObject({
  kind: z.enum([
    'weapon',
    'armor',
    'shield',
    'resource',
    'consumable',
    'bits',
    'spell-blueprint',
    'memorized-spell',
    'recipe-blueprint',
    'memorized-recipe',
    'memorized-performance',
  ]),
  category: z.enum(['melee', 'projectile']).optional(),
  quality: z.enum(['basic']).optional(),
  rarity: RarityId.optional(),
  qty: PositiveInt,
  /** The character must still pay the memorization AP or have a free slot. */
  requiresMemorizationSlotOrAp: z.literal(true).optional(),
});

export const StartingItemOption = z
  .strictObject({
    id: Id,
    name: Text,
    /** Everything listed is received. */
    grants: z.array(StartingGrant).min(1).optional(),
    /** The player takes one of these. */
    oneOf: z.array(StartingGrant).min(2).optional(),
    /** Details picked per item, for example weapon size or resource type. */
    choices: z
      .array(
        z.strictObject({
          field: z.enum(['size', 'type']),
          perUnit: z.literal(true).optional(),
          options: z.array(z.string().min(1)).min(1),
        }),
      )
      .optional(),
    text: Text.optional(),
    source: Source,
  })
  .refine((o) => (o.grants === undefined) !== (o.oneOf === undefined), 'set grants or oneOf');
export type StartingItemOption = z.infer<typeof StartingItemOption>;

export const StartingItemsFile = z.strictObject({
  rules: z.strictObject({
    picks: PositiveInt,
    picksAreMaximum: z.boolean(),
    warnIfFewer: z.boolean(),
    repeatsAllowed: z.boolean(),
    chosenAt: z.enum(['creation']),
    itemQuality: z.enum(['basic']),
    ...assumptionFields,
    source: Source,
  }),
  options: uniqueList(StartingItemOption),
});
export type StartingItemsFile = z.infer<typeof StartingItemsFile>;
