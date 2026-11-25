import { describe, expect, it } from 'vitest';
import type { PullItem } from '../../engine/index.ts';
import type { StoredCharacter } from '../../engine/model.ts';
import { mira, miraWithNote, tom } from '../test/fixtures.ts';
import { ash } from '../test/veteran.ts';
import { newRequest, shownStatus, sheetOf } from './requests.ts';
import { pullTotals } from './registrations.ts';
import { charactersToSave, planRestore } from './restore.ts';
import { summarizeCharacter, UNNAMED_CHARACTER } from './summary.ts';

describe('summarizeCharacter', () => {
  it('summarizes through the engine: name, player, race, Calling, XP available, events', () => {
    expect(summarizeCharacter(mira())).toEqual({
      id: mira().id,
      characterName: 'Mira Voss',
      playerName: 'Sam Hollis',
      raceName: 'Elf',
      callingName: '',
      xpAvailable: 85,
      events: 0,
      retired: false,
    });
    expect(summarizeCharacter(ash())).toMatchObject({
      characterName: 'Ash Merrow',
      raceName: 'Human',
      callingName: 'The Protector',
      xpAvailable: 380,
      events: 6,
    });
  });

  it('falls back when the payload is missing, or the season is unknown', () => {
    const odd: StoredCharacter = { ...tom(), actions: [] };
    expect(summarizeCharacter(odd)).toMatchObject({
      characterName: UNNAMED_CHARACTER,
      playerName: '',
      raceName: '',
      xpAvailable: 0,
    });
    // A season this build lacks: the build's own season reads the names.
    const unknown: StoredCharacter = { ...tom(), rulesetId: 'some-other-1.0' };
    expect(summarizeCharacter(unknown)).toMatchObject({ characterName: 'Old Tom', events: 1 });
  });
});

describe('learning requests', () => {
  it('builds a request for one step, trimmed, with a fresh id', () => {
    const request = newRequest(
      {
        characterId: 'c1',
        skillId: 'toughness',
        step: { technique: 'expert' },
        teacher: '  Old Jory ',
        note: ' At the spring game. ',
      },
      () => new Date('2026-06-01T12:00:00.000Z'),
    );
    expect(request).toMatchObject({
      characterId: 'c1',
      createdAt: '2026-06-01T12:00:00.000Z',
      kind: 'learn-skill',
      status: 'sent',
      skillId: 'toughness',
      step: { technique: 'expert' },
      teacher: 'Old Jory',
      note: 'At the spring game.',
    });
    expect(request.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('shows the decision recorded in the log over the stored status', () => {
    const sheet = sheetOf(ash());
    const decided = newRequest({
      characterId: ash().id,
      skillId: 'deflection',
      step: { level: 3 },
      teacher: 'Captain Dorn',
      note: '',
    });
    expect(shownStatus({ ...decided, id: 'ash-request-1' }, sheet)).toBe('approved');
    expect(shownStatus(decided, sheet)).toBe('sent');
    expect(sheetOf({ ...ash(), rulesetId: 'some-other-1.0' })).toBeUndefined();
  });
});

describe('planRestore', () => {
  it('lists diverged characters as conflicts, saved only when ticked', () => {
    const [first] = mira().actions;
    if (!first) throw new Error('fixture');
    const diverged: StoredCharacter = {
      ...mira(),
      actions: [
        first,
        {
          id: 'other-action',
          seq: 2,
          at: '2026-10-11T10:00:00.000Z',
          actor: { role: 'staff' },
          type: 'profile.updated',
          payload: { notes: 'Other.' },
        },
      ],
    };
    const plan = planRestore([miraWithNote(), tom()], [diverged, tom()]);
    expect(plan.conflicts.map((e) => e.incoming.id)).toEqual([mira().id]);
    expect(plan.unchanged).toHaveLength(1);
    expect(charactersToSave(plan, new Set())).toEqual([]);
    expect(charactersToSave(plan, new Set([mira().id]))).toEqual([diverged]);
    // Only the backup's actions after the shared history are listed for staff.
    expect(plan.conflicts[0]?.addedActions.map((a) => a.id)).toEqual(['other-action']);
    expect(plan.unchanged[0]?.addedActions).toEqual([]);
  });

  it('adds new ones, updates older local copies, and keeps newer local copies', () => {
    expect(planRestore([], [mira()]).added).toHaveLength(1);
    const updated = planRestore([mira()], [miraWithNote()]).updated;
    expect(updated).toHaveLength(1);
    expect(updated[0]?.addedActions.map((a) => a.id)).toEqual(['note-action-2']);
    const newerHere = planRestore([miraWithNote()], [mira()]).newerHere;
    expect(newerHere).toHaveLength(1);
    expect(newerHere[0]?.addedActions).toEqual([]);
  });
});

describe('pullTotals', () => {
  it('adds up coin and components by kind, silver first, then other items by their text', () => {
    const item = (
      what: PullItem['what'],
      qty: number,
      text: string,
      from: PullItem['from'] = 'check-in',
    ): PullItem => ({ from, source: 'x', what, qty, text });
    expect(
      pullTotals([
        item('copper', 10, '10 Copper (Merchanting)'),
        item('silver', 1, '1 Silver (Human innate)'),
        item('basic-component', 2, '2 Basic Components (Harvesting)'),
        item('upkeep', 1, 'Covers 1 Silver of own upkeep (Merchanting)'),
        item('silver', 3, '3 Silver (Full event NPC (paid))', 'attendance'),
        item('item', 2, '2 Basic Components', 'purchase'),
        item('basic-component', 1, '1 Basic Component (Totemic)'),
        item('item', 2, '2 Basic Components', 'purchase'),
        item('trade-item', 1, 'Expert trade item (Merchanting)'),
      ]),
    ).toEqual([
      { label: 'Silver', qty: 4 },
      { label: 'Copper', qty: 10 },
      { label: 'Basic Components', qty: 3 },
      { label: '2 Basic Components', qty: 2 },
      { label: 'Expert trade item', qty: 1 },
    ]);
  });
});
