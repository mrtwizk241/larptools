// recipes.json: crafting recipes for the four crafts and the six mastery crafts.
import { z } from 'zod';
import {
  Id,
  PositiveInt,
  RarityId,
  Rank,
  ResourceTypeId,
  Source,
  Text,
  uniqueList,
} from './common.ts';

const ResourceCost = z.array(
  z.strictObject({ qty: PositiveInt, rarity: RarityId, type: ResourceTypeId }),
);

const recipeFields = {
  id: Id,
  name: Text,
  rank: Rank,
  /** Resources for a stable item. */
  cost: ResourceCost.min(1),
  /** Resources to upgrade the lower item instead (half cost). */
  upgradeCost: ResourceCost.min(1).optional(),
  /** The rulebook's cost wording, for display. */
  costText: Text,
  /** E enhancement, C consumed, P permanent, I ingestible, B buff slot. */
  marks: z.array(z.enum(['E', 'C', 'P', 'I', 'B'])),
  cannotBeUnstable: z.literal(true).optional(),
  text: Text,
  source: Source,
};

export const CraftRecipe = z.strictObject({
  ...recipeFields,
  mastery: z.literal(false),
  /** Crafting discipline id from ruleset.json. */
  discipline: Id,
});

/** Mastery recipes count as Mastery rank for research. */
export const MasteryRecipe = z.strictObject({
  ...recipeFields,
  mastery: z.literal(true),
  /** Mastery craft skill id from skills.json. */
  masterySkill: Id,
  /** The two crafting disciplines it combines. */
  components: z.array(Id).length(2),
});

export const Recipe = z.discriminatedUnion('mastery', [CraftRecipe, MasteryRecipe]);
export type Recipe = z.infer<typeof Recipe>;

export const RecipesFile = uniqueList(Recipe);
export type RecipesFile = z.infer<typeof RecipesFile>;
