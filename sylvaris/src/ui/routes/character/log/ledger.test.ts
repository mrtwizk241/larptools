import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset, type LedgerRow } from '../../../../engine/index.ts';
import { ash, ashAfter } from '../../../test/veteran.ts';
import { entryHasCurrency, ledgerEntries, notCreditedByAction } from './ledger.ts';

function row(seq: number, date: string, eventKey: string | null, amount = 10): LedgerRow {
  return {
    actionId: `a${seq}`,
    seq,
    date,
    currency: 'xp',
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
    expect(entries[0]?.eventDated).toBe(false);
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

  it('counts running totals in the displayed order, newest total equal to the final total', () => {
    const rows: LedgerRow[] = [
      { ...row(1, '2026-11-07T09:00:00.000Z', null, 150), kind: 'starting' },
      { ...row(2, '2026-11-07T09:05:00.000Z', 'ember', 60) },
      { ...row(3, '2026-11-07T09:06:00.000Z', 'harvest', 60) },
      { ...row(4, '2026-11-07T09:10:00.000Z', null, 10), kind: 'gm-award' },
      { ...row(5, '2026-11-07T09:06:00.000Z', 'harvest', 1), actionId: 'a3', currency: 'axp' },
    ];
    const entries = ledgerEntries(
      rows,
      new Map([
        ['ember', '2026-05-09'],
        ['harvest', '2026-09-19'],
      ]),
    );
    expect(entries.map((e) => e.actionId)).toEqual(['a4', 'a1', 'a3', 'a2']);
    expect(entries.map((e) => e.totals.xp)).toEqual([280, 270, 120, 60]);
    expect(entries[2]?.totals.axp).toBe(1);
  });

  it('puts amounts the cap kept back on the matching entry', () => {
    const rows = [row(1, '2026-04-18T09:00:00.000Z', 'spring', 40)];
    const entries = ledgerEntries(
      rows,
      new Map(),
      new Map([
        [
          'a1',
          [
            { currency: 'xp', amount: 20, kind: 'event' },
            { currency: 'cxp', amount: 5, kind: 'npc-time' },
          ],
        ],
      ]),
    );
    expect(entries[0]?.notCredited).toEqual([
      { currency: 'xp', amount: 20, kind: 'event' },
      { currency: 'cxp', amount: 5, kind: 'npc-time' },
    ]);
    expect(entries[0] && entryHasCurrency(entries[0], 'cxp')).toBe(true);
    expect(entries[0] && entryHasCurrency(entries[0], 'mt')).toBe(false);
  });
});

describe('notCreditedByAction', () => {
  it('finds a capped award and leaves uncapped ones out', () => {
    const ruleset = loadRuleset();
    const room = deriveSheet(ruleset, ash().actions).points.xp.capRemaining;
    const character = ashAfter([
      { type: 'awardPoints', currency: 'xp', amount: 5, kind: 'gm-award' },
      { type: 'awardPoints', currency: 'xp', amount: room, kind: 'gm-award' },
    ]);
    const map = notCreditedByAction(character.actions);
    expect([...map.values()]).toEqual([[{ currency: 'xp', amount: 5, kind: 'gm-award' }]]);
  });

  it('reads the real ledger of a veteran with running totals equal to the sheet', () => {
    const ruleset = loadRuleset();
    const sheet = deriveSheet(ruleset, ash().actions);
    const entries = ledgerEntries(sheet.ledger);
    const newestXp = entries.find((e) => e.totals.xp !== undefined)?.totals.xp;
    expect(newestXp).toBe(sheet.points.xp.earned);
    const newestMt = entries.find((e) => e.totals.mt !== undefined)?.totals.mt;
    expect(newestMt).toBe(sheet.points.mt.balance);
  });
});
