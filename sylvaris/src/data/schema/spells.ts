// spells.json: the 104 spells of the six base schools.
import { z } from 'zod';
import { Element, Id, NamedLevel, PositiveInt, Source, Text, uniqueList } from './common.ts';

export const Spell = z.strictObject({
  id: Id,
  name: Text,
  school: Element,
  level: NamedLevel,
  uses: PositiveInt,
  delivery: z.enum([
    'self',
    'touch',
    'packet',
    'point',
    'lash',
    'frontal-cone',
    'voice-radius',
    'wall',
    'circle',
    'storm',
    'other',
  ]),
  /** Marked (E): takes one of the target's Enhancement Slots. */
  enhancement: z.boolean(),
  summary: Text,
  source: Source,
});
export type Spell = z.infer<typeof Spell>;

export const SpellsFile = uniqueList(Spell);
export type SpellsFile = z.infer<typeof SpellsFile>;
