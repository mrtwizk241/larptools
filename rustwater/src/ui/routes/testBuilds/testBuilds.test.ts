import { describe, expect, it } from 'vitest';
import type { CharacterEntry, CharacterKind, CharacterStatus } from '../../../api/contract.ts';
import { deriveSheet, loadRuleset, plan, type Ruleset } from '../../../engine/index.ts';
import { BASE_CHARACTER, harness } from '../../../engine/testkit.ts';
import {
  copyableEntries,
  eventsEstimateText,
  overspendText,
  parsePointsChange,
  pointsChangeCommand,
  pointsChangeText,
  rosterSections,
  TEST_BUILD_CURRENCIES,
} from './testBuilds.ts';

const AT = '2026-05-16T12:00:00.000Z';

function entry(
  id: string,
  kind: CharacterKind,
  status: CharacterStatus = 'active',
  retired = false,
): CharacterEntry {
  const h = harness();
  h.run({ ...BASE_CHARACTER, characterName: `Sample ${id}` });
  if (retired) h.run({ type: 'retireCharacter', reason: 'Moved on' });
  return {
    character: {
      id,
      schemaVersion: 1,
      rulesetId: '2026-2.0',
      createdAt: AT,
      updatedAt: AT,
      actions: h.actions,
    },
    meta: {
      id,
      kind,
      status,
      ownerId: 'player-1',
      ownerName: 'Sample Player',
      ownerEmail: 'player@example.test',
      submittedAt: null,
      reviewNote: null,
      reviewedBy: null,
      reviewedAt: null,
      draft: null,
    },
  };
}

const ids = (list: CharacterEntry[]) => list.map((e) => e.character.id);

describe('rosterSections', () => {
  it('splits live characters, test builds, and characters waiting for staff, in order', () => {
    const sections = rosterSections([
      entry('live-a', 'live'),
      entry('test-a', 'test'),
      entry('sent', 'live', 'pending'),
      entry('back', 'live', 'rejected'),
      entry('live-b', 'live'),
      entry('test-b', 'test'),
    ]);
    expect(ids(sections.live)).toEqual(['live-a', 'live-b']);
    expect(ids(sections.test)).toEqual(['test-a', 'test-b']);
    expect(ids(sections.waiting)).toEqual(['sent', 'back']);
  });

  it('never puts a test build among the live characters', () => {
    const sections = rosterSections([entry('only-test', 'test')]);
    expect(sections.live).toEqual([]);
    expect(ids(sections.test)).toEqual(['only-test']);
  });
});

describe('copyableEntries', () => {
  const known = (id: string): Ruleset | undefined =>
    id === '2026-2.0' ? loadRuleset(id) : undefined;

  it('offers approved live characters that are not retired', () => {
    const list = copyableEntries(
      [
        entry('live', 'live'),
        entry('retired', 'live', 'active', true),
        entry('waiting', 'live', 'pending'),
        entry('test', 'test'),
      ],
      known,
    );
    expect(ids(list)).toEqual(['live']);
  });

  it('leaves out characters from a season this app does not have', () => {
    expect(copyableEntries([entry('live', 'live')], () => undefined)).toEqual([]);
  });
});

describe('Add or remove points', () => {
  it('reads signed whole numbers other than 0', () => {
    expect(parsePointsChange('50')).toBe(50);
    expect(parsePointsChange(' +25 ')).toBe(25);
    expect(parsePointsChange('-20')).toBe(-20);
    for (const bad of ['', '0', '-0', '1.5', 'ten', '--3', '99999999'])
      expect(parsePointsChange(bad)).toBeNull();
  });

  it('is a points adjustment the owner of a test build may run, and a live player may not', () => {
    const h = harness();
    h.run(BASE_CHARACTER);
    const ruleset = loadRuleset('2026-2.0');
    const sheet = deriveSheet(ruleset, h.actions);
    const ctx = {
      actor: { role: 'player' as const, name: 'Sample Player' },
      now: () => AT,
      newId: () => 'new-action',
      nextSeq: sheet.lastSeq + 1,
    };
    for (const [currency, amount] of [
      ['cxp', -30],
      ['pxp', 50],
      ['pxp', -20],
    ] as const) {
      const test = plan(ruleset, sheet, pointsChangeCommand(currency, amount), ctx, {
        testBuild: true,
      });
      expect(test.ok).toBe(true);
      if (test.ok)
        expect(test.actions[0]).toMatchObject({
          type: 'points.adjusted',
          payload: { currency, amount, reason: 'Test build' },
        });
      const live = plan(ruleset, sheet, pointsChangeCommand(currency, -amount), ctx);
      expect(live.ok).toBe(false);
    }
  });

  it('offers CXP first, then PXP, and names the currency in the toast', () => {
    expect(TEST_BUILD_CURRENCIES.map((c) => c.id)).toEqual(['cxp', 'pxp']);
    expect(pointsChangeCommand('pxp', 50)).toEqual({
      type: 'adjustPoints',
      currency: 'pxp',
      amount: 50,
      reason: 'Test build',
    });
    expect(pointsChangeText('cxp', 50)).toBe('Added 50 CXP.');
    expect(pointsChangeText('cxp', -20)).toBe('Removed 20 CXP.');
    expect(pointsChangeText('pxp', 50)).toBe('Added 50 PXP.');
    expect(pointsChangeText('pxp', -20)).toBe('Removed 20 PXP.');
  });
});

describe('overspendText', () => {
  const ruleset = loadRuleset();

  it('CXP: the events it takes, at the event CXP each', () => {
    expect(overspendText(ruleset, 'cxp', 25)).toBe(
      'You have spent 25 more CXP than you have. Earning it takes 1 event (75 CXP an event).',
    );
    expect(overspendText(ruleset, 'cxp', 160)).toContain('takes 3 events');
  });

  it('PXP: the hours of NPC time, or the Shinies spent on PXP', () => {
    expect(overspendText(ruleset, 'pxp', 12)).toBe(
      'You have spent 12 more PXP than you have. Earning it takes 12 hours of NPCing ' +
        '(1 PXP an hour, up to 5 hours an event) or 1,200 Shinies spent on PXP ' +
        '(100 Shinies for 1 PXP, 1 purchase an event).',
    );
    expect(overspendText(ruleset, 'pxp', 1)).toContain('1 hour of NPCing');
  });
});

describe('eventsEstimateText', () => {
  const ruleset = loadRuleset();
  function over(cxp: number, pxp: number) {
    const h = harness();
    h.run({ ...BASE_CHARACTER });
    const p = h.sheet().points;
    h.run({ type: 'adjustPoints', currency: 'cxp', amount: -(p.cxp.available + cxp), reason: 'x' });
    if (pxp > 0)
      h.run({
        type: 'adjustPoints',
        currency: 'pxp',
        amount: -(p.pxp.available + pxp),
        reason: 'x',
      });
    return h.sheet();
  }

  it('is null when nothing is overspent', () => {
    expect(eventsEstimateText(ruleset, over(0, 0))).toBeNull();
  });

  it('CXP: events at the event CXP', () => {
    expect(eventsEstimateText(ruleset, over(5, 0))).toBe(
      'Over: about 1 more event would earn this build (75 CXP an event).',
    );
  });

  it('both: the currency that needs the most events, with both rates', () => {
    expect(eventsEstimateText(ruleset, over(5, 7))).toBe(
      'Over: about 2 more events would earn this build (75 CXP an event; up to 6 PXP an event ' +
        'from NPCing and Shinies).',
    );
  });
});
