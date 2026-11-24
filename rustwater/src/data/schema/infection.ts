// infection.json: infection and connection tracks, death counts, and trauma.
import { z } from 'zod';
import { Id, PositiveInt, Source, Text, uniqueList } from './common.ts';

export const InfectionTrack = z.strictObject({
  id: Id,
  name: Text,
  aliases: z.array(Text).optional(),
  min: z.int().min(0),
  max: PositiveInt,
  atMax: z.strictObject({
    outcome: z.enum(['risen', 'restless']),
    triggers: z.enum(['unplanned-retirement']),
    text: Text,
  }),
  source: Source,
});
export type InfectionTrack = z.infer<typeof InfectionTrack>;

export const InfectionFile = z.strictObject({
  tracks: uniqueList(InfectionTrack),
  /** Ways the track goes up. Staff adjustments may go either way. */
  gain: uniqueList(
    z
      .strictObject({
        id: Id,
        amount: PositiveInt.optional(),
        staffSetsAmount: z.literal(true).optional(),
        triggersTrauma: z.boolean().optional(),
        when: Text,
        preventedBy: Text.optional(),
        source: Source,
      })
      .refine(
        (g) => (g.amount === undefined) !== (g.staffSetsAmount === undefined),
        'set amount or staffSetsAmount',
      ),
  ),
  /** Current level stays within the track's min and max. */
  clampToTrack: z.boolean(),
  death: z.strictObject({
    downedAtHealth: z.int(),
    downedRecoverMinutes: PositiveInt,
    downedRecoverToHealth: z.int(),
    bleedOutAtHealth: z.int(),
    minimumHealth: z.int(),
    bleedOutSeconds: PositiveInt,
    riseCountMinutes: PositiveInt,
    riseAtFullHealth: z.boolean(),
    skillUsesRestoredOnDeath: z.boolean(),
    clearedOnDeath: z.array(Text),
    awareText: Text,
    source: Source,
  }),
  trauma: z.strictObject({
    /** Gain id that creates a trauma entry. */
    createdOn: Id,
    createdBy: Text,
    removable: z.boolean(),
    fields: z.array(z.enum(['text', 'createdAtEvent', 'status', 'removedBy'])),
    source: Source,
  }),
});
export type InfectionFile = z.infer<typeof InfectionFile>;
