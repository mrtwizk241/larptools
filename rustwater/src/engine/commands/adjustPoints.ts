// adjustPoints: staff correction or penalty, positive or negative, reason required
// ([PTS-PENALTY]). Not clamped by caps; a balance that goes negative becomes a notice here and a
// warning on the sheet.
import { z } from 'zod';
import { LedgerCurrencySchema } from '../actions/define.ts';
import { notice, ruleError } from '../errors.ts';
import { EventKeySchema } from '../model.ts';
import type { Sheet } from '../sheet.ts';
import { defineCommand, evaluation } from './define.ts';
import { countsAsEarned, currencyName, OptionalText } from './helpers.ts';

export const AdjustPointsCommand = z.object({
  type: z.literal('adjustPoints'),
  currency: LedgerCurrencySchema,
  /** May be negative; never 0. */
  amount: z
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((n) => n !== 0, 'An adjustment cannot be 0.'),
  reason: OptionalText,
  kind: z.enum(['adjustment', 'penalty']).default('adjustment'),
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type AdjustPointsCommand = z.input<typeof AdjustPointsCommand>;

function available(sheet: Sheet, currency: 'cxp' | 'pxp' | 'shinies' | 'fp'): number {
  switch (currency) {
    case 'cxp':
      return sheet.points.cxp.available;
    case 'pxp':
      return sheet.points.pxp.available;
    case 'fp':
      return sheet.points.fp.available;
    case 'shinies':
      return sheet.points.shinies.balance;
  }
}

export const adjustPoints = defineCommand<z.output<typeof AdjustPointsCommand>>({
  type: 'adjustPoints',
  schema: AdjustPointsCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const reason = cmd.reason ?? '';
    if (reason === '') {
      ev.errors.push(ruleError('REASON_REQUIRED', 'An adjustment needs a reason.', 'PTS-PENALTY'));
      return ev;
    }
    const name = currencyName(ruleset, cmd.currency);
    const after = available(sheet, cmd.currency) + cmd.amount;
    if (after < 0)
      ev.notices.push(
        notice(
          'NEGATIVE_AFTER_ADJUSTMENT',
          `${name} available will be ${after}. The sheet will show a warning until it is fixed.`,
          'PTS-PENALTY',
        ),
      );
    if (cmd.currency === 'cxp' && countsAsEarned(ruleset, cmd.kind) && cmd.amount > 0) {
      const room = sheet.points.cxp.capRemaining;
      if (cmd.amount > room)
        ev.notices.push(
          notice(
            'ABOVE_CXP_CAP',
            `This puts earned CXP ${cmd.amount - room} above the ${ruleset.ruleset.earnedCxpCap.amount} cap.`,
            'PTS-CXP-CAP',
          ),
        );
    }
    builder.add(
      'points.adjusted',
      { currency: cmd.currency, amount: cmd.amount, reason, kind: cmd.kind },
      { eventKey: cmd.eventKey, note: cmd.note },
    );
    return ev;
  },
});
