// request.approved / request.rejected: staff decisions on a player's learn-skill request.
// An approval follows the skill.learned actions it caused (causedBy = request id).
import { z } from 'zod';
import { warn, type Draft } from '../derive/draft.ts';
import { IdSchema, IsoDateTimeSchema, SkillStepSchema, type Action } from '../model.ts';
import { defineAction, ReasonSchema, RefIdSchema, ShortTextSchema } from './define.ts';

const decisionFields = {
  requestId: IdSchema,
  submittedAt: IsoDateTimeSchema,
  skillId: RefIdSchema,
  step: SkillStepSchema,
  teacher: ShortTextSchema.optional(),
  playerNote: z.string().max(5000).optional(),
};

export const RequestApprovedPayload = z.object(decisionFields);
export type RequestApprovedPayload = z.infer<typeof RequestApprovedPayload>;

export const RequestRejectedPayload = z.object({ ...decisionFields, reason: ReasonSchema });
export type RequestRejectedPayload = z.infer<typeof RequestRejectedPayload>;

function record(
  draft: Draft,
  p: RequestApprovedPayload & { reason?: string },
  action: Action,
  status: 'approved' | 'rejected',
): void {
  if (draft.requestDecisions.some((d) => d.requestId === p.requestId)) {
    warn(
      draft,
      action.id,
      'REQUEST_ALREADY_DECIDED',
      `Request ${p.requestId} was already decided; skipped.`,
    );
    return;
  }
  draft.requestDecisions.push({
    requestId: p.requestId,
    status,
    skillId: p.skillId,
    step: p.step,
    submittedAt: p.submittedAt,
    teacher: p.teacher ? p.teacher : null,
    playerNote: p.playerNote ? p.playerNote : null,
    reason: p.reason ?? null,
    decidedAt: action.at,
    actionId: action.id,
  });
}

export const requestApproved = defineAction({
  type: 'request.approved',
  payload: RequestApprovedPayload,
  apply: (draft, p, action) => record(draft, p, action, 'approved'),
});

export const requestRejected = defineAction({
  type: 'request.rejected',
  payload: RequestRejectedPayload,
  apply: (draft, p, action) => record(draft, p, action, 'rejected'),
});
