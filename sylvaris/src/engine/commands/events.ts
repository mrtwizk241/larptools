// checkIn and voidCheckIn ([EVT-CHECKIN], [EVT-UPKEEP], [PTS-XP-EVENT], [PTS-MT-EARN]).
// - One check-in per event. Awards come from the attendance bundle, NPC time, and extras in
//   awards.json; XP and CXP above the earned caps are recorded as not credited.
// - Upkeep: 1 Silver per event, the first event free, none for Fortune Favored; paid or covered
//   by an upkeep modifier the character has (Merchanting, Urban Knowledge, Live off the Land).
// - What the desk hands over defaults to the check-in income with default choices; staff pass
//   the pre-registration pull list instead when there is one.
// - A void is blocked while something depends on the check-in: points from it already spent,
//   the Calling started or a Calling Technique learned at it, Calling eligibility, a Mist Token
//   back-buy for it, or a journal entry or a teaching (Basic or Technique) dated to it. The
//   error names the dependent action, so staff know what to correct first.
import { z } from 'zod';
import { AttendanceSchema } from '../actions/events.ts';
import { ItemTextSchema, RefIdSchema } from '../actions/define.ts';
import { notice, ruleError } from '../errors.ts';
import { GameEventSchema, IdSchema } from '../model.ts';
import { applyCaps, attendanceAwards, attendanceSilver } from '../rules/awards.ts';
import { fullEventsBefore } from '../rules/calling.ts';
import { incomeItems, upkeepOptionIndex } from '../rules/income.ts';
import type { LedgerCurrency, Sheet, SheetEvent } from '../sheet.ts';
import type { RuleError } from '../errors.ts';
import { defineCommand, evaluation } from './define.ts';
import { available, currencyName, hasEventXp, OptionalText, plural } from './helpers.ts';

export const CheckInCommand = z.object({
  type: z.literal('checkIn'),
  event: GameEventSchema,
  attendance: AttendanceSchema.default('player'),
  npcHours: z.int().min(0).max(200).default(0),
  /** check-in-assist, marshal-medic, sunday-cleanup, friday-setup. */
  extras: z.array(RefIdSchema).max(20).default([]),
  /** Paid NPC: skill use or silver. */
  paidChoice: z.enum(['skills', 'silver']).optional(),
  /** How upkeep is covered: `paid`, or an upkeep modifier the character has. */
  upkeep: RefIdSchema.optional(),
  /** What the desk hands over, as text. Leave out for the default check-in income. */
  handedOut: z.array(ItemTextSchema).max(100).optional(),
  note: OptionalText,
});
export type CheckInCommand = z.input<typeof CheckInCommand>;

/** Upkeep due at an event for this sheet: first event free, Calling effects applied. */
export function upkeepDue(sheet: Sheet, eventKey: string): number {
  const up = sheet.stats.upkeep;
  const before = sheet.events.filter((e) => e.key !== eventKey);
  if (up.firstEventFree && before.length === 0) return 0;
  return up.silverPerEvent;
}

export const checkIn = defineCommand<z.output<typeof CheckInCommand>>({
  type: 'checkIn',
  schema: CheckInCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const { event } = cmd;
    const RULE = 'EVT-CHECKIN';
    if (!event.key.startsWith(`${event.date}-`))
      ev.errors.push(
        ruleError(
          'INVALID_EVENT',
          `Event key ${event.key} does not start with its date ${event.date}.`,
          RULE,
        ),
      );
    const bundle = ruleset.attendanceById[cmd.attendance];
    if (!bundle) {
      ev.errors.push(
        ruleError('UNKNOWN_ATTENDANCE', `Unknown attendance "${cmd.attendance}".`, RULE),
      );
      return ev;
    }
    if (sheet.events.some((e) => e.key === event.key))
      ev.errors.push(
        ruleError(
          'EVENT_ALREADY_CHECKED_IN',
          `Already checked in to ${event.name}.`,
          'PTS-XP-EVENT',
        ),
      );
    else if (hasEventXp(sheet, event.key))
      ev.errors.push(
        ruleError(
          'EVENT_XP_ALREADY_CREDITED',
          `Event XP for ${event.name} is already credited.`,
          'PTS-XP-EVENT',
        ),
      );
    const counts = new Map<string, number>();
    for (const id of cmd.extras) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, n] of counts) {
      const extra = ruleset.extrasById[id];
      if (!extra)
        ev.errors.push(ruleError('UNKNOWN_EXTRA', `Unknown extra "${id}".`, 'PTS-MT-EARN'));
      else if (n > extra.maxPerEvent)
        ev.errors.push(
          ruleError(
            'EXTRA_OVER_CAP',
            `${extra.name} counts ${plural(extra.maxPerEvent, 'time')} per event.`,
            'PTS-MT-EARN',
          ),
        );
    }
    if (cmd.paidChoice !== undefined && !bundle.paidChoice)
      ev.errors.push(
        ruleError('PAID_CHOICE_INVALID', `${bundle.name} has no paid choice.`, 'PTS-MT-EARN'),
      );
    if (bundle.npcTimeMax && cmd.npcHours > 0)
      ev.notices.push(
        notice(
          'NPC_HOURS_IGNORED',
          `${bundle.name} already gets NPC time at its maximum; the hours entered add nothing.`,
          'PTS-MT-EARN',
        ),
      );

    // Upkeep.
    const due = upkeepDue(sheet, event.key);
    const covers = sheet.stats.upkeep.covers;
    let coveredBy: string | null = null;
    if (due > 0) {
      coveredBy = cmd.upkeep ?? covers.find((c) => c.automatic)?.id ?? 'paid';
      if (coveredBy !== 'paid' && !covers.some((c) => c.id === coveredBy))
        ev.errors.push(
          ruleError(
            'UPKEEP_COVER_INVALID',
            `Upkeep cannot be covered by "${coveredBy}" for this character; pay it or use ${covers.map((c) => c.id).join(', ') || 'nothing else'}.`,
            'EVT-UPKEEP',
          ),
        );
    } else if (cmd.upkeep !== undefined && cmd.upkeep !== 'paid')
      ev.notices.push(notice('NO_UPKEEP_DUE', 'No upkeep is due at this event.', 'EVT-UPKEEP'));
    if (ev.errors.length > 0) return ev;

    const requested = attendanceAwards(ruleset, bundle, cmd.npcHours, cmd.extras);
    const { credited, notCredited } = applyCaps(requested, {
      xp: sheet.points.xp.capRemaining,
      cxp: sheet.points.cxp.capRemaining,
    });
    for (const a of notCredited)
      ev.notices.push(
        notice(
          a.currency === 'xp' ? 'XP_CAPPED' : 'CXP_CAPPED',
          `${currencyName(ruleset, a.currency)} cap reached: ${a.amount} ${a.kind} ${currencyName(ruleset, a.currency)} not credited.`,
          a.currency === 'xp' ? 'PTS-XP-MAX' : 'PTS-CXP-MAX',
        ),
      );

    let handedOut = cmd.handedOut;
    if (handedOut === undefined) {
      const lines: string[] = [];
      const silver = attendanceSilver(bundle, cmd.paidChoice, sheet.points.xp.earned);
      if (silver > 0) lines.push(`${silver} Silver (${bundle.name})`);
      const perLevel: Record<string, number> = {};
      if (coveredBy !== null && coveredBy !== 'paid') {
        const source = sheet.stats.checkInIncome.find((s) => s.id === `skill:${coveredBy}`);
        const index = source ? upkeepOptionIndex(source) : -1;
        if (source && index >= 0) perLevel[source.id] = index;
      }
      lines.push(...incomeItems(sheet.stats.checkInIncome, { perLevel }).items.map((i) => i.text));
      handedOut = lines;
    }

    builder.add(
      'event.checkedIn',
      {
        event,
        attendance: bundle.id,
        npcHours: cmd.npcHours,
        extras: cmd.extras,
        ...(cmd.paidChoice ? { paidChoice: cmd.paidChoice } : {}),
        awards: credited,
        notCredited,
        upkeep: { dueSilver: due, coveredBy },
        handedOut,
      },
      { eventKey: event.key, note: cmd.note },
    );
    ev.awards = credited;
    ev.notCredited = notCredited;
    return ev;
  },
});

const NAMED_LEVEL_TEXT = {
  basic: 'Basic',
  expert: 'the Expert Technique',
  master: 'the Master Technique',
  grandmaster: 'the Grandmaster Technique',
} as const;

const JOURNAL_KIND_TEXT = {
  spell: 'spellbook',
  recipe: 'crafting journal',
  performance: 'performance record',
  ritual: 'rituals',
} as const;

/** Mist Token back-buys, journal entries, and teachings that name the check-in's event. */
function datedDependents(sheet: Sheet, checkIn: SheetEvent): RuleError[] {
  const errors: RuleError[] = [];
  const at = checkIn.name;
  for (const p of sheet.mtPurchases)
    if (p.forEventKey === checkIn.key)
      errors.push(
        ruleError(
          'CHECK_IN_IN_USE',
          `Cannot void: the Mist Token back-buy ${p.name} is for ${at}; refund it first.`,
          'PTS-MT-MISSED',
        ),
      );
  const { spellbook, craftingJournal, performanceRecord, rituals } = sheet.journals;
  for (const e of [...spellbook, ...craftingJournal, ...performanceRecord, ...rituals])
    if (e.eventKey === checkIn.key)
      errors.push(
        ruleError(
          'CHECK_IN_IN_USE',
          `Cannot void: ${e.name} was added to the ${JOURNAL_KIND_TEXT[e.kind]} at ${at}.`,
          'SKL-NOTES',
        ),
      );
  // The Calling start (with Basic in both its skills) and Calling Techniques are reported with
  // the Calling above.
  const reported = new Set<string>();
  for (const c of [...(sheet.calling ? [sheet.calling] : []), ...sheet.formerCallings]) {
    if (c.startedEventKey === checkIn.key) for (const id of c.skillIds) reported.add(`${id}:basic`);
    for (const t of c.techniqueEvents) reported.add(`${t.skillId}:${t.technique}`);
  }
  for (const s of sheet.skills)
    for (const t of s.teaching) {
      if (t.eventKey !== checkIn.key || reported.has(`${s.skillId}:${t.step}`)) continue;
      errors.push(
        ruleError(
          'CHECK_IN_IN_USE',
          `Cannot void: ${s.name} ${NAMED_LEVEL_TEXT[t.step]} was taught at ${at} (Log of Learning).`,
          'SKL-LOG',
        ),
      );
    }
  return errors;
}

export const VoidCheckInCommand = z.object({
  type: z.literal('voidCheckIn'),
  /** The event.checkedIn action to void. */
  checkInActionId: IdSchema,
  reason: OptionalText,
  note: OptionalText,
});
export type VoidCheckInCommand = z.input<typeof VoidCheckInCommand>;

export const voidCheckIn = defineCommand<z.output<typeof VoidCheckInCommand>>({
  type: 'voidCheckIn',
  schema: VoidCheckInCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const RULE = 'EVT-CHECKIN';
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

    // Points from it already spent.
    const removed = new Map<LedgerCurrency, number>();
    for (const a of checkIn.awards)
      removed.set(a.currency, (removed.get(a.currency) ?? 0) + a.amount);
    for (const [currency, amount] of removed) {
      const left = available(sheet, currency);
      if (left - amount >= 0) continue;
      const name = currencyName(ruleset, currency);
      ev.errors.push(
        ruleError(
          'CHECK_IN_POINTS_SPENT',
          `Cannot void: it takes back ${amount} ${name}, but only ${left} ${name} is unspent; refund what it paid for first.`,
          RULE,
        ),
      );
    }

    // The Calling depends on it.
    const callings = [...(sheet.calling ? [sheet.calling] : []), ...sheet.formerCallings];
    for (const c of callings) {
      if (c.startedEventKey === checkIn.key)
        ev.errors.push(
          ruleError(
            'CHECK_IN_IN_USE',
            `Cannot void: ${c.name} was started at ${checkIn.name}.`,
            'CALL-ELIGIBLE',
          ),
        );
      for (const t of c.techniqueEvents)
        if (t.eventKey === checkIn.key)
          ev.errors.push(
            ruleError(
              'CHECK_IN_IN_USE',
              `Cannot void: a ${c.name} Technique was learned at ${checkIn.name}.`,
              'CALL-TECH',
            ),
          );
      const needed = ruleset.ruleset.calling.minFullEvents;
      if (c.startedEventKey !== null && c.startedEventKey !== checkIn.key) {
        const before = fullEventsBefore(sheet.events, c.startedEventKey);
        const without = fullEventsBefore(
          sheet.events.filter((e) => e.key !== checkIn.key),
          c.startedEventKey,
        );
        if (before >= needed && without < needed)
          ev.errors.push(
            ruleError(
              'CHECK_IN_IN_USE',
              `Cannot void: ${c.name} needed ${plural(needed, 'full event')} before it started; without ${checkIn.name} there would be ${without}.`,
              'CALL-ELIGIBLE',
            ),
          );
      }
    }
    ev.errors.push(...datedDependents(sheet, checkIn));
    if (checkIn.handedOut.length > 0)
      ev.notices.push(
        notice(
          'HANDED_OUT_STAYS',
          'Items handed out at that check-in are not taken back by the void; collect them by hand.',
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
