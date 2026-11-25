// ruleset.json `combat`: what the Play screen's Life, Armor, and Damage calculators use. Weapon
// base damage (Rulebook p.155), armor phys rep points (p.157), and the buffs a character may
// have or be given, each pointing at the skill, spell, recipe, performance, or Artifact power
// it comes from. Temporary Life and Armor are left out: the calculators show healable Life and
// refittable Armor (the 100 caps), as Rustwater's backlog I-5 asked.
import { z } from 'zod';
import { Id, NamedLevel, PositiveInt, Source, Text, uniqueList } from './common.ts';

/** The kinds of attack passive damage is counted for. Claws count as one-handed, bites as two-handed (Q-RACE-10). */
export const AttackClass = z.enum(['one-handed', 'two-handed', 'ranged', 'relic']);
export type AttackClass = z.infer<typeof AttackClass>;

export const CombatWeapon = z.strictObject({
  id: Id,
  name: Text,
  attack: z.enum(['one-handed', 'two-handed', 'ranged']),
  baseDamage: PositiveInt,
  /** Damage types to call, most common first ("2 Edge"). */
  types: z.array(Text).min(1),
});
export type CombatWeapon = z.infer<typeof CombatWeapon>;

export const BuffDamage = z.strictObject({
  amount: PositiveInt,
  attacks: z.array(AttackClass).min(1),
  /** Only on melee attacks from behind. */
  fromBehind: z.boolean().optional(),
});
export type BuffDamage = z.infer<typeof BuffDamage>;

export const CombatBuff = z
  .strictObject({
    id: Id,
    name: Text,
    from: z.strictObject({
      kind: z.enum(['skill', 'spell', 'recipe', 'performance', 'artifact']),
      id: Id,
      /** For a skill: the named level that unlocks it. */
      at: NamedLevel.optional(),
    }),
    /** self: listed only when the character has it. given: anyone can be given it. */
    who: z.enum(['self', 'given']),
    life: PositiveInt.optional(),
    armor: PositiveInt.optional(),
    damage: z.array(BuffDamage).min(1).optional(),
    /** Takes an Enhancement Slot. Of numeric enhancements for the same thing only the largest counts (Rulebook p.78). */
    enhancement: z.boolean(),
    /** Each use adds again: up to the skill's uses, or 1 + its Techniques. */
    stacks: z.enum(['uses', 'techniques-plus-one']).optional(),
    /** Only one buff of a group counts at a time (one Battle Unit, one Monster Ken trait). */
    group: Id.optional(),
    lasts: Text,
    note: Text.optional(),
    source: Source,
  })
  .refine((b) => b.life !== undefined || b.armor !== undefined || b.damage !== undefined, {
    message: 'a buff adds Life, Armor, or damage',
  })
  .refine((b) => b.stacks === undefined || (b.who === 'self' && b.from.kind === 'skill'), {
    message: 'only a skill of your own stacks per use',
  });
export type CombatBuff = z.infer<typeof CombatBuff>;

export const CombatData = z.strictObject({
  weapons: uniqueList(CombatWeapon),
  armorPhysRep: z.strictObject({
    locations: z.array(Text).min(1),
    pointsPerLocation: PositiveInt,
    /** Races whose body is their suit of armor and wear no other (Q-RACE-3). */
    shellRaces: z.array(Id),
  }),
  buffs: uniqueList(CombatBuff),
});
export type CombatData = z.infer<typeof CombatData>;
