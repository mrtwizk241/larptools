// approveRequest / rejectRequest: staff decisions on a player's learn-skill
// request (the Log of Learning, [SKL-LOG]).
// - Approval runs the learnSkill rules on the request with the teacher required (Q-SKL-4:
//   player requests must name one), adds the skill.learned actions with causedBy = request id,
//   then request.approved.
// - Rejection records request.rejected with the reason.
// - A request already decided (in this log or by its status) cannot be decided again.
import { z } from 'zod';
import { ruleError, RULE_IDS } from '../errors.ts';
import { EventKeySchema, RequestSchema, type Request } from '../model.ts';
import type { Sheet } from '../sheet.ts';
import { defineCommand, evaluation, type Evaluation } from './define.ts';
import { OptionalShortText, OptionalText, ownedFromSheet } from './helpers.ts';
import { evaluateLearn, expandStep } from './learnSkill.ts';

export const ApproveRequestCommand = z.object({
  type: z.literal('approveRequest'),
  request: RequestSchema,
  /** Overrides the teacher the player named. */
  teacher: OptionalShortText,
  /** The event it was learned at (needed for Calling Techniques). */
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type ApproveRequestCommand = z.input<typeof ApproveRequestCommand>;

export const RejectRequestCommand = z.object({
  type: z.literal('rejectRequest'),
  request: RequestSchema,
  /** Required to record the rejection. */
  reason: OptionalText,
  note: OptionalText,
});
export type RejectRequestCommand = z.input<typeof RejectRequestCommand>;

function alreadyDecided(sheet: Sheet, request: Request, ev: Evaluation): boolean {
  const decision = sheet.requestDecisions.find((d) => d.requestId === request.id);
  const status =
    decision?.status ??
    (request.status === 'approved' || request.status === 'rejected' ? request.status : null);
  if (status === null) return false;
  ev.errors.push(
    ruleError('REQUEST_ALREADY_DECIDED', `This request was already ${status}.`, RULE_IDS.command),
  );
  return true;
}

function decisionPayload(request: Request, teacher: string) {
  return {
    requestId: request.id,
    submittedAt: request.createdAt,
    skillId: request.skillId,
    step: request.step,
    ...(teacher !== '' ? { teacher } : {}),
    ...(request.note !== '' ? { playerNote: request.note } : {}),
  };
}

export const approveRequest = defineCommand<z.output<typeof ApproveRequestCommand>>({
  type: 'approveRequest',
  schema: ApproveRequestCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const { request } = cmd;
    if (alreadyDecided(sheet, request, ev)) return ev;
    const teacher = (cmd.teacher ?? request.teacher).trim();
    const current = ownedFromSheet(sheet)(request.skillId);
    const learn = evaluateLearn(
      ruleset,
      sheet,
      { skillId: request.skillId, steps: expandStep(current, request.step), teacher },
      {
        atCreation: false,
        requireTeacher: true,
        causedBy: request.id,
        eventKey: cmd.eventKey,
        note: cmd.note,
      },
      builder,
    );
    if (learn.errors.length > 0) return learn;
    builder.add('request.approved', decisionPayload(request, teacher), {
      causedBy: request.id,
      eventKey: cmd.eventKey,
    });
    return learn;
  },
});

export const rejectRequest = defineCommand<z.output<typeof RejectRequestCommand>>({
  type: 'rejectRequest',
  schema: RejectRequestCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const { request } = cmd;
    if (alreadyDecided(sheet, request, ev)) return ev;
    const reason = cmd.reason ?? '';
    if (reason === '') {
      ev.errors.push(
        ruleError(
          'REASON_REQUIRED',
          'Give the player a reason for the rejection.',
          RULE_IDS.command,
        ),
      );
      return ev;
    }
    builder.add(
      'request.rejected',
      { ...decisionPayload(request, request.teacher.trim()), reason },
      { causedBy: request.id, note: cmd.note },
    );
    return ev;
  },
});
