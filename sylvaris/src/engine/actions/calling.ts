// calling.started and calling.left ([CALL-ELIGIBLE], [CALL-CHANGE]). The start's skill.learned
// actions (Basic in both skills, paid in CXP) follow it in the same plan. Leaving keeps the
// skills on the sheet, locked.
import { z } from 'zod';
import { activeCalling, warn } from '../derive/draft.ts';
import { ChoicesSchema, defineAction, ReasonSchema, RefIdSchema } from './define.ts';

export const CallingStartedPayload = z.object({
  callingId: RefIdSchema,
  choices: ChoicesSchema.default({}),
});
export type CallingStartedPayload = z.input<typeof CallingStartedPayload>;

export const callingStarted = defineAction({
  type: 'calling.started',
  payload: CallingStartedPayload,
  apply(draft, p, action) {
    if (!draft.ruleset.callingsById[p.callingId]) {
      warn(draft, action.id, 'UNKNOWN_CALLING', `Unknown Calling "${p.callingId}"; skipped.`);
      return;
    }
    const current = activeCalling(draft);
    if (current) {
      warn(
        draft,
        action.id,
        'CALLING_ALREADY_ACTIVE',
        `The character is already on a Calling (${current.callingId}); the old one is treated as left.`,
      );
      current.leftAt = action.at;
      current.leftEventKey = action.eventKey ?? null;
      current.leftReason = 'Replaced by a new Calling.';
    }
    draft.callings.push({
      callingId: p.callingId,
      choices: { ...p.choices },
      startedAt: action.at,
      startedEventKey: action.eventKey ?? null,
      leftAt: null,
      leftEventKey: null,
      leftReason: null,
    });
  },
});

export const CallingLeftPayload = z.object({ reason: ReasonSchema });
export type CallingLeftPayload = z.infer<typeof CallingLeftPayload>;

export const callingLeft = defineAction({
  type: 'calling.left',
  payload: CallingLeftPayload,
  apply(draft, p, action) {
    const current = activeCalling(draft);
    if (!current) {
      warn(draft, action.id, 'NO_ACTIVE_CALLING', 'The character is on no Calling; skipped.');
      return;
    }
    current.leftAt = action.at;
    current.leftEventKey = action.eventKey ?? null;
    current.leftReason = p.reason;
  },
});
