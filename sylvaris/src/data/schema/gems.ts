// gems.json: gem cuts and copper values.
import { z } from 'zod';
import { Element, Id, NamedLevel, PositiveInt, Source, Text, uniqueList } from './common.ts';

export const GemCutId = z.enum(['uncut', 'square', 'circle', 'triangle']);

export const Gem = z.strictObject({
  id: Id,
  name: Text,
  color: Text,
  valueCopper: z.strictObject({ square: PositiveInt, circle: PositiveInt, triangle: PositiveInt }),
  magicAffinity: Element,
  affinityIsFlavorOnly: z.boolean(),
  source: Source,
});
export type Gem = z.infer<typeof Gem>;

export const GemsFile = z.strictObject({
  cuts: z
    .array(
      z.strictObject({
        id: GemCutId,
        /** Terra Artis recipe that makes this cut. */
        cutRecipe: Id.optional(),
        craftLevel: NamedLevel.optional(),
        /** Uncut gems have no listed value (Q-CRF-7). */
        valueKnown: z.boolean().optional(),
      }),
    )
    .length(4),
  gems: uniqueList(Gem),
  notes: Text,
  source: Source,
});
export type GemsFile = z.infer<typeof GemsFile>;
