// Why a check-in cannot be voided, in plain words (Log "Correct this" and the Event page Undo).
// The engine names most dependents (Calling start, Techniques, back-buys, journal entries,
// teachings, all with the event). For points already spent it only gives the numbers, so this
// adds what spent them and when, from the character's ledger.
import type { Ruleset, Sheet } from '../../../engine/index.ts';
import type { Action } from '../../../engine/model.ts';
import { actionLookup, describeAction, readPayload } from '../../lib/describeAction.ts';
import { amountText, dateText } from '../../lib/names.ts';

/** How many spends to list per currency before "and N more". */
const MAX_LISTED = 4;

interface ErrorLike {
  readonly code: string;
  readonly message: string;
}

/**
 * The messages to show when voiding `checkInActionId` is blocked: the engine's messages, with
 * each "points already spent" one replaced by a sentence naming the entries that spent them.
 */
export function voidBlockReasons(
  ruleset: Ruleset,
  actions: readonly Action[],
  sheet: Sheet,
  checkInActionId: string,
  errors: readonly ErrorLike[],
): string[] {
  const others = errors.filter((e) => e.code !== 'CHECK_IN_POINTS_SPENT').map((e) => e.message);
  if (others.length === errors.length) return unique(others);
  const checkIn = sheet.events.find((e) => e.actionId === checkInActionId);
  if (!checkIn) return unique(errors.map((e) => e.message));

  const lookup = actionLookup(actions);
  const index = new Map(actions.map((a, i) => [a.id, i]));
  const start = index.get(checkInActionId) ?? -1;
  /** Entries after the check-in that spent `currency`, newest first, with the amount. */
  const spendsOf = (currency: string): { actionId: string; amount: number; at: string }[] => {
    const byAction = new Map<string, { actionId: string; amount: number; at: string }>();
    const add = (actionId: string, amount: number, at: string) => {
      if (amount <= 0 || (index.get(actionId) ?? -1) <= start) return;
      const found = byAction.get(actionId);
      if (found) found.amount += amount;
      else byAction.set(actionId, { actionId, amount, at });
    };
    for (const l of sheet.learningLog) if (l.currency === currency) add(l.actionId, l.cost, l.at);
    for (const r of sheet.ledger) if (r.currency === currency) add(r.actionId, -r.amount, r.date);
    if (currency === 'axp')
      for (const a of actions) {
        const p = readPayload(a) as { axpCost?: unknown } | null;
        if (a.type.startsWith('artifact.') && typeof p?.axpCost === 'number')
          add(a.id, p.axpCost, a.at);
      }
    return [...byAction.values()].sort(
      (a, b) => (index.get(b.actionId) ?? 0) - (index.get(a.actionId) ?? 0),
    );
  };
  const taken = new Map<string, number>();
  for (const a of checkIn.awards) taken.set(a.currency, (taken.get(a.currency) ?? 0) + a.amount);

  const spent: string[] = [];
  for (const [currency, amount] of taken) {
    const points = sheet.points[currency as keyof Sheet['points']] as
      { available?: number; balance?: number } | undefined;
    const left = points?.available ?? points?.balance ?? 0;
    if (left - amount >= 0) continue;
    const spends = spendsOf(currency);
    const named = spends.slice(0, MAX_LISTED).map((s) => {
      const action = lookup.get(s.actionId);
      const what = action
        ? describeAction(ruleset, action, lookup).summary.replace(/\.$/, '')
        : 'A log entry';
      return `${what} (${amountText(ruleset, currency, s.amount)}, ${dateText(s.at)})`;
    });
    const more = spends.length - named.length;
    const list =
      named.length > 0
        ? ` Spent since: ${named.join('; ')}${more > 0 ? `; and ${more} more` : ''}.`
        : '';
    spent.push(
      `Cannot void the check-in to ${checkIn.name} (${dateText(checkIn.date)}): it takes back ${amountText(ruleset, currency, amount)}, but only ${amountText(ruleset, currency, left)} is unspent. Refund or correct what spent it first.${list}`,
    );
  }
  return unique([...spent, ...others]);
}

function unique(messages: readonly string[]): string[] {
  return [...new Set(messages)];
}
