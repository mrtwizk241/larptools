import { describe, expect, it } from 'vitest';
import type { LedgerRow } from '../../../../engine/index.ts';
import { ledgerEntries } from './ledger.ts';

function row(seq: number, date: string, eventKey: string | null, amount = 10): LedgerRow {
  return {
    actionId: `a${seq}`,
    seq,
    date,
    currency: 'cxp',
    amount,
    kind: 'event',
    eventKey,
    runningTotal: seq * 10,
    note: null,
  };
}

describe('ledgerEntries', () => {
  it('dates event entries by the event and sorts by that date, newest first', () => {
    const rows = [
      row(1, '2026-03-01T10:00:00.000Z', null),
      row(2, '2026-11-07T10:00:00.000Z', 'spring'),
      row(3, '2026-06-01T10:00:00.000Z', null),
      row(4, '2026-06-02T10:00:00.000Z', 'unknown'),
    ];
    const entries = ledgerEntries(rows, new Map([['spring', '2026-04-18']]));
    expect(entries.map((e) => e.actionId)).toEqual(['a4', 'a3', 'a2', 'a1']);
    const spring = entries[2];
    expect(spring?.date).toBe('2026-04-18');
    expect(spring?.recordedAt).toBe('2026-11-07T10:00:00.000Z');
    expect(spring?.eventDated).toBe(true);
    // An event key with no known date keeps the recorded date.
    expect(entries[0]?.eventDated).toBe(false);
    expect(entries[0]?.date).toBe('2026-06-02T10:00:00.000Z');
  });

  it('keeps log order, newest first, within a day and skips zero rows', () => {
    const rows = [
      row(1, '2026-04-18T09:00:00.000Z', null),
      row(2, '2026-04-18T12:00:00.000Z', 'spring'),
      row(3, '2026-04-18T12:00:00.000Z', null, 0),
    ];
    const entries = ledgerEntries(rows, new Map([['spring', '2026-04-18']]));
    expect(entries.map((e) => e.actionId)).toEqual(['a2', 'a1']);
  });

  it('works without event dates', () => {
    const entries = ledgerEntries([row(1, '2026-04-18T09:00:00.000Z', 'spring')]);
    expect(entries[0]?.eventDated).toBe(false);
  });

  it('counts running totals in the displayed order when events predate creation', () => {
    // A sheet import: the character is created today with 250 starting CXP, then checked in to
    // two earlier events, then given an award today.
    const rows: LedgerRow[] = [
      { ...row(1, '2026-11-07T09:00:00.000Z', null, 250), kind: 'start', runningTotal: 250 },
      { ...row(2, '2026-11-07T09:05:00.000Z', 'ember', 75), runningTotal: 325 },
      { ...row(3, '2026-11-07T09:06:00.000Z', 'harvest', 75), runningTotal: 400 },
      { ...row(4, '2026-11-07T09:10:00.000Z', null, 10), kind: 'other-award', runningTotal: 410 },
      {
        ...row(5, '2026-11-07T09:06:00.000Z', 'harvest', 1),
        actionId: 'a3',
        currency: 'fp',
        kind: 'attendance',
        runningTotal: 1,
      },
    ];
    const entries = ledgerEntries(
      rows,
      new Map([
        ['ember', '2026-05-09'],
        ['harvest', '2026-09-19'],
      ]),
    );
    // Shown newest first: today's award and starting points, then Sep 19, then May 9.
    expect(entries.map((e) => `${e.actionId} ${e.kind}`)).toEqual([
      'a4 other-award',
      'a1 start',
      'a3 attendance',
      'a3 event',
      'a2 event',
    ]);
    // Totals climb from the bottom of the list to the top.
    expect(entries.map((e) => e.totals.cxp)).toEqual([410, 400, undefined, 150, 75]);
    expect(entries[2]?.totals.fp).toBe(1);
    // The newest total is the log's final total.
    expect(entries[0]?.totals.cxp).toBe(410);
  });
});
