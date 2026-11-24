// spells.json: school spells and mastery magic abilities.
import { z } from 'zod';
import { Id, PartId, PositiveInt, Rank, Source, Text, uniqueList } from './common.ts';

export const SchoolSpell = z.strictObject({
  id: Id,
  name: Text,
  mastery: z.literal(false),
  /** Magic school id from ruleset.json. */
  school: Id,
  rank: Rank,
  /** The call made when the spell lands. */
  call: Text,
  /** B = takes a buff slot. */
  marks: z.array(z.enum(['B'])),
  usesBuffSlot: z.boolean(),
  text: Text,
  source: Source,
});
export type SchoolSpell = z.infer<typeof SchoolSpell>;

export const MasterySpell = z.strictObject({
  id: Id,
  name: Text,
  mastery: z.literal(true),
  /** Mastery magic skill id from skills.json. */
  masterySkill: Id,
  /** The two magic schools it combines. */
  components: z.array(Id).length(2),
  rank: z.enum(['passive', 'basic', 'adept', 'advanced']),
  /** Skill uses spent to use it. */
  expends: z.array(z.strictObject({ skill: Id, part: PartId, count: PositiveInt })),
  text: Text,
  source: Source,
});
export type MasterySpell = z.infer<typeof MasterySpell>;

export const Spell = z.discriminatedUnion('mastery', [SchoolSpell, MasterySpell]);
export type Spell = z.infer<typeof Spell>;

export const SpellsFile = uniqueList(Spell);
export type SpellsFile = z.infer<typeof SpellsFile>;
