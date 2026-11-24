// Traumas and story notes. Staff only (plan() refuses players, as it did for the old notes field).
// - addTrauma / editTrauma / removeTrauma: short text tied to infection ([PLAY-TRAUMA]); removing
//   needs a reason. changeInfection can also record a trauma in the same plan.
// - addStoryNote / editStoryNote / removeStoryNote: visible story notes. Edit and remove also work
//   on the old profile notes text and on knowledges, which Sheet.storyNotes lists too. Story notes
//   can still change after the character retires.
import { z } from 'zod';
import { ruleError, RULE_IDS } from '../errors.ts';
import { EventKeySchema, IdSchema } from '../model.ts';
import type { Sheet } from '../sheet.ts';
import { defineCommand, evaluation, type Evaluation } from './define.ts';
import { OptionalText } from './helpers.ts';

const TRAUMA_RULE = 'PLAY-TRAUMA';
const NOTE_RULE = RULE_IDS.command;
export const TRAUMA_MAX = 500;
export const STORY_NOTE_MAX = 5000;

const TraumaText = z.string().trim().max(TRAUMA_MAX).optional();
const NoteText = z.string().trim().max(STORY_NOTE_MAX).optional();
const Reason = z.string().trim().max(2000).optional();

export const AddTraumaCommand = z.object({
  type: z.literal('addTrauma'),
  text: TraumaText,
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type AddTraumaCommand = z.input<typeof AddTraumaCommand>;

export const EditTraumaCommand = z.object({
  type: z.literal('editTrauma'),
  /** A trauma id from sheet.traumas. */
  traumaId: IdSchema,
  text: TraumaText,
  note: OptionalText,
});
export type EditTraumaCommand = z.input<typeof EditTraumaCommand>;

export const RemoveTraumaCommand = z.object({
  type: z.literal('removeTrauma'),
  traumaId: IdSchema,
  reason: Reason,
  note: OptionalText,
});
export type RemoveTraumaCommand = z.input<typeof RemoveTraumaCommand>;

export const AddStoryNoteCommand = z.object({
  type: z.literal('addStoryNote'),
  text: NoteText,
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type AddStoryNoteCommand = z.input<typeof AddStoryNoteCommand>;

export const EditStoryNoteCommand = z.object({
  type: z.literal('editStoryNote'),
  /** A story note id from sheet.storyNotes. */
  noteId: IdSchema,
  text: NoteText,
  note: OptionalText,
});
export type EditStoryNoteCommand = z.input<typeof EditStoryNoteCommand>;

export const RemoveStoryNoteCommand = z.object({
  type: z.literal('removeStoryNote'),
  noteId: IdSchema,
  reason: Reason,
  note: OptionalText,
});
export type RemoveStoryNoteCommand = z.input<typeof RemoveStoryNoteCommand>;

/** Pushes TEXT_REQUIRED when `text` is blank; returns the trimmed text. */
function requireText(ev: Evaluation, text: string | undefined, what: string, rule: string): string {
  const value = text ?? '';
  if (value === '') ev.errors.push(ruleError('TEXT_REQUIRED', `Type the ${what}.`, rule));
  return value;
}

function findTrauma(ev: Evaluation, sheet: Sheet, id: string) {
  const trauma = sheet.traumas.find((t) => t.id === id);
  if (!trauma)
    ev.errors.push(ruleError('TRAUMA_NOT_FOUND', 'That trauma is not on this sheet.', TRAUMA_RULE));
  return trauma;
}

function findNote(ev: Evaluation, sheet: Sheet, id: string) {
  const note = sheet.storyNotes.find((n) => n.id === id);
  if (!note)
    ev.errors.push(
      ruleError('STORY_NOTE_NOT_FOUND', 'That story note is not on this sheet.', NOTE_RULE),
    );
  return note;
}

export const addTrauma = defineCommand<z.output<typeof AddTraumaCommand>>({
  type: 'addTrauma',
  schema: AddTraumaCommand,
  evaluate(_ruleset, _sheet, cmd, builder) {
    const ev = evaluation();
    const text = requireText(ev, cmd.text, 'trauma', TRAUMA_RULE);
    if (ev.errors.length > 0) return ev;
    builder.add('trauma.added', { text }, { eventKey: cmd.eventKey, note: cmd.note });
    return ev;
  },
});

export const editTrauma = defineCommand<z.output<typeof EditTraumaCommand>>({
  type: 'editTrauma',
  schema: EditTraumaCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const trauma = findTrauma(ev, sheet, cmd.traumaId);
    const text = requireText(ev, cmd.text, 'trauma', TRAUMA_RULE);
    if (trauma && text !== '' && text === trauma.text)
      ev.errors.push(ruleError('NOTHING_CHANGED', 'Nothing changed.', TRAUMA_RULE));
    if (ev.errors.length > 0 || !trauma) return ev;
    builder.add(
      'trauma.edited',
      { traumaId: trauma.id, text, fromText: trauma.text },
      { note: cmd.note },
    );
    return ev;
  },
});

export const removeTrauma = defineCommand<z.output<typeof RemoveTraumaCommand>>({
  type: 'removeTrauma',
  schema: RemoveTraumaCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const trauma = findTrauma(ev, sheet, cmd.traumaId);
    const reason = cmd.reason ?? '';
    if (reason === '')
      ev.errors.push(
        ruleError('REASON_REQUIRED', 'Removing a trauma needs a reason.', TRAUMA_RULE),
      );
    if (ev.errors.length > 0 || !trauma) return ev;
    builder.add(
      'trauma.removed',
      { traumaId: trauma.id, reason, text: trauma.text },
      { note: cmd.note },
    );
    return ev;
  },
});

export const addStoryNote = defineCommand<z.output<typeof AddStoryNoteCommand>>({
  type: 'addStoryNote',
  schema: AddStoryNoteCommand,
  evaluate(_ruleset, _sheet, cmd, builder) {
    const ev = evaluation();
    const text = requireText(ev, cmd.text, 'story note', NOTE_RULE);
    if (ev.errors.length > 0) return ev;
    builder.add('storyNote.added', { text }, { eventKey: cmd.eventKey, note: cmd.note });
    return ev;
  },
  allowedWhenRetired: () => true,
});

export const editStoryNote = defineCommand<z.output<typeof EditStoryNoteCommand>>({
  type: 'editStoryNote',
  schema: EditStoryNoteCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const note = findNote(ev, sheet, cmd.noteId);
    const text = requireText(ev, cmd.text, 'story note', NOTE_RULE);
    if (note && text !== '' && text === note.text)
      ev.errors.push(ruleError('NOTHING_CHANGED', 'Nothing changed.', NOTE_RULE));
    if (ev.errors.length > 0 || !note) return ev;
    builder.add(
      'storyNote.edited',
      { noteId: note.id, text, fromText: note.text },
      { note: cmd.note },
    );
    return ev;
  },
  allowedWhenRetired: () => true,
});

export const removeStoryNote = defineCommand<z.output<typeof RemoveStoryNoteCommand>>({
  type: 'removeStoryNote',
  schema: RemoveStoryNoteCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const note = findNote(ev, sheet, cmd.noteId);
    if (ev.errors.length > 0 || !note) return ev;
    builder.add(
      'storyNote.removed',
      {
        noteId: note.id,
        ...(cmd.reason ? { reason: cmd.reason } : {}),
        text: note.text,
      },
      { note: cmd.note },
    );
    return ev;
  },
  allowedWhenRetired: () => true,
});
