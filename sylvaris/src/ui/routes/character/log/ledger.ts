// Ledger rows grouped for display: one entry per action, ledger kind, and event, with the amount
// and the running total after it for each currency it touches, plus any XP or CXP the earned cap
// kept from being credited.
import type {
  Award,
  EventCheckedInPayload,
  LedgerCurrency,
  LedgerRow,
  PointsAwardedPayload,
} from '../../../../engine/index.ts';
import type { Action } from '../../../../engine/model.ts';
import { readPayload } from '../../../lib/describeAction.ts';

export interface LedgerEntry {
  /** Stable React key. */
  key: string;
  actionId: string;
  /** Main date: the game event's date when the entry belongs to one, else the recorded time. */
  date: string;
  /** Time the action was recorded (ISO). */
  recordedAt: string;
  /** True when `date` is the event's date. */
  eventDated: boolean;
  kind: string;
  eventKey: string | null;
  note: string | null;
  amounts: Partial<Record<LedgerCurrency, number>>;
  /**
   * Running total of each currency in `amounts`, after this entry, counted in the displayed
   * order (oldest shown first), so totals climb up the list as shown. The newest total equals
   * the log's final total.
   */
  totals: Partial<Record<LedgerCurrency, number>>;
  /** XP or CXP the earned cap kept from being credited by this action. */
  notCredited: Award[];
}

/** Calendar day (YYYY-MM-DD) of an ISO date or date-time, in local time. */
function dayOf(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Amounts not credited because of the XP or CXP earned cap, by action id: from check-ins (their
 * `notCredited`) and point awards (asked for more than was credited).
 */
export function notCreditedByAction(actions: readonly Action[]): Map<string, Award[]> {
  const out = new Map<string, Award[]>();
  for (const action of actions) {
    if (action.type === 'event.checkedIn') {
      const p = readPayload(action) as EventCheckedInPayload | null;
      const list = (p?.notCredited ?? []).filter((a) => a.amount > 0);
      if (list.length > 0)
        out.set(
          action.id,
          list.map((a) => ({ ...a })),
        );
    } else if (action.type === 'points.awarded') {
      const p = readPayload(action) as PointsAwardedPayload | null;
      if (p && p.requested !== undefined && p.requested > p.amount)
        out.set(action.id, [
          { currency: p.currency, amount: p.requested - p.amount, kind: p.kind },
        ]);
    }
  }
  return out;
}

/**
 * Groups the sheet ledger, newest first. Rows with amount 0 are skipped. Entries for a game event
 * with a known date (from `eventDates`, by event key) use that date; the rest use the recorded
 * date. Entries sort by that day, newest first; entries on the same day keep log order, newest
 * first. Running totals follow that displayed order, so an event dated before the character was
 * created (a sheet import) counts before the starting points. Amounts the cap kept back (from
 * {@link notCreditedByAction}) go on the entry of the same action and kind, else the first entry
 * of the action.
 */
export function ledgerEntries(
  rows: readonly LedgerRow[],
  eventDates: ReadonlyMap<string, string> = new Map(),
  notCredited: ReadonlyMap<string, readonly Award[]> = new Map(),
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  const byKey = new Map<string, LedgerEntry>();
  for (const row of rows) {
    if (row.amount === 0) continue;
    const key = `${row.actionId}|${row.kind}|${row.eventKey ?? ''}`;
    let entry = byKey.get(key);
    if (!entry) {
      const eventDate = row.eventKey === null ? undefined : eventDates.get(row.eventKey);
      entry = {
        key,
        actionId: row.actionId,
        date: eventDate ?? row.date,
        recordedAt: row.date,
        eventDated: eventDate !== undefined,
        kind: row.kind,
        eventKey: row.eventKey,
        note: row.note,
        amounts: {},
        totals: {},
        notCredited: [],
      };
      byKey.set(key, entry);
      entries.push(entry);
    }
    entry.amounts[row.currency] = (entry.amounts[row.currency] ?? 0) + row.amount;
    if (!entry.note && row.note) entry.note = row.note;
  }
  for (const [actionId, list] of notCredited) {
    const mine = entries.filter((e) => e.actionId === actionId);
    for (const award of list) {
      const target = mine.find((e) => e.kind === award.kind) ?? mine[0];
      target?.notCredited.push({ ...award });
    }
  }
  const shown = entries
    .reverse()
    .map((entry, order) => ({ entry, order, day: dayOf(entry.date) }))
    .sort((a, b) => b.day.localeCompare(a.day) || a.order - b.order)
    .map((x) => x.entry);
  const running: Partial<Record<LedgerCurrency, number>> = {};
  for (let i = shown.length - 1; i >= 0; i -= 1) {
    const entry = shown[i];
    if (!entry) continue;
    for (const [currency, amount] of Object.entries(entry.amounts) as [LedgerCurrency, number][]) {
      const total = (running[currency] ?? 0) + amount;
      running[currency] = total;
      entry.totals[currency] = total;
    }
  }
  return shown;
}

/** True when the entry has an amount, or an amount not credited, in `currency`. */
export function entryHasCurrency(entry: LedgerEntry, currency: LedgerCurrency): boolean {
  return (
    entry.amounts[currency] !== undefined || entry.notCredited.some((a) => a.currency === currency)
  );
}
