// Per-action payload checks against the Sylvaris engine schemas (payloads.ts).
import { describe, expect, it } from 'vitest';
import { SUPPORTED_ACTION_TYPES } from '../engine/index.ts';
import { ACTION_TYPES, type Action } from '../engine/model.ts';
import { buildAsh } from '../ui/test/sampleCharacters.ts';
import { checkActionPayloads, parseActionPayload } from './payloads.ts';

function action(type: Action['type'], payload: unknown, seq = 1): Action {
  return {
    id: `act-${seq}`,
    seq,
    at: '2026-05-16T10:00:00.000Z',
    actor: { role: 'staff' },
    type,
    payload,
  };
}

describe('Sylvaris action payloads', () => {
  it('has a payload schema for every action type in the model', () => {
    expect([...SUPPORTED_ACTION_TYPES].sort()).toEqual([...ACTION_TYPES].sort());
  });

  it('accepts every action of a veteran built through the engine, unchanged', () => {
    const { actions } = buildAsh();
    const types = new Set(actions.map((a) => a.type));
    for (const t of ['skill.learned', 'journal.added', 'mt.spent', 'calling.started'] as const)
      expect(types.has(t)).toBe(true);
    const result = checkActionPayloads(actions);
    expect(result.errors).toEqual([]);
    expect(result.actions).toEqual(actions);
  });

  it('strips keys the schema does not know (older shapes, junk) and trims strings', () => {
    const learned = action('skill.learned', {
      skillId: 'toughness',
      step: { level: 1 },
      currency: 'xp',
      cost: 5,
      teacher: '  Old Jory ',
      atCreation: false,
      part: 'basic',
      toLevel: 1,
    });
    expect(parseActionPayload(learned)).toEqual({
      payload: {
        skillId: 'toughness',
        step: { level: 1 },
        currency: 'xp',
        cost: 5,
        teacher: 'Old Jory',
        atCreation: false,
      },
    });
  });

  it('keeps the concept and backstory of character.created, and accepts older payloads without them', () => {
    const base = {
      characterName: 'Wren Ashby',
      playerName: 'Sam Reed',
      raceId: 'human',
      ageCategory: 2,
      startingXp: 150,
    };
    expect(
      parseActionPayload(
        action('character.created', { ...base, concept: 'Pilot', backstory: ' River folk. ' }),
      )?.payload,
    ).toMatchObject({ concept: 'Pilot', backstory: 'River folk.' });
    const old = parseActionPayload(action('character.created', base));
    expect(old?.payload).toMatchObject(base);
    expect(old?.payload).not.toHaveProperty('backstory');
  });

  it('fills defaults, so a stored journal entry is always pending until tagged', () => {
    expect(
      parseActionPayload(
        action('journal.added', { kind: 'spell', refId: 'fire-dart', source: 'starting' }),
      ),
    ).toEqual({
      payload: { kind: 'spell', refId: 'fire-dart', source: 'starting', status: 'pending' },
    });
  });

  it('rejects bad Sylvaris payloads and action types this app does not know', () => {
    const result = checkActionPayloads([
      action('points.awarded', { currency: 'gold', amount: 5, kind: 'event' }, 1),
      action('skill.learned', { skillId: 'toughness', step: { technique: 'legend' } }, 2),
      action('old.thing' as Action['type'], {}, 3),
    ]);
    expect(result.errors[0]).toMatch(/^actions\[0\], seq 1 \(points\.awarded\): payload\.currency/);
    expect(result.errors.some((e) => e.startsWith('actions[1], seq 2 (skill.learned)'))).toBe(true);
    expect(result.errors.at(-1)).toBe(
      'actions[2], seq 3 (old.thing): this version of the app cannot read this action type.',
    );
  });
});
