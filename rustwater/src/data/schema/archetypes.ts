// archetypes.json: the six archetypes that earn and spend AP.
import { z } from 'zod';
import { Id, Source, Text, uniqueList } from './common.ts';

export const Archetype = z.strictObject({
  id: Id,
  name: Text,
  description: Text,
  source: Source,
});
export type Archetype = z.infer<typeof Archetype>;

export const ArchetypesFile = uniqueList(Archetype);
export type ArchetypesFile = z.infer<typeof ArchetypesFile>;
