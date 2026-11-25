// performances.json: the 18 performance notes.
import { z } from 'zod';
import { Id, NamedLevel, PositiveInt, Source, Text, uniqueList } from './common.ts';

export const Performance = z.strictObject({
  id: Id,
  name: Text,
  level: NamedLevel,
  uses: PositiveInt,
  enhancement: z.boolean(),
  summary: Text,
  source: Source,
});
export type Performance = z.infer<typeof Performance>;

export const PerformancesFile = uniqueList(Performance);
export type PerformancesFile = z.infer<typeof PerformancesFile>;
