// boons.json: boon slot rules and the boons crafted by mastery recipes.
import { z } from 'zod';
import { Effect, Frequency, Id, PositiveInt, Source, Text, uniqueList } from './common.ts';

export const Boon = z.strictObject({
  id: Id,
  name: Text,
  recipeId: Id,
  /** Origin id from this file. */
  origin: Id,
  /** Expiry kind id from this file. */
  expiry: Id,
  frequency: Frequency.optional(),
  /** Ancestry ids that may take it. */
  restrictedTo: z.array(Id).optional(),
  /** Must attach to another boon of this origin. */
  linksToOrigin: Id.optional(),
  maxPerLinkedBoon: PositiveInt.optional(),
  trackerEffect: z.enum(['ancestry-ability-extra-uses']).optional(),
  effects: z.array(Effect).optional(),
  text: Text,
  source: Source,
});
export type Boon = z.infer<typeof Boon>;

export const BoonsFile = z.strictObject({
  rules: z.strictObject({
    slots: PositiveInt,
    acceptWhenFull: z.boolean(),
    uniquePerBoonId: z.boolean(),
    defaultExpiry: Id,
    text: Text,
    source: Source,
  }),
  expiryKinds: uniqueList(z.strictObject({ id: Id, text: Text })),
  origins: uniqueList(z.strictObject({ id: Id, name: Text, masterySkill: Id })),
  modifiers: uniqueList(
    z.strictObject({
      id: Id,
      name: Text,
      recipeId: Id,
      appliesToOrigin: Id.optional(),
      setsExpiry: Id.optional(),
      text: Text,
      source: Source,
    }),
  ),
  boons: uniqueList(Boon),
});
export type BoonsFile = z.infer<typeof BoonsFile>;
