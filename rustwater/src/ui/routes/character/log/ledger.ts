// Ledger rows grouped for display: one entry per action, ledger kind, and event, with the amount
// and the running total after it for each currency it touches.
import type { LedgerCurrency, LedgerRow } from '../../../../engine/index.ts';

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
 * Groups the sheet ledger, newest first. Rows with amount 0 are skipped. Entries for a game event
 * with a known date (from `eventDates`, by event key) use that date; the rest use the recorded
 * date. Entries sort by that day, newest first; entries on the same day keep log order, newest
 * first. Running totals follow that displayed order, so an event dated before the character was
 * created (a sheet import) counts before the starting points.
 */
export function ledgerEntries(
  rows: readonly LedgerRow[],
  eventDates: ReadonlyMap<string, string> = new Map(),
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
      };
      byKey.set(key, entry);
      entries.push(entry);
    }
    entry.amounts[row.currency] = (entry.amounts[row.currency] ?? 0) + row.amount;
    if (!entry.note && row.note) entry.note = row.note;
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
