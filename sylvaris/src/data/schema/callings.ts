// callings.json: the 13 Callings with innate, detriment, choices, effects, and two skills each.
import { z } from 'zod';
import { Choice, Effect, Id, Source, Text, uniqueList } from './common.ts';
import { CallingSkill } from './skills.ts';

export const Calling = z.strictObject({
  id: Id,
  name: Text,
  summary: Text,
  innate: z.strictObject({ name: Text, summary: Text }),
  detriment: z.strictObject({ summary: Text }).optional(),
  choices: uniqueList(Choice).optional(),
  /** Sheet numbers from the innate. */
  effects: z.array(Effect).min(1).optional(),
  skills: z.array(CallingSkill).length(2),
  source: Source,
});
export type Calling = z.infer<typeof Calling>;

export const CallingsFile = uniqueList(Calling);
export type CallingsFile = z.infer<typeof CallingsFile>;
