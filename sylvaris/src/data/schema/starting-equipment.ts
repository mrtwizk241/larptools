// starting-equipment.json: the 17 starting options a new character picks 10 from.
import { z } from 'zod';
import { Id, NamedLevel, PositiveInt, Source, Text, uniqueList } from './common.ts';

export const StartingOption = z.strictObject({
  id: Id,
  name: Text,
  quality: NamedLevel.optional(),
  gmApproval: z.boolean(),
  /** What the player names with the pick. */
  choice: z.enum(['weapon-type', 'element', 'spell', 'recipe', 'craft', 'performance']).optional(),
  copper: PositiveInt.optional(),
});
export type StartingOption = z.infer<typeof StartingOption>;

export const StartingEquipmentFile = z.strictObject({
  picks: PositiveInt,
  duplicatesAllowed: z.boolean(),
  totalValueCopper: PositiveInt,
  note: Text,
  options: uniqueList(StartingOption),
  source: Source,
});
export type StartingEquipmentFile = z.infer<typeof StartingEquipmentFile>;
