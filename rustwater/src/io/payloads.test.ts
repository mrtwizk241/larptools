// Payload checks for the trauma, story note, and age step action types (security audit S-03).
import { describe, expect, it } from 'vitest';
import type { Action } from '../engine/model.ts';
import { checkActionPayloads, parseActionPayload } from './payloads.ts';

function action(seq: number, type: string, payload: unknown): Action {
  return {
    id: `a-${seq}`,
    seq,
    at: '2026-05-16T12:00:00.000Z',
    actor: { role: 'staff' },
    type: type as Action['type'],
    payload,
  };
}

describe('payload checks for traumas, story notes, and age steps', () => {
  it('keeps valid payloads, trims text, and strips unknown keys', () => {
    const { actions, errors } = checkActionPayloads([
      action(1, 'trauma.added', { text: ' Flinches at bells ', extra: 1 }),
      action(2, 'trauma.edited', { traumaId: 'a-1', text: 'Loud bells', fromText: 'Bells', x: 1 }),
      action(3, 'trauma.removed', { traumaId: 'a-1', reason: 'Healed', y: true }),
      action(4, 'storyNote.added', { text: 'Owes the ferryman', z: 'no' }),
      action(5, 'storyNote.edited', { noteId: 'a-4', text: 'Paid' }),
      action(6, 'storyNote.removed', { noteId: 'a-4', other: 2 }),
      action(7, 'profile.updated', { ageStep: 3, junk: 1 }),
      action(8, 'character.created', {
        characterName: 'Mara Quill',
        playerName: 'Sample Player',
        ancestryId: 'human',
        subtypeId: 'human-wastelander',
        extraInfection: 0,
        ageStep: 2,
      }),
    ]);
    expect(errors).toEqual([]);
    expect(actions.map((a) => a.payload)).toEqual([
      { text: 'Flinches at bells' },
      { traumaId: 'a-1', text: 'Loud bells', fromText: 'Bells' },
      { traumaId: 'a-1', reason: 'Healed' },
      { text: 'Owes the ferryman' },
      { noteId: 'a-4', text: 'Paid' },
      { noteId: 'a-4' },
      { ageStep: 3 },
      expect.objectContaining({ ageStep: 2 }),
    ]);
  });

  it('reports invalid payloads', () => {
    const { errors } = checkActionPayloads([
      action(1, 'trauma.added', { text: '' }),
      action(2, 'trauma.removed', { traumaId: 'a-1' }),
      action(3, 'storyNote.edited', { noteId: 'bad id!', text: 'X' }),
      action(4, 'profile.updated', { ageStep: 0 }),
      action(5, 'storyNote.added', { text: 'x'.repeat(5001) }),
    ]);
    expect(errors.map((e) => e.split(':')[0])).toEqual([
      'actions[0], seq 1 (trauma.added)',
      'actions[1], seq 2 (trauma.removed)',
      'actions[2], seq 3 (storyNote.edited)',
      'actions[3], seq 4 (profile.updated)',
      'actions[4], seq 5 (storyNote.added)',
    ]);
    expect(parseActionPayload(action(1, 'trauma.added', { text: 'Ok' }))).toEqual({
      payload: { text: 'Ok' },
    });
  });
});
