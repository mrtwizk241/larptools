// Traumas (I-7), age steps (I-9), story notes and knowledges (I-13, I-14).
import { describe, expect, it } from 'vitest';
import { deriveSheet } from '../derive/deriveSheet.ts';
import type { Action } from '../model.ts';
import { ageStepFromYears } from '../rules/age.ts';
import { AT, harness, rs, withCharacter, type Harness } from '../testkit.ts';
import type { PlanResult } from './define.ts';

function codes(result: PlanResult): string[] {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

/** Appends a raw action (an old-style log entry) to the harness. */
function push(
  h: Harness,
  type: string,
  payload: unknown,
  actor: Action['actor'] = { role: 'staff' },
) {
  const action: Action = {
    id: `raw-${h.actions.length + 1}`,
    seq: h.actions.length + 1,
    at: AT,
    actor,
    type: type as Action['type'],
    payload,
  };
  h.actions.push(action);
  return action;
}

const ROLE_ERROR = ['ROLE_NOT_ALLOWED'];

describe('traumas [PLAY-TRAUMA]', () => {
  it('staff add, edit, and remove a trauma; players only read them', () => {
    const h = withCharacter();
    expect(codes(h.plan({ type: 'addTrauma', text: 'Flinches at bells' }, 'player'))).toEqual(
      ROLE_ERROR,
    );
    expect(codes(h.plan({ type: 'addTrauma', text: '  ' }))).toEqual(['TEXT_REQUIRED']);
    const [added] = h.run({ type: 'addTrauma', text: ' Flinches at bells ' });
    expect(added).toMatchObject({ type: 'trauma.added', payload: { text: 'Flinches at bells' } });
    const id = added?.id ?? '';
    h.run({ type: 'addTrauma', text: 'Hums when nervous' });
    expect(h.sheet().traumas).toEqual([
      { id, text: 'Flinches at bells', addedAt: AT },
      { id: h.actions.at(-1)?.id, text: 'Hums when nervous', addedAt: AT },
    ]);

    expect(codes(h.plan({ type: 'editTrauma', traumaId: id, text: 'Flinches at bells' }))).toEqual([
      'NOTHING_CHANGED',
    ]);
    expect(codes(h.plan({ type: 'editTrauma', traumaId: 'nope', text: 'X' }))).toEqual([
      'TRAUMA_NOT_FOUND',
    ]);
    expect(
      codes(h.plan({ type: 'editTrauma', traumaId: id, text: 'Loud bells' }, 'player')),
    ).toEqual(ROLE_ERROR);
    const [edited] = h.run({ type: 'editTrauma', traumaId: id, text: 'Flinches at loud bells' });
    expect(edited?.payload).toEqual({
      traumaId: id,
      text: 'Flinches at loud bells',
      fromText: 'Flinches at bells',
    });
    expect(h.sheet().traumas[0]).toEqual({ id, text: 'Flinches at loud bells', addedAt: AT });

    expect(codes(h.plan({ type: 'removeTrauma', traumaId: id }))).toEqual(['REASON_REQUIRED']);
    expect(
      codes(h.plan({ type: 'removeTrauma', traumaId: id, reason: 'Healed' }, 'player')),
    ).toEqual(ROLE_ERROR);
    const [removed] = h.run({ type: 'removeTrauma', traumaId: id, reason: 'Healed at the Home' });
    expect(removed?.payload).toEqual({
      traumaId: id,
      reason: 'Healed at the Home',
      text: 'Flinches at loud bells',
    });
    expect(h.sheet().traumas.map((t) => t.text)).toEqual(['Hums when nervous']);
    expect(h.sheet().warnings).toEqual([]);
  });

  it('changeInfection records a trauma in the same plan', () => {
    const h = withCharacter();
    const actions = h.run({
      type: 'changeInfection',
      toLevel: 5,
      reason: 'Died and rose',
      cause: 'death-rise',
      trauma: 'Cannot stand the dark',
    });
    expect(actions.map((a) => a.type)).toEqual(['infection.changed', 'trauma.added']);
    expect(actions[1]?.causedBy).toBe(actions[0]?.id);
    const sheet = h.sheet();
    expect(sheet.infection?.current).toBe(5);
    expect(sheet.traumas.map((t) => t.text)).toEqual(['Cannot stand the dark']);
    // Without trauma text only the infection changes.
    expect(h.run({ type: 'changeInfection', toLevel: 4, reason: 'Cured' }).length).toBe(1);
    // A failed infection change records no trauma.
    expect(
      codes(h.plan({ type: 'changeInfection', toLevel: 4, reason: 'Again', trauma: 'X' })),
    ).toEqual(['NOTHING_CHANGED']);
  });

  it('replay warns about edits and removals of unknown traumas', () => {
    const h = withCharacter();
    const bad = push(h, 'trauma.edited', { traumaId: 'missing', text: 'X' });
    const bad2 = push(h, 'trauma.removed', { traumaId: 'missing', reason: 'Gone' });
    push(h, 'trauma.added', { text: '' });
    const warnings = h.sheet().warnings;
    expect(warnings.map((w) => [w.actionId, w.code])).toEqual([
      [bad.id, 'TRAUMA_NOT_FOUND'],
      [bad2.id, 'TRAUMA_NOT_FOUND'],
      [h.actions.at(-1)?.id, 'INVALID_PAYLOAD'],
    ]);
  });

  it('traumas cannot change after retirement', () => {
    const h = withCharacter();
    h.run({ type: 'retireCharacter', reason: 'Moved away' });
    expect(codes(h.plan({ type: 'addTrauma', text: 'X' }))).toEqual(['CHARACTER_RETIRED']);
  });
});

describe('age steps [ANC-AGE]', () => {
  it('a new character starts at step 2 to 10', () => {
    expect(codes(harness().plan({ ...base(), age: 1 }))).toEqual(['AGE_RANGE']);
    expect(codes(harness().plan({ ...base(), age: 11 }))).toEqual(['AGE_RANGE']);
    const h = harness();
    const [created] = h.run({ ...base(), age: 2 });
    expect(created?.payload).toMatchObject({ ageStep: 2 });
    expect(created?.payload).not.toHaveProperty('age');
    expect(h.sheet().profile.age).toBe(2);
    const h10 = harness();
    h10.run({ ...base(), age: 10 });
    expect(h10.sheet().profile.age).toBe(10);
    const none = harness();
    none.run(base());
    expect(none.sheet().profile.age).toBeNull();
  });

  it('updateProfile sets a step 1 to 10 and null clears it', () => {
    const h = withCharacter({ age: 4 });
    expect(codes(h.plan({ type: 'updateProfile', age: 0 }))).toEqual(['AGE_RANGE']);
    expect(codes(h.plan({ type: 'updateProfile', age: 11 }))).toEqual(['AGE_RANGE']);
    expect(codes(h.plan({ type: 'updateProfile', age: 4 }))).toEqual(['NOTHING_CHANGED']);
    const [one] = h.run({ type: 'updateProfile', age: 1 });
    expect(one?.payload).toEqual({ ageStep: 1 });
    expect(h.sheet().profile.age).toBe(1);
    h.run({ type: 'updateProfile', age: null });
    expect(h.sheet().profile.age).toBeNull();
  });

  it('converts old ages in years with the ancestry max age, the same rule as before', () => {
    // Human: max age 100. Elf: 400.
    expect(ageStepFromYears(rs, 'human', 57)).toBe(5);
    expect(ageStepFromYears(rs, 'human', 100)).toBe(10);
    expect(ageStepFromYears(rs, 'elf', 85)).toBe(2);
    // Clamped to 1..10.
    expect(ageStepFromYears(rs, 'human', 5)).toBe(1);
    expect(ageStepFromYears(rs, 'human', 250)).toBe(10);
    // No fixed max age.
    expect(ageStepFromYears(rs, 'aware', 30)).toBeNull();
    expect(ageStepFromYears(rs, 'cryptid', 30)).toBeNull();
    expect(ageStepFromYears(rs, null, 30)).toBeNull();
  });

  it('replays old profile.updated ages in years, and a step wins over years', () => {
    const h = withCharacter();
    push(h, 'profile.updated', { age: 31 });
    expect(h.sheet().profile.age).toBe(3);
    push(h, 'profile.updated', { age: 90, ageStep: 6 });
    expect(h.sheet().profile.age).toBe(6);
    push(h, 'profile.updated', { age: null });
    expect(h.sheet().profile.age).toBeNull();
    expect(h.sheet().warnings).toEqual([]);
  });

  it('leaves the age empty, without a warning, when old years cannot become a step', () => {
    const h = harness();
    push(h, 'character.created', {
      characterName: 'Pell Strand',
      playerName: 'Sample Player',
      ancestryId: 'aware',
      subtypeId: 'aware-personal-memory',
      extraInfection: 0,
      age: 300,
    });
    const sheet = h.sheet();
    expect(sheet.profile.age).toBeNull();
    expect(sheet.warnings).toEqual([]);
  });

  it('rejects out-of-range steps in stored payloads', () => {
    const h = withCharacter();
    push(h, 'profile.updated', { ageStep: 11 });
    expect(h.sheet().warnings.map((w) => w.code)).toEqual(['INVALID_PAYLOAD']);
  });
});

describe('story notes', () => {
  it('staff add, edit, and remove story notes with the author', () => {
    const h = withCharacter();
    expect(codes(h.plan({ type: 'addStoryNote', text: 'Hi' }, 'player'))).toEqual(ROLE_ERROR);
    expect(codes(h.plan({ type: 'addStoryNote', text: '' }))).toEqual(['TEXT_REQUIRED']);
    const [added] = h.run({ type: 'addStoryNote', text: 'Owes the ferryman a favor.' });
    const id = added?.id ?? '';
    expect(h.sheet().storyNotes).toEqual([
      {
        id,
        text: 'Owes the ferryman a favor.',
        source: 'note',
        addedAt: AT,
        by: { role: 'staff', name: 'Test Staff' },
      },
    ]);
    expect(codes(h.plan({ type: 'editStoryNote', noteId: 'nope', text: 'X' }))).toEqual([
      'STORY_NOTE_NOT_FOUND',
    ]);
    expect(
      codes(h.plan({ type: 'editStoryNote', noteId: id, text: 'Owes the ferryman a favor.' })),
    ).toEqual(['NOTHING_CHANGED']);
    expect(codes(h.plan({ type: 'editStoryNote', noteId: id, text: 'X' }, 'player'))).toEqual(
      ROLE_ERROR,
    );
    const [edited] = h.run({ type: 'editStoryNote', noteId: id, text: 'Paid the ferryman.' });
    expect(edited?.payload).toEqual({
      noteId: id,
      text: 'Paid the ferryman.',
      fromText: 'Owes the ferryman a favor.',
    });
    expect(h.sheet().storyNotes[0]).toMatchObject({ id, text: 'Paid the ferryman.' });
    expect(codes(h.plan({ type: 'removeStoryNote', noteId: id }, 'player'))).toEqual(ROLE_ERROR);
    const [removed] = h.run({ type: 'removeStoryNote', noteId: id, reason: 'Settled' });
    expect(removed?.payload).toEqual({ noteId: id, reason: 'Settled', text: 'Paid the ferryman.' });
    expect(h.sheet().storyNotes).toEqual([]);
    expect(codes(h.plan({ type: 'removeStoryNote', noteId: id }))).toEqual([
      'STORY_NOTE_NOT_FOUND',
    ]);
  });

  it('story notes can still change after retirement', () => {
    const h = withCharacter();
    h.run({ type: 'retireCharacter', reason: 'Moved away' });
    const [added] = h.run({ type: 'addStoryNote', text: 'Runs the tea house now.' });
    h.run({ type: 'editStoryNote', noteId: added?.id ?? '', text: 'Runs the inn now.' });
    const sheet = h.sheet();
    expect(sheet.storyNotes.map((n) => n.text)).toEqual(['Runs the inn now.']);
    expect(sheet.warnings).toEqual([]);
  });

  it('the old profile notes text is one story note', () => {
    const h = withCharacter();
    const first = push(
      h,
      'profile.updated',
      { notes: 'Owes the ferryman.' },
      {
        role: 'staff',
        name: 'Old Staff',
      },
    );
    expect(h.sheet().storyNotes).toEqual([
      {
        id: first.id,
        text: 'Owes the ferryman.',
        source: 'note',
        addedAt: AT,
        by: { role: 'staff', name: 'Old Staff' },
      },
    ]);
    expect(h.sheet().profile.notes).toBe('Owes the ferryman.');
    // A later notes text changes the same note.
    h.run({ type: 'addStoryNote', text: 'Second note' });
    h.run({ type: 'updateProfile', notes: 'Paid the ferryman.' });
    expect(h.sheet().storyNotes.map((n) => [n.id, n.text])).toEqual([
      [first.id, 'Paid the ferryman.'],
      [h.actions.at(-2)?.id, 'Second note'],
    ]);
    // Story note commands edit it too, and the old field follows.
    h.run({ type: 'editStoryNote', noteId: first.id, text: 'Ferryman paid in full.' });
    expect(h.sheet().profile.notes).toBe('Ferryman paid in full.');
    // Blank notes text removes it.
    push(h, 'profile.updated', { notes: '' });
    expect(h.sheet().storyNotes.map((n) => n.text)).toEqual(['Second note']);
    expect(h.sheet().profile.notes).toBe('');
    // Removed with removeStoryNote, a new notes text adds a new note.
    const again = push(h, 'profile.updated', { notes: 'New start.' });
    h.run({ type: 'removeStoryNote', noteId: again.id });
    expect(h.sheet().profile.notes).toBe('');
    const third = push(h, 'profile.updated', { notes: 'Third time.' });
    expect(h.sheet().storyNotes.map((n) => n.id)).toEqual([h.actions[2]?.id, third.id]);
    expect(h.sheet().warnings).toEqual([]);
  });

  it('every recorded knowledge is a story note; new knowledges are refused', () => {
    const h = withCharacter();
    const k = push(
      h,
      'memorized.added',
      { kind: 'knowledge', text: 'Old river songs', slot: 'none' },
      { role: 'staff', name: 'Old Staff' },
    );
    push(h, 'storyNote.added', { text: 'A plain note' });
    const k2 = push(h, 'memorized.added', { kind: 'knowledge', text: 'Swamp herbs', slot: 'none' });
    let sheet = h.sheet();
    expect(sheet.storyNotes.map((n) => [n.id, n.source, n.text])).toEqual([
      [k.id, 'knowledge', 'Old river songs'],
      [h.actions[2]?.id, 'note', 'A plain note'],
      [k2.id, 'knowledge', 'Swamp herbs'],
    ]);
    expect(sheet.storyNotes[0]?.by).toEqual({ role: 'staff', name: 'Old Staff' });
    expect(sheet.memory.entries.filter((e) => e.kind === 'knowledge')).toHaveLength(2);
    expect(codes(h.plan({ type: 'memorize', kind: 'knowledge', text: 'New' }))).toEqual([
      'KNOWLEDGE_IS_STORY_NOTE',
    ]);

    // Editing or removing the story note keeps the old memory entry in step.
    h.run({ type: 'editStoryNote', noteId: k.id, text: 'Old river songs, all verses' });
    sheet = h.sheet();
    expect(sheet.memory.entries.find((e) => e.actionId === k.id)).toMatchObject({
      name: 'Old river songs, all verses',
      text: 'Old river songs, all verses',
    });
    h.run({ type: 'removeStoryNote', noteId: k.id });
    expect(h.sheet().memory.entries.some((e) => e.actionId === k.id)).toBe(false);

    // Forgetting an old knowledge removes its story note.
    h.run({ type: 'forgetMemorized', entryId: k2.id });
    sheet = h.sheet();
    expect(sheet.storyNotes.map((n) => n.text)).toEqual(['A plain note']);
    expect(sheet.warnings).toEqual([]);
  });

  it('replay warns about edits and removals of unknown story notes', () => {
    const h = withCharacter();
    push(h, 'storyNote.edited', { noteId: 'missing', text: 'X' });
    push(h, 'storyNote.removed', { noteId: 'missing' });
    expect(h.sheet().warnings.map((w) => w.code)).toEqual([
      'STORY_NOTE_NOT_FOUND',
      'STORY_NOTE_NOT_FOUND',
    ]);
  });

  it('an empty log has no traumas or story notes', () => {
    const sheet = deriveSheet(rs, []);
    expect(sheet.traumas).toEqual([]);
    expect(sheet.storyNotes).toEqual([]);
  });
});

function base() {
  return {
    type: 'createCharacter' as const,
    characterName: 'Mara Quill',
    playerName: 'Sample Player',
    ancestryId: 'human',
    subtypeId: 'human-wastelander',
  };
}
