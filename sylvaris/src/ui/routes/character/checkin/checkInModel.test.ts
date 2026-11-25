import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset, preview, upkeepFor } from '../../../../engine/index.ts';
import { ash } from '../../../test/veteran.ts';
import { mira } from '../../../test/fixtures.ts';
import {
  attendanceText,
  backPath,
  defaultCheckInEvent,
  defaultCover,
  extraText,
  handedOutTexts,
  handOut,
  isUpcoming,
  upkeepLine,
  withoutPaidChoice,
} from './checkInModel.ts';

const ruleset = loadRuleset();
const EVENT = { key: '2026-10-17-frost-court', name: 'Frost Court', date: '2026-10-17' };

describe('check-in texts', () => {
  it('describes extras and attendance from the ruleset', () => {
    expect(extraText(ruleset, 'marshal-medic')).toBe('+50 Mist Tokens');
    expect(extraText(ruleset, 'check-in-assist')).toBe('counts as 2 hours of NPC time');
    expect(attendanceText(ruleset, 'player')).toBe('60 XP, 5 CXP, 1 AXP');
    expect(attendanceText(ruleset, 'gm-staff')).toContain('5 Silver');
    expect(attendanceText(ruleset, 'gm-staff')).toMatch(/^60 XP \+ 10 XP staff bonus, 10 CXP/);
    expect(attendanceText(ruleset, 'npc-unpaid')).toContain('NPC time at its maximum');
  });

  it('only returns plain in-app paths', () => {
    expect(backPath('/events/x')).toBe('/events/x');
    expect(backPath('//evil.test')).toBeNull();
    expect(backPath('https://evil.test')).toBeNull();
    expect(backPath(null)).toBeNull();
  });

  it('drops the paid NPC choice', () => {
    expect(withoutPaidChoice({ paidChoice: 'silver', upkeep: 'paid' })).toEqual({ upkeep: 'paid' });
  });
});

describe('check-in preview', () => {
  it('a new character owes no upkeep at the first event', () => {
    const sheet = deriveSheet(ruleset, mira().actions);
    const upkeep = upkeepFor(ruleset, sheet, EVENT.key);
    expect(upkeep.due).toBe(false);
    expect(upkeepLine(ruleset, upkeep, null)).toBe('No upkeep: first event.');
  });

  it('a veteran owes upkeep, paid by default, and a Human gets silver at check-in', () => {
    const sheet = deriveSheet(ruleset, ash().actions);
    const upkeep = upkeepFor(ruleset, sheet, EVENT.key);
    expect(upkeep.due).toBe(true);
    expect(upkeepLine(ruleset, upkeep, defaultCover(upkeep))).toMatch(
      /^Upkeep due: 1 Silver, paid at the desk\.$/,
    );
    const out = handOut(ruleset, sheet, 'player', undefined, {});
    expect(handedOutTexts(out.items).join(' ')).toMatch(/Silver/);
    // GM-level staff adds the bundle's silver first.
    const staff = handOut(ruleset, sheet, 'gm-staff', undefined, {});
    expect(staff.items[0]?.text).toBe('5 Silver (Full event GM-level staff)');
  });

  it('an NPC with hours sees every award, and the XP cap keeps back the excess', () => {
    const sheet = deriveSheet(ruleset, mira().actions);
    const result = preview(ruleset, sheet, {
      type: 'checkIn',
      event: EVENT,
      attendance: 'npc-unpaid',
      npcHours: 0,
      extras: ['sunday-cleanup'],
    });
    expect(result.allowed).toBe(true);
    expect(result.awards).toEqual(
      expect.arrayContaining([
        { currency: 'xp', amount: 60, kind: 'event' },
        { currency: 'mt', amount: 500, kind: 'npc-time' },
        { currency: 'mt', amount: 100, kind: 'extra' },
      ]),
    );
  });
});

// Acceptance AC-2: the form opens on today's event, or the latest past one, never a future one.
describe('default check-in event', () => {
  const events = [
    { key: '2026-11-21-frost-vigil', date: '2026-11-21' },
    { key: '2026-11-08-longest-night', date: '2026-11-08' },
    { key: '2026-11-07-hearthfire', date: '2026-11-07' },
    { key: '2026-10-17-frost-court', date: '2026-10-17' },
  ];

  it('picks today, else the newest past event not attended, never a future one', () => {
    expect(defaultCheckInEvent(events, new Set(), '2026-11-08')).toBe('2026-11-08-longest-night');
    expect(defaultCheckInEvent(events, new Set(), '2026-11-10')).toBe('2026-11-08-longest-night');
    expect(defaultCheckInEvent(events, new Set(['2026-11-08-longest-night']), '2026-11-08')).toBe(
      '2026-11-07-hearthfire',
    );
    expect(defaultCheckInEvent(events, new Set(), '2026-01-01')).toBeUndefined();
    expect(defaultCheckInEvent(events, new Set(), '2026-11-08', '2026-11-08-longest-night')).toBe(
      '2026-11-07-hearthfire',
    );
  });

  it('marks events after today as upcoming', () => {
    expect(isUpcoming({ date: '2026-11-21' }, '2026-11-08')).toBe(true);
    expect(isUpcoming({ date: '2026-11-08' }, '2026-11-08')).toBe(false);
  });
});
