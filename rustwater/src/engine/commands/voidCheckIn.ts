// voidCheckIn: staff take back a whole check-in, reason required. Appends event.checkInVoided;
// history is never edited. Blocked while something later depends on the check-in:
// - a profession started or a profession level bought at that event ([PRO-PACE] reads the event);
// - a profession started later that would no longer have enough events before it ([PRO-START]);
// - points from it already spent, so CXP, PXP, FP, Shinies, or LXP would go negative.
// Item rewards already handed over stay on the sheet (a notice here, a warning on replay).
import { z } from 'zod';
import type { Ruleset } from '../../data/index.ts';
import { notice, ruleError } from '../errors.ts';
import { IdSchema } from '../model.ts';
import { eventDate, eventsPlayedBefore } from '../rules/progression.ts';
import type { LedgerCurrency, Sheet, SheetEvent } from '../sheet.ts';
import { defineCommand, evaluation, type Evaluation } from './define.ts';
import { currencyName, OptionalText, plural } from './helpers.ts';

export const VoidCheckInCommand = z.object({
  type: z.literal('voidCheckIn'),
  /** The event.checkedIn action to void. */
  checkInActionId: IdSchema,
  reason: OptionalText,
  note: OptionalText,
});
export type VoidCheckInCommand = z.input<typeof VoidCheckInCommand>;

const RULE = 'PTS-CHECKIN';

function unspent(sheet: Sheet, currency: LedgerCurrency): number {
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

/** CXP that counts toward LXP_total ([PTS-LXP-TOTAL]). */
function cxpCountedForLxp(ruleset: Ruleset, sheet: Sheet): number {
  const countsStart = ruleset.ruleset.lxp.countsStartingCxp;
  let total = 0;
  for (const r of sheet.ledger)
    if (r.currency === 'cxp' && (countsStart || r.kind !== 'start')) total += r.amount;
  return total;
}

function lxpTotalFor(ruleset: Ruleset, counted: number): number {
  const lxp = ruleset.ruleset.lxp;
  return lxp.atCreation + Math.floor(Math.max(0, counted) / lxp.perCxp);
}

function checkProfession(ruleset: Ruleset, sheet: Sheet, checkIn: SheetEvent, ev: Evaluation) {
  const prof = sheet.profession;
  if (prof === null) return;
  if (prof.startedEventKey === checkIn.key)
    ev.errors.push(
      ruleError(
        'CHECK_IN_IN_USE',
        `Cannot void: the ${prof.name} profession was started at ${checkIn.name}.`,
        'PRO-START',
      ),
    );
  for (const h of prof.history) {
    if (h.eventKey !== checkIn.key) continue;
    const name = prof.skills.find((s) => s.id === h.skillId)?.name ?? h.skillId;
    ev.errors.push(
      ruleError(
        'CHECK_IN_IN_USE',
        `Cannot void: ${name} level ${h.toLevel} was bought at ${checkIn.name}.`,
        'PRO-PACE',
      ),
    );
  }
  const startKey = prof.startedEventKey;
  if (startKey === null || startKey === checkIn.key) return;
  const needed = ruleset.professions.rules.start.eventsPlayedBefore;
  const before = eventsPlayedBefore(sheet, startKey);
  const after = before - (checkIn.date < eventDate(startKey) ? 1 : 0);
  if (before >= needed && after < needed)
    ev.errors.push(
      ruleError(
        'CHECK_IN_IN_USE',
        `Cannot void: the ${prof.name} profession needs ${plural(needed, 'event')} played before it started; without ${checkIn.name} there would be ${after}.`,
        'PRO-START',
      ),
    );
}

function checkBalances(ruleset: Ruleset, sheet: Sheet, checkIn: SheetEvent, ev: Evaluation) {
  const removed = new Map<LedgerCurrency, number>();
  for (const a of checkIn.awards)
    removed.set(a.currency, (removed.get(a.currency) ?? 0) + a.amount);
  for (const [currency, amount] of removed) {
    const left = unspent(sheet, currency);
    if (amount <= 0 || left - amount >= 0) continue;
    const name = currencyName(ruleset, currency);
    ev.errors.push(
      ruleError(
        'CHECK_IN_POINTS_SPENT',
        `Cannot void: it takes back ${amount} ${name}, but only ${left} ${name} is unspent. ${name} would be ${left - amount}; refund what it paid for first.`,
        RULE,
      ),
    );
  }
  const cxp = removed.get('cxp') ?? 0;
  if (cxp > 0 && sheet.created) {
    const counted = cxpCountedForLxp(ruleset, sheet);
    const now = lxpTotalFor(ruleset, counted);
    const after = lxpTotalFor(ruleset, counted - cxp);
    const spent = sheet.points.lxp.spent;
    if (after < now && after < spent)
      ev.errors.push(
        ruleError(
          'CHECK_IN_POINTS_SPENT',
          `Cannot void: LXP total would drop from ${now} to ${after}, but ${spent} LXP is spent on ancestry levels. LXP would be ${after - spent}.`,
          'PTS-LXP-TOTAL',
        ),
      );
  }
}

export const voidCheckIn = defineCommand<z.output<typeof VoidCheckInCommand>>({
  type: 'voidCheckIn',
  schema: VoidCheckInCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const checkIn = sheet.events.find((e) => e.actionId === cmd.checkInActionId);
    if (!checkIn) {
      const voided = sheet.voidedCheckIns.find((v) => v.checkInActionId === cmd.checkInActionId);
      ev.errors.push(
        voided
          ? ruleError(
              'CHECK_IN_ALREADY_VOIDED',
              `The check-in to ${voided.name} was already voided.`,
              RULE,
            )
          : ruleError('NOT_A_CHECK_IN', 'That log entry is not a check-in that counts.', RULE),
      );
      return ev;
    }
    const reason = cmd.reason ?? '';
    if (reason === '')
      ev.errors.push(ruleError('REASON_REQUIRED', 'Voiding a check-in needs a reason.', RULE));
    checkProfession(ruleset, sheet, checkIn, ev);
    checkBalances(ruleset, sheet, checkIn, ev);
    for (const item of sheet.owed)
      if (item.delivered && item.id.startsWith(`${checkIn.actionId}#`))
        ev.notices.push(
          notice(
            'OWED_ALREADY_DELIVERED',
            `${item.text} was already handed over; it stays on the sheet as delivered.`,
            RULE,
          ),
        );
    if (ev.errors.length > 0) return ev;
    builder.add(
      'event.checkInVoided',
      { checkInActionId: checkIn.actionId, reason },
      { eventKey: checkIn.key, note: cmd.note },
    );
    return ev;
  },
});
