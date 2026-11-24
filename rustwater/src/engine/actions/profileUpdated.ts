// profile.updated: changed identity and free-text fields only. Age is a step 1 to 10 (`ageStep`);
// old logs stored years in `age`, which replay converts ([ANC-AGE]). The old `notes` text becomes
// one story note: the first notes text adds it, later ones change its text, '' removes it.
import { z } from 'zod';
import { noteAuthor, type Draft } from '../derive/draft.ts';
import type { Action } from '../model.ts';
import { AgeStepSchema, AgeYearsSchema, ageStepFromYears } from '../rules/age.ts';
import { defineAction, NameSchema } from './define.ts';

export const ProfileUpdatedPayload = z
  .object({
    characterName: NameSchema.optional(),
    playerName: NameSchema.optional(),
    /** null clears the email. */
    playerEmail: z.string().trim().max(320).nullable().optional(),
    /** Age step 1 to 10; null clears the age. Wins over `age` when both are present. */
    ageStep: AgeStepSchema.nullable().optional(),
    /** Old logs only: age in years (null clears it), converted to a step on replay. */
    age: AgeYearsSchema.nullable().optional(),
    effects: z.string().max(5000).optional(),
    /** Old logs and the old notes field: kept as one story note. */
    notes: z.string().max(5000).optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), 'Change at least one field.');
export type ProfileUpdatedPayload = z.infer<typeof ProfileUpdatedPayload>;

/**
 * Sets the draft age from a step, or from old-style years converted with the ancestry's maximum
 * age. Does nothing when both are undefined; null clears the age.
 */
export function replayAge(
  draft: Draft,
  step: number | null | undefined,
  years: number | null | undefined,
): void {
  if (step !== undefined) {
    draft.profile.age = step;
    return;
  }
  if (years === undefined) return;
  if (years === null) {
    draft.profile.age = null;
    return;
  }
  // Aware do not age and Cryptid max ages are set by a GM: no step, as before (no warning, so
  // old logs and sheet imports still replay cleanly). Staff can set the step on the profile.
  draft.profile.age = ageStepFromYears(draft.ruleset, draft.ancestryId, years);
}

/** Applies the old profile `notes` text to the story note that holds it. */
function replayLegacyNotes(draft: Draft, action: Action, text: string): void {
  const index =
    draft.legacyNotesId === null
      ? -1
      : draft.storyNotes.findIndex((n) => n.id === draft.legacyNotesId);
  const trimmed = text.trim();
  if (index < 0) {
    draft.legacyNotesId = null;
    if (trimmed === '') return;
    draft.storyNotes.push({
      id: action.id,
      text,
      source: 'note',
      addedAt: action.at,
      by: noteAuthor(action),
    });
    draft.legacyNotesId = action.id;
    return;
  }
  if (trimmed === '') {
    draft.storyNotes.splice(index, 1);
    draft.legacyNotesId = null;
    return;
  }
  const note = draft.storyNotes[index];
  if (note) draft.storyNotes[index] = { ...note, text };
}

export const profileUpdated = defineAction({
  type: 'profile.updated',
  payload: ProfileUpdatedPayload,
  apply(draft, p, action) {
    const profile = draft.profile;
    if (p.characterName !== undefined) profile.characterName = p.characterName;
    if (p.playerName !== undefined) profile.playerName = p.playerName;
    if (p.playerEmail !== undefined) profile.playerEmail = p.playerEmail || null;
    replayAge(draft, p.ageStep, p.age);
    if (p.effects !== undefined) profile.effects = p.effects;
    if (p.notes !== undefined) replayLegacyNotes(draft, action, p.notes);
  },
  /** A retired character's notes can still be edited. */
  allowedWhenRetired: (p) =>
    Object.entries(p).every(([key, value]) => key === 'notes' || value === undefined),
});
