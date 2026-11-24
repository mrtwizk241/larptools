// approveRequest / rejectRequest / checkRequest: staff decisions on a player's request
// (SPEC "Outside the action log", DECISIONS answer 3).
// - Skill: approval runs the learnSkill rules on the request, adds one skill.learned per level
//   with causedBy = request id, then request.approved (submittedAt, teacher, playerNote).
//   A multi-archetype skill bought for the first time uses the request's archetype unless staff
//   override it.
// - Memorize: runs the memorize rules, buying one memorization level when no slot is free.
// - Boon: runs the addBoon rules (slots, one of each, ancestry limits).
// - Rejection records request.rejected with the reason.
// - A request already decided (in this log or by its status) cannot be decided again.
import { z } from 'zod';
import { ruleError } from '../errors.ts';
import { RefIdSchema } from '../actions/define.ts';
import { EventKeySchema, RequestSchema, type Request } from '../model.ts';
import type { Sheet } from '../sheet.ts';
import { defineCommand, evaluation, type Builder, type Evaluation } from './define.ts';
import { OptionalShortText, OptionalText } from './helpers.ts';
import { evaluateLearn } from './learnSkill.ts';
import { MemorizeCommand, memorize } from './memorize.ts';
import { AddBoonCommand, addBoon } from './records.ts';

export const ApproveRequestCommand = z.object({
  type: z.literal('approveRequest'),
  request: RequestSchema,
  /** Overrides the teacher the player named. */
  teacher: OptionalShortText,
  /** Overrides the archetype the player chose (multi-archetype skills on first purchase). */
  archetype: RefIdSchema.optional(),
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
    ruleError('REQUEST_ALREADY_DECIDED', `This request was already ${status}.`, 'ENGINE-COMMAND'),
  );
  return true;
}

function subjectFields(request: Request) {
  switch (request.kind) {
    case 'learn-skill':
      return {
        kind: request.kind,
        skillId: request.skillId,
        part: request.part,
        toLevel: request.toLevel,
      };
    case 'memorize':
      return { kind: request.kind, memoryKind: request.memoryKind, refId: request.refId };
    case 'boon':
      return { kind: request.kind, boonId: request.boonId };
  }
}

function decisionPayload(request: Request, teacher: string) {
  return {
    requestId: request.id,
    submittedAt: request.createdAt,
    ...subjectFields(request),
    ...(teacher !== '' ? { teacher } : {}),
    ...(request.note !== '' ? { playerNote: request.note } : {}),
  };
}

/** Every action the inner command adds is marked as caused by the request. */
function causedBy(builder: Builder, requestId: string): Builder {
  return {
    actions: builder.actions,
    add: (type, payload, options = {}) =>
      builder.add(type, payload, { ...options, causedBy: requestId }),
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
    let result: Evaluation;
    if (request.kind === 'learn-skill') {
      result = evaluateLearn(
        ruleset,
        sheet,
        {
          skillId: request.skillId,
          part: request.part,
          toLevel: request.toLevel,
          archetype: cmd.archetype ?? request.archetype,
          teacher,
        },
        { atCreation: false, causedBy: request.id, eventKey: cmd.eventKey, note: cmd.note },
        builder,
      );
    } else if (request.kind === 'memorize') {
      const inner = MemorizeCommand.parse({
        type: 'memorize',
        kind: request.memoryKind,
        refId: request.refId,
        buySlot: true,
        ...(teacher !== '' ? { teacher } : {}),
        ...(cmd.eventKey !== undefined ? { eventKey: cmd.eventKey } : {}),
        ...(cmd.note !== undefined ? { note: cmd.note } : {}),
      });
      result = memorize.evaluate(ruleset, sheet, inner, causedBy(builder, request.id));
    } else {
      const inner = AddBoonCommand.parse({
        type: 'addBoon',
        boonId: request.boonId,
        ...(cmd.eventKey !== undefined ? { eventKey: cmd.eventKey } : {}),
        ...(cmd.note !== undefined ? { note: cmd.note } : {}),
      });
      result = addBoon.evaluate(ruleset, sheet, inner, causedBy(builder, request.id));
    }
    if (result.errors.length > 0) return result;
    builder.add('request.approved', decisionPayload(request, teacher), {
      causedBy: request.id,
      eventKey: cmd.eventKey,
    });
    return result;
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
          'ENGINE-COMMAND',
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
