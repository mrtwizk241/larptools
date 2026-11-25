// recipes.json: the 254 recipes of the twelve crafts.
import { z } from 'zod';
import { Id, NamedLevel, NonNegInt, PositiveInt, Source, Text, uniqueList } from './common.ts';

export const Recipe = z.strictObject({
  id: Id,
  name: Text,
  /** Crafting skill id. */
  craft: Id,
  level: NamedLevel,
  uses: PositiveInt,
  itemCategory: z.enum([
    'consumable',
    'permanent',
    'augment',
    'continuous-augment',
    'renewing-upgrade',
    'insert',
    'byproduct',
    'cut-gem',
  ]),
  unstableAllowed: z.boolean(),
  /** Components to make it stable. */
  stableCost: z.strictObject({
    basic: NonNegInt,
    exotic: NonNegInt,
    uncutGem: PositiveInt.optional(),
  }),
  enhancement: z.boolean(),
  /** Made with an advanced crafting skill. */
  advancedCraft: z.boolean(),
  form: z
    .array(z.enum(['gas-packet', 'paste', 'bandage', 'salve', 'ingredient', 'candle']))
    .min(1)
    .optional(),
  augmentSlots: PositiveInt.optional(),
  itemType: z
    .enum(['armor-or-shield', 'clothing', 'jewelry', 'relic', 'tool', 'weapon', 'wizard-staff'])
    .optional(),
  /** Skill ids whose uses the item grants. */
  grantsSkillUse: z.array(Id).min(1).optional(),
  /** Item types an augment may be set in. */
  allowedIn: z
    .array(
      z.enum([
        'armor',
        'shield',
        'clothing',
        'jewelry',
        'tool',
        'relic',
        'weapon',
        'ranged-weapon',
      ]),
    )
    .min(1)
    .optional(),
  spellLevelMax: NamedLevel.optional(),
  yields: z
    .strictObject({ basic: PositiveInt.optional(), basicPerItemLevel: PositiveInt.optional() })
    .optional(),
  gemCut: z.enum(['square', 'circle', 'triangle']).optional(),
  upgradesAugmentLevel: NamedLevel.optional(),
  ritualLevel: NamedLevel.optional(),
  familiarLevel: NamedLevel.optional(),
  boonSlot: z.enum(['lesser', 'greater']).optional(),
  summary: Text,
  source: Source,
});
export type Recipe = z.infer<typeof Recipe>;

export const RecipesFile = uniqueList(Recipe);
export type RecipesFile = z.infer<typeof RecipesFile>;
