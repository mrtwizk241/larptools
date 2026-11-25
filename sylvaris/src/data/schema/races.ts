// races.json: the 14 races with innates, choices, conditional effects, and racial skills.
import { z } from 'zod';
import {
  Choice,
  Effect,
  Element,
  Frequency,
  GrantId,
  Id,
  PositiveInt,
  Source,
  Text,
  uniqueList,
} from './common.ts';
import { RacialSkill } from './skills.ts';

export const RaceInnate = z
  .strictObject({
    /** Stable id, for example `dwarf-innate-passive` (The Distinctive can borrow passives). */
    id: Id,
    kind: z.enum(['passive', 'active']),
    summary: Text,
    uses: PositiveInt.optional(),
    frequency: Frequency.optional(),
    /** The active innate is one use of this skill's Basic ability (Q-RACE-6). */
    grantsSkillUse: Id.optional(),
    /** Sheet numbers; an effect with `when` is conditional. */
    effects: z.array(Effect).min(1).optional(),
    grants: z.array(GrantId).min(1).optional(),
    naturalWeapon: z
      .strictObject({
        /** The race choice that picks one of `options`. */
        choiceId: Id,
        options: uniqueList(
          z.strictObject({
            id: Id,
            baseDamage: PositiveInt,
            greatclaw: z.literal(true).optional(),
          }),
        ),
      })
      .optional(),
  })
  .refine((i) => (i.kind === 'active') === (i.uses !== undefined && i.frequency !== undefined), {
    message: 'active innates have uses and frequency, passive ones have neither',
  });
export type RaceInnate = z.infer<typeof RaceInnate>;

export const Race = z.strictObject({
  id: Id,
  name: Text,
  summary: Text,
  makeup: Text,
  lifespan: z.enum(['short', 'moderate', 'long', 'extra-long']),
  /** choice: picked at creation (see the `size` choice). */
  size: z.enum(['small', 'medium', 'large', 'choice']),
  /** Normal language id (ruleset.json languages). */
  language: Id,
  choices: uniqueList(Choice),
  /** Dragonborn element table. */
  elements: z
    .array(
      z.strictObject({
        id: Element,
        baseColor: Text,
        effect: Text,
        advancedEffect: Text,
        /** Breath numbers are written X/Y; this element uses Y. */
        breathUsesSecondNumber: z.literal(true).optional(),
      }),
    )
    .length(6)
    .optional(),
  innate: z.array(RaceInnate).length(2),
  skills: z.array(RacialSkill).length(2),
  sheetFlags: z
    .strictObject({
      healingImmune: z.boolean(),
      lifeRestoredByRefit: z.boolean(),
      separateArmorAndLifeRefit: z.boolean(),
    })
    .optional(),
  notes: z.array(Text).min(1).optional(),
  source: Source,
});
export type Race = z.infer<typeof Race>;

export const RacesFile = uniqueList(Race);
export type RacesFile = z.infer<typeof RacesFile>;
