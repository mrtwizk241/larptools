// character.retired ([PTS-RETIRE]): the character leaves play for good. The carry-over is
// computed when recorded (retirementCarry) and kept for the next character's creation.
import { z } from 'zod';
import { warn } from '../derive/draft.ts';
import { defineAction, ReasonSchema } from './define.ts';

export const CharacterRetiredPayload = z.object({
  reason: ReasonSchema,
  /** planned or unplanned (from ruleset.json retirement.kinds). */
  kind: z.string().trim().max(50).optional(),
  carry: z.object({
    cxp: z.int().min(0),
    fp: z.int().min(0),
    shinies: z.int().min(0),
  }),
});
export type CharacterRetiredPayload = z.infer<typeof CharacterRetiredPayload>;

export const characterRetired = defineAction({
  type: 'character.retired',
  payload: CharacterRetiredPayload,
  apply(draft, p, action) {
    if (draft.retired !== null) {
      warn(draft, action.id, 'ALREADY_RETIRED', 'The character already retired; skipped.');
      return;
    }
    draft.retired = {
      reason: p.reason,
      at: action.at,
      kind: p.kind ? p.kind : null,
      carry: { ...p.carry },
    };
  },
});
