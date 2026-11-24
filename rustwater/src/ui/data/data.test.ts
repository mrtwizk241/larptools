import { describe, expect, it } from 'vitest';
import type { StoredCharacter } from '../../engine/model.ts';
import { mira, miraWithNote, tom } from '../test/fixtures.ts';
import { charactersToSave, planRestore } from './restore.ts';
import { summarizeCharacter, UNNAMED_CHARACTER } from './summary.ts';

describe('summarizeCharacter', () => {
  it('summarizes through the engine: names, ancestry and subtype, CXP total, retired', () => {
    expect(summarizeCharacter(mira())).toEqual({
      id: mira().id,
      characterName: 'Mira Voss',
      playerName: 'Sam Hollis',
      ancestryName: 'Elf',
      subtypeName: 'Windwalker',
      cxpTotal: 250,
      retired: false,
    });
  });

  it('falls back when the payload is missing', () => {
    const odd: StoredCharacter = { ...tom(), actions: [] };
    expect(summarizeCharacter(odd)).toMatchObject({
      characterName: UNNAMED_CHARACTER,
      playerName: '',
      ancestryName: '',
    });
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
  it('adds up pull items by kind, rarity, and type, Bits first', async () => {
    const { pullTotals } = await import('./registrations.ts');
    const item = (
      what: 'bits' | 'resource' | 'random-draw',
      qty: number,
      rarity: 'common' | 'uncommon' | 'rare' | null = null,
      type: string | null = null,
    ) => ({
      from: 'check-in' as const,
      source: 'x',
      qty,
      what,
      rarity,
      type,
      text: '',
    });
    const names = {
      rarity: (id: string) => id[0]!.toUpperCase() + id.slice(1),
      type: (id: string) => id[0]!.toUpperCase() + id.slice(1),
    };
    expect(
      pullTotals(
        [
          item('resource', 2, 'common', null),
          item('bits', 10),
          item('resource', 1, 'common', 'scrap'),
          item('resource', 3, 'common', null),
          item('random-draw', 2),
          item('bits', 5),
          item('resource', 1, 'rare', 'scrap'),
        ],
        names,
      ),
    ).toEqual([
      { label: 'Bits', qty: 15 },
      { label: 'Common Scrap', qty: 1 },
      { label: 'Rare Scrap', qty: 1 },
      { label: 'Random Common resources', qty: 5 },
      { label: 'Random draws (resource or consumable)', qty: 2 },
    ]);
  });
});
