// awardPoints: credit CXP, PXP, Shinies, or FP with a ledger kind. CXP that counts as earned is
// clamped to the 2000 cap with a notice ([PTS-CXP-CAP]); Event CXP and attendance FP at most
// once per event ([PTS-CXP-EVENT]).
import { z } from 'zod';
import { LedgerCurrencySchema, RefIdSchema } from '../actions/define.ts';
import { notice, ruleError } from '../errors.ts';
import { EventKeySchema } from '../model.ts';
import { defineCommand, evaluation } from './define.ts';
import {
  countsAsEarned,
  cxpCapRoom,
  hasAttendanceFp,
  hasEventCxp,
  OptionalText,
} from './helpers.ts';

/** Kinds that only other commands write (creation, Shiny purchases, corrections). */
const RESERVED_KINDS = new Set([
  'transfer',
  'start',
  'infection-bonus',
  'retirement-carry',
  'shiny-purchase',
  'shiny-spend',
  'adjustment',
  'penalty',
]);

export const AwardPointsCommand = z.object({
  type: z.literal('awardPoints'),
  currency: LedgerCurrencySchema,
  amount: z.int().min(1).max(1_000_000),
  /** Ledger kind id from ruleset.ledgerKinds, for example "npc", "staff", "donation". */
  kind: RefIdSchema,
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type AwardPointsCommand = z.input<typeof AwardPointsCommand>;

export const awardPoints = defineCommand<z.output<typeof AwardPointsCommand>>({
  type: 'awardPoints',
  schema: AwardPointsCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    if (!ruleset.ruleset.ledgerKinds.some((k) => k.id === cmd.kind)) {
      ev.errors.push(
        ruleError('INVALID_KIND', `Unknown ledger kind "${cmd.kind}".`, 'PTS-SHINY-EARN'),
      );
      return ev;
    }
    if (RESERVED_KINDS.has(cmd.kind)) {
      ev.errors.push(
        ruleError(
          'INVALID_KIND',
          cmd.kind === 'adjustment' || cmd.kind === 'penalty'
            ? 'Use a points adjustment (with a reason) for corrections and penalties.'
            : `Kind "${cmd.kind}" is recorded by another command, not as an award.`,
          'PTS-SHINY-EARN',
        ),
      );
      return ev;
    }
    if (cmd.kind === 'event') {
      if (cmd.currency !== 'cxp')
        ev.errors.push(ruleError('INVALID_KIND', 'Event awards are CXP.', 'PTS-CXP-EVENT'));
      if (cmd.eventKey === undefined)
        ev.errors.push(
          ruleError('EVENT_REQUIRED', 'Event CXP needs the event it is for.', 'PTS-CXP-EVENT'),
        );
      else if (hasEventCxp(sheet, cmd.eventKey))
        ev.errors.push(
          ruleError(
            'EVENT_CXP_ALREADY_CREDITED',
            `Event CXP for ${cmd.eventKey} is already credited.`,
            'PTS-CXP-EVENT',
          ),
        );
    }
    if (
      cmd.currency === 'fp' &&
      cmd.kind === 'attendance' &&
      cmd.eventKey !== undefined &&
      hasAttendanceFp(sheet, cmd.eventKey)
    )
      ev.errors.push(
        ruleError(
          'FP_ALREADY_CREDITED',
          `Attendance FP for ${cmd.eventKey} is already credited.`,
          'PTS-FP-LEDGER',
        ),
      );

    let amount = cmd.amount;
    if (cmd.currency === 'cxp' && countsAsEarned(ruleset, cmd.kind)) {
      const room = cxpCapRoom(sheet);
      const cap = ruleset.ruleset.earnedCxpCap.amount;
      if (room <= 0)
        ev.errors.push(
          ruleError(
            'CXP_CAP_REACHED',
            `CXP cap reached: this character has earned ${cap} CXP.`,
            'PTS-CXP-CAP',
          ),
        );
      else if (room < amount) {
        ev.notices.push(
          notice(
            'CXP_CAPPED',
            `CXP cap reached: credited ${room} of ${amount} CXP (${cap} earned CXP limit).`,
            'PTS-CXP-CAP',
          ),
        );
        amount = room;
      }
    }
    if (ev.errors.length > 0) return ev;
    builder.add(
      'points.awarded',
      { currency: cmd.currency, amount, kind: cmd.kind, requested: cmd.amount, credited: amount },
      { eventKey: cmd.eventKey, note: cmd.note },
    );
    ev.awards = [{ currency: cmd.currency, amount, kind: cmd.kind }];
    return ev;
  },
});
