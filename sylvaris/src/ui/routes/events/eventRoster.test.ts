import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset, plan, type Command } from '../../../engine/index.ts';
import type { StoredCharacter } from '../../../engine/model.ts';
import { mira, tom } from '../../test/fixtures.ts';
import {
  checkInLink,
  eventRows,
  eventSummary,
  findEvent,
  knownEvents,
  matchesQuery,
  quickCheckIn,
  rosterEntries,
  undoCheckIn,
} from './eventRoster.ts';

const ruleset = loadRuleset();
const FROST = { key: '2026-10-17-frost-court', name: 'Frost Court', date: '2026-10-17' };

function after(character: StoredCharacter, commands: readonly Command[]): StoredCharacter {
  const actions = [...character.actions];
  let n = 0;
  for (const command of commands) {
    const sheet = deriveSheet(ruleset, actions);
    const result = plan(ruleset, sheet, command, {
      actor: { role: 'staff' },
      now: () => '2026-10-17T19:00:00.000Z',
      newId: () => `${character.id}-x${++n}`,
      nextSeq: sheet.lastSeq + 1,
    });
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' '));
    actions.push(...result.actions);
  }
  return { ...character, actions };
}

describe('event roster', () => {
  it('lists known events with counts and finds events known only from check-ins', () => {
    const entries = rosterEntries([mira(), tom()]);
    const events = knownEvents([FROST], entries);
    expect(events.map((e) => e.name)).toEqual(['Frost Court', 'Harvest Moon']);
    expect(events.find((e) => e.name === 'Harvest Moon')?.checkedIn).toBe(1);
    expect(findEvent('2026-09-19-harvest-moon', [], entries)?.name).toBe('Harvest Moon');
    expect(findEvent('nope', [], entries)).toBeUndefined();
  });

  it('quick check-in, then Undo voids it; the summary counts only what still stands', () => {
    const checkedIn = after(mira(), [quickCheckIn(FROST)]);
    let entries = rosterEntries([checkedIn, tom()]);
    let rows = eventRows(entries, FROST.key);
    const miraRow = rows.find((r) => r.entry.summary.characterName === 'Mira Voss');
    expect(miraRow?.attendance).toBe('player');
    expect(eventSummary(entries, FROST.key)).toMatchObject({
      byAttendance: { player: 1 },
      credited: { xp: 60, cxp: 5, axp: 1, mt: 0 },
    });

    const voided = after(checkedIn, [undoCheckIn(miraRow?.checkInActionId ?? '')]);
    entries = rosterEntries([voided, tom()]);
    rows = eventRows(entries, FROST.key);
    expect(rows.every((r) => r.attendance === null)).toBe(true);
    expect(eventSummary(entries, FROST.key)).toMatchObject({
      byAttendance: {},
      credited: { xp: 0, cxp: 0, axp: 0, mt: 0 },
    });
  });

  it('searches by character or player and links to the full check-in', () => {
    const [entry] = rosterEntries([mira()]);
    if (!entry) throw new Error('no entry');
    expect(matchesQuery(entry.summary, 'mira')).toBe(true);
    expect(matchesQuery(entry.summary, 'zzz')).toBe(false);
    expect(checkInLink('abc', FROST.key)).toBe(
      '/c/abc/checkin?event=2026-10-17-frost-court&back=%2Fevents%2F2026-10-17-frost-court',
    );
  });
});
