// storyNote.added / storyNote.edited / storyNote.removed: visible story notes on a character.
// Sheet.storyNotes also lists the old profile notes text (profile.updated) and every free-text
// knowledge (memorized.added); editing or removing those goes through these actions too.
// Allowed after retirement, like the old notes field.
import { z } from 'zod';
import { noteAuthor, warn, type Draft } from '../derive/draft.ts';
import { IdSchema } from '../model.ts';
import { defineAction } from './define.ts';

export const StoryNoteTextSchema = z.string().trim().min(1).max(5000);

export const StoryNoteAddedPayload = z.object({ text: StoryNoteTextSchema });
export type StoryNoteAddedPayload = z.infer<typeof StoryNoteAddedPayload>;

export const StoryNoteEditedPayload = z.object({
  /** The story note's id (the action that added it). */
  noteId: IdSchema,
  text: StoryNoteTextSchema,
  /** Text before the change, for reading history. */
  fromText: z.string().max(5000).optional(),
});
export type StoryNoteEditedPayload = z.infer<typeof StoryNoteEditedPayload>;

export const StoryNoteRemovedPayload = z.object({
  noteId: IdSchema,
  reason: z.string().trim().max(2000).optional(),
  /** Text of the removed note, for reading history. */
  text: z.string().max(5000).optional(),
});
export type StoryNoteRemovedPayload = z.infer<typeof StoryNoteRemovedPayload>;

function findNote(draft: Draft, noteId: string): number {
  return draft.storyNotes.findIndex((n) => n.id === noteId);
}

export const storyNoteAdded = defineAction({
  type: 'storyNote.added',
  payload: StoryNoteAddedPayload,
  apply(draft, p, action) {
    draft.storyNotes.push({
      id: action.id,
      text: p.text,
      source: 'note',
      addedAt: action.at,
      by: noteAuthor(action),
    });
  },
  allowedWhenRetired: () => true,
});

export const storyNoteEdited = defineAction({
  type: 'storyNote.edited',
  payload: StoryNoteEditedPayload,
  apply(draft, p, action) {
    const index = findNote(draft, p.noteId);
    const note = draft.storyNotes[index];
    if (!note) {
      warn(
        draft,
        action.id,
        'STORY_NOTE_NOT_FOUND',
        `No story note "${p.noteId}" to edit; skipped.`,
      );
      return;
    }
    draft.storyNotes[index] = { ...note, text: p.text };
    if (note.source === 'knowledge') {
      const m = draft.memory.findIndex((e) => e.actionId === note.id);
      const entry = draft.memory[m];
      if (entry) draft.memory[m] = { ...entry, name: p.text, text: p.text };
    }
  },
  allowedWhenRetired: () => true,
});

export const storyNoteRemoved = defineAction({
  type: 'storyNote.removed',
  payload: StoryNoteRemovedPayload,
  apply(draft, p, action) {
    const index = findNote(draft, p.noteId);
    const note = draft.storyNotes[index];
    if (!note) {
      warn(
        draft,
        action.id,
        'STORY_NOTE_NOT_FOUND',
        `No story note "${p.noteId}" to remove; skipped.`,
      );
      return;
    }
    draft.storyNotes.splice(index, 1);
    if (draft.legacyNotesId === note.id) draft.legacyNotesId = null;
    if (note.source === 'knowledge') {
      const m = draft.memory.findIndex((e) => e.actionId === note.id);
      if (m >= 0) draft.memory.splice(m, 1);
    }
  },
  allowedWhenRetired: () => true,
});
