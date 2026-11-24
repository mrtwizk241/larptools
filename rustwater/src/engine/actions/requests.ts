// request.approved / request.rejected: staff decisions on a player's request: a skill level, a
// spell, recipe, performance, or ritual to memorize, or a boon. An approval follows the actions it
// caused (causedBy = request id). Older logs hold skill decisions without `kind`.
import { z } from 'zod';
import { warn, type Draft } from '../derive/draft.ts';
import {
  IdSchema,
  IsoDateTimeSchema,
  RequestMemoryKindSchema,
  SkillPartSchema,
  type Action,
} from '../model.ts';
import { defineAction, ReasonSchema, RefIdSchema } from './define.ts';

const decisionFields = {
  requestId: IdSchema,
  submittedAt: IsoDateTimeSchema,
  /** Absent in older logs, which hold skill requests only. */
  kind: z.enum(['learn-skill', 'memorize', 'boon']).optional(),
  skillId: RefIdSchema.optional(),
  part: SkillPartSchema.optional(),
  toLevel: z.int().min(1).max(1000).optional(),
  memoryKind: RequestMemoryKindSchema.optional(),
  refId: RefIdSchema.optional(),
  boonId: RefIdSchema.optional(),
  teacher: z.string().trim().max(200).optional(),
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
    kind: p.kind ?? 'learn-skill',
    skillId: p.skillId ?? null,
    part: p.part ?? null,
    toLevel: p.toLevel ?? null,
    memoryKind: p.memoryKind ?? null,
    refId: p.refId ?? null,
    boonId: p.boonId ?? null,
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
