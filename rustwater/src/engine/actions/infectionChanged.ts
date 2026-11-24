// infection.changed: staff set the infection (or Aware connection) level ([INF-LEVEL], [INF-AWARE]).
import { z } from 'zod';
import { warn } from '../derive/draft.ts';
import { defineAction, ReasonSchema, RefIdSchema } from './define.ts';

export const InfectionChangedPayload = z.object({
  track: z.enum(['infection', 'connection']),
  toLevel: z.int().min(0).max(100),
  reason: ReasonSchema,
  /** Level before the change, for reading history. */
  fromLevel: z.int().min(0).max(100).optional(),
  /** Gain id from infection.json (death-rise, gm-penalty, staff-adjustment). */
  cause: RefIdSchema.optional(),
});
export type InfectionChangedPayload = z.infer<typeof InfectionChangedPayload>;

export const infectionChanged = defineAction({
  type: 'infection.changed',
  payload: InfectionChangedPayload,
  apply(draft, p, action) {
    const inf = draft.infection;
    if (!inf) {
      warn(
        draft,
        action.id,
        'NO_INFECTION_TRACK',
        'The character has no infection track; skipped.',
      );
      return;
    }
    if (p.track !== inf.track) {
      warn(
        draft,
        action.id,
        'INFECTION_TRACK',
        `This character uses the ${inf.track} track, not ${p.track}; skipped.`,
      );
      return;
    }
    const def = draft.ruleset.infection.tracks.find((t) => t.id === inf.track);
    const min = def?.min ?? 0;
    const max = def?.max ?? 10;
    let level = p.toLevel;
    if (level < min || level > max) {
      warn(
        draft,
        action.id,
        'INFECTION_RANGE',
        `Level ${level} is outside ${min} to ${max}; clamped.`,
      );
      level = Math.min(max, Math.max(min, level));
    }
    inf.current = level;
  },
});
